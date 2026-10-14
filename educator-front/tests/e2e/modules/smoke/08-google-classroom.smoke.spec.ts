import { test, expect } from '@playwright/test';
import { BASE_URL } from '../../common/setup/auth.setup';
import {
  GC_COPY,
  SCHOOL_ID,
  buildProvisionItem,
  educatorUser,
  mockGoogleClassroom,
  seedEducatorSession,
  stubAllApis,
  toastText,
} from '../../common/utils/googleClassroomHelpers';

test.describe('Smoke — Google Classroom (mocked)', () => {
  test.setTimeout(120_000);

  test('TC-01: a school with the feature disabled hides the nav item and cannot open the page', async ({
    page,
  }) => {
    await stubAllApis(page);
    await seedEducatorSession(
      page,
      educatorUser({ googleClassroomEnabled: false })
    );

    await page.goto(`${BASE_URL}/educator-dashboard`, {
      waitUntil: 'domcontentloaded',
    });

    await expect(
      page.getByRole('navigation').getByRole('link', { name: GC_COPY.navItem }),
      'TC-01 FAIL: the Google Classroom nav item is still shown for a disabled school.'
    ).toHaveCount(0, { timeout: 30_000 });

    await page.goto(`${BASE_URL}/google-classroom`, {
      waitUntil: 'domcontentloaded',
    });

    await page.waitForURL(/\/educator-dashboard/, { timeout: 30_000 });
    expect(
      page.url(),
      'TC-01 FAIL: a disabled school was allowed to stay on /google-classroom.'
    ).not.toContain('/google-classroom');
  });

  test('TC-02: returning from Google with googleClassroom=connected shows the success toast and the connected account', async ({
    page,
  }) => {
    await stubAllApis(page);
    await seedEducatorSession(page, educatorUser());
    const gc = await mockGoogleClassroom(page, {
      connection: {
        connected: true,
        status: 'active',
        googleAccountEmail: 'teacher@school.test',
      },
    });

    await page.goto(
      `${BASE_URL}/google-classroom?googleClassroom=connected&schoolId=${SCHOOL_ID}`,
      { waitUntil: 'domcontentloaded' }
    );

    await expect(
      toastText(page, GC_COPY.connectSuccess),
      'TC-02 FAIL: no success toast after the connected callback.'
    ).toBeVisible({ timeout: 30_000 });

    await expect(
      page.getByText('Connected as teacher@school.test', { exact: false }),
      'TC-02 FAIL: the connected Google account was not shown.'
    ).toBeVisible({ timeout: 30_000 });

    await expect
      .poll(() => page.url(), {
        message:
          'TC-02 FAIL: the googleClassroom callback param was not cleaned from the URL.',
        timeout: 20_000,
      })
      .not.toContain('googleClassroom=');

    expect(
      gc.calls('POST /connect'),
      'TC-02 FAIL: the test triggered a real Google authorization redirect.'
    ).toBe(0);
  });

  test('TC-03: newly provisioned courses open the link modal and bulk link succeeds', async ({
    page,
  }) => {
    await stubAllApis(page);
    await seedEducatorSession(page, educatorUser());
    const gc = await mockGoogleClassroom(page, {
      connection: {
        connected: true,
        status: 'active',
        googleAccountEmail: 'teacher@school.test',
      },
      provision: {
        items: [
          buildProvisionItem({
            id: 'gc-101',
            name: 'Biology 101',
            classId: 'cls-101',
            isNew: true,
          }),
          buildProvisionItem({
            id: 'gc-102',
            name: 'Chemistry 201',
            classId: 'cls-102',
            isNew: true,
          }),
        ],
        newCount: 2,
      },
    });

    await page.goto(`${BASE_URL}/google-classroom`, {
      waitUntil: 'domcontentloaded',
    });

    const modal = page.getByRole('dialog');
    await expect(
      modal,
      'TC-03 FAIL: the link modal did not open for newly provisioned courses.'
    ).toBeVisible({ timeout: 30_000 });
    await expect(
      modal.getByText('Biology 101', { exact: false }).first()
    ).toBeVisible();

    const linkSelected = modal.getByRole('button', {
      name: `${GC_COPY.linkSelected} (2)`,
    });
    await expect(
      linkSelected,
      'TC-03 FAIL: the modal did not pre-select both new courses.'
    ).toBeEnabled({ timeout: 20_000 });
    await linkSelected.click();

    await expect(
      toastText(page, GC_COPY.bulkLinkSuccess),
      'TC-03 FAIL: no bulk link success toast.'
    ).toBeVisible({ timeout: 30_000 });

    expect(
      gc.lastBulkLinkIds(),
      'TC-03 FAIL: bulk link was not called with both selected courses.'
    ).toEqual(['gc-101', 'gc-102']);
  });

  test('TC-04: linking a single course flips its badge to Linked', async ({
    page,
  }) => {
    await stubAllApis(page);
    await seedEducatorSession(page, educatorUser());
    const gc = await mockGoogleClassroom(page, {
      connection: {
        connected: true,
        status: 'active',
        googleAccountEmail: 'teacher@school.test',
      },
      provision: {
        items: [
          buildProvisionItem({
            id: 'gc-201',
            name: 'World History',
            classId: 'cls-201',
            isNew: false,
          }),
        ],
      },
    });

    await page.goto(`${BASE_URL}/google-classroom`, {
      waitUntil: 'domcontentloaded',
    });

    const courseRow = page
      .getByRole('listitem')
      .filter({ hasText: 'World History' });
    await expect(
      courseRow,
      'TC-04 FAIL: the provisioned course was not listed.'
    ).toBeVisible({ timeout: 30_000 });
    await expect(
      courseRow.getByText(GC_COPY.notLinked, { exact: true })
    ).toBeVisible();

    await courseRow
      .getByRole('button', { name: GC_COPY.link, exact: true })
      .click();

    await expect(
      toastText(page, GC_COPY.linkSuccess),
      'TC-04 FAIL: no success toast after linking the course.'
    ).toBeVisible({ timeout: 30_000 });
    await expect(
      courseRow.getByText(GC_COPY.linked, { exact: true }),
      'TC-04 FAIL: the course badge did not flip to Linked.'
    ).toBeVisible({ timeout: 20_000 });

    expect(
      gc.lastLinkPayload(),
      'TC-04 FAIL: the link request did not carry the Google course metadata.'
    ).toMatchObject({
      googleCourseId: 'gc-201',
      googleCourseName: 'World History',
    });
  });
});
