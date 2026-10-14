import { test, expect } from '@playwright/test';
import { BASE_URL } from '../../common/setup/auth.setup';
import {
  GC_COPY,
  SCHOOL_ID,
  buildArchivedClass,
  buildProvisionItem,
  educatorUser,
  mockGoogleClassroom,
  seedEducatorSession,
  stubAllApis,
  toastText,
} from '../../common/utils/googleClassroomHelpers';

const CONNECTED = {
  connected: true,
  status: 'active' as const,
  googleAccountEmail: 'teacher@school.test',
};

test.describe('Regression — Google Classroom (mocked)', () => {
  test.setTimeout(120_000);

  test('TC-01: an errored OAuth callback shows the mapped reason and stays disconnected', async ({
    page,
  }) => {
    await stubAllApis(page);
    await seedEducatorSession(page, educatorUser());
    const gc = await mockGoogleClassroom(page);

    await page.goto(
      `${BASE_URL}/google-classroom?googleClassroom=error&reason=provider_denied&schoolId=${SCHOOL_ID}`,
      { waitUntil: 'domcontentloaded' }
    );

    await expect(
      toastText(page, GC_COPY.errorProviderDenied),
      'TC-01 FAIL: the denied-consent reason was not surfaced as an error toast.'
    ).toBeVisible({ timeout: 30_000 });

    await expect
      .poll(() => page.url(), {
        message:
          'TC-01 FAIL: the error callback params were not cleaned from the URL.',
        timeout: 20_000,
      })
      .not.toContain('googleClassroom=');

    expect(
      gc.calls('POST /provision'),
      'TC-01 FAIL: courses were provisioned despite a failed connect.'
    ).toBe(0);
  });

  test('TC-02: an unknown error reason falls back to the generic connect message', async ({
    page,
  }) => {
    await stubAllApis(page);
    await seedEducatorSession(page, educatorUser());
    await mockGoogleClassroom(page);

    await page.goto(
      `${BASE_URL}/google-classroom?googleClassroom=error&reason=who_knows`,
      {
        waitUntil: 'domcontentloaded',
      }
    );

    await expect(
      toastText(page, GC_COPY.errorCallback),
      'TC-02 FAIL: an unmapped reason did not fall back to the generic message.'
    ).toBeVisible({ timeout: 30_000 });
  });

  test('TC-03: disconnecting reports success and switches to the Archived tab', async ({
    page,
  }) => {
    await stubAllApis(page);
    await seedEducatorSession(page, educatorUser());
    await mockGoogleClassroom(page, {
      connection: CONNECTED,
      provision: {
        items: [
          buildProvisionItem({
            id: 'gc-301',
            name: 'Algebra II',
            classId: 'cls-301',
          }),
        ],
      },
      archived: [
        buildArchivedClass({ classId: 'cls-900', className: 'Retired Course' }),
      ],
    });

    await page.goto(`${BASE_URL}/google-classroom`, {
      waitUntil: 'domcontentloaded',
    });

    const disconnect = page.getByRole('button', {
      name: GC_COPY.disconnect,
      exact: true,
    });
    await expect(disconnect).toBeVisible({ timeout: 30_000 });
    await disconnect.click();

    await expect(
      toastText(page, GC_COPY.disconnectSuccess),
      'TC-03 FAIL: no success toast after disconnecting.'
    ).toBeVisible({ timeout: 30_000 });

    await expect(
      page.getByRole('tab', { name: new RegExp(GC_COPY.tabArchived) }),
      'TC-03 FAIL: the Archived tab was not selected after disconnecting.'
    ).toHaveAttribute('aria-selected', 'true', { timeout: 20_000 });

    await expect(
      page.getByRole('button', { name: GC_COPY.connect, exact: true }),
      'TC-03 FAIL: the panel still offers Disconnect after disconnecting.'
    ).toBeVisible({ timeout: 20_000 });
  });

  test('TC-04: unlinking a course archives it and removes it from the courses list', async ({
    page,
  }) => {
    await stubAllApis(page);
    await seedEducatorSession(page, educatorUser());
    const gc = await mockGoogleClassroom(page, {
      connection: CONNECTED,
      provision: {
        items: [
          buildProvisionItem({
            id: 'gc-401',
            name: 'Physics Honors',
            classId: 'cls-401',
            linked: true,
            mappingId: 'mapping-401',
          }),
        ],
      },
    });

    await page.goto(`${BASE_URL}/google-classroom`, {
      waitUntil: 'domcontentloaded',
    });

    const courseRow = page
      .getByRole('listitem')
      .filter({ hasText: 'Physics Honors' });
    await expect(courseRow).toBeVisible({ timeout: 30_000 });
    await courseRow
      .getByRole('button', { name: GC_COPY.unlink, exact: true })
      .click();

    await expect(
      toastText(page, GC_COPY.unlinkSuccess),
      'TC-04 FAIL: no success toast after unlinking.'
    ).toBeVisible({ timeout: 30_000 });

    await expect(
      page.getByRole('listitem').filter({ hasText: 'Physics Honors' }),
      'TC-04 FAIL: the unlinked course is still listed under Courses.'
    ).toHaveCount(0, { timeout: 20_000 });

    expect(
      gc.calls('DELETE /course-mappings/:id'),
      'TC-04 FAIL: the unlink request was not sent.'
    ).toBe(1);
  });

  test('TC-05: re-sync reports up to date when nothing is new, and opens the modal when something is', async ({
    page,
  }) => {
    await stubAllApis(page);
    await seedEducatorSession(page, educatorUser());
    const gc = await mockGoogleClassroom(page, {
      connection: CONNECTED,
      provision: {
        items: [
          buildProvisionItem({
            id: 'gc-501',
            name: 'Latin I',
            classId: 'cls-501',
            isNew: false,
          }),
        ],
      },
    });

    await page.goto(`${BASE_URL}/google-classroom`, {
      waitUntil: 'domcontentloaded',
    });

    const resync = page.getByRole('button', { name: GC_COPY.resyncCourses });
    await expect(resync).toBeVisible({ timeout: 30_000 });

    await expect(
      page.getByRole('dialog'),
      'TC-05 FAIL: the link modal opened on load even though no course was new.'
    ).toHaveCount(0);

    await resync.click();
    await expect(
      toastText(page, GC_COPY.coursesUpToDate),
      'TC-05 FAIL: re-syncing with no new courses did not report "up to date".'
    ).toBeVisible({ timeout: 30_000 });

    gc.setProvision({
      items: [
        buildProvisionItem({
          id: 'gc-501',
          name: 'Latin I',
          classId: 'cls-501',
          isNew: false,
        }),
        buildProvisionItem({
          id: 'gc-502',
          name: 'Latin II',
          classId: 'cls-502',
          isNew: true,
        }),
      ],
      newCount: 1,
    });

    await resync.click();
    const modal = page.getByRole('dialog');
    await expect(
      modal,
      'TC-05 FAIL: re-syncing with a new course did not open the link modal.'
    ).toBeVisible({ timeout: 30_000 });
    await expect(
      modal.getByText('Latin II', { exact: false }).first()
    ).toBeVisible();
  });

  test('TC-06: syncing a roster reports success and updates the last-synced line', async ({
    page,
  }) => {
    await stubAllApis(page);
    await seedEducatorSession(page, educatorUser());
    await mockGoogleClassroom(page, {
      connection: CONNECTED,
      provision: {
        items: [
          buildProvisionItem({
            id: 'gc-601',
            name: 'Civics',
            classId: 'cls-601',
            linked: true,
            mappingId: 'mapping-601',
          }),
        ],
      },
    });

    await page.goto(`${BASE_URL}/google-classroom`, {
      waitUntil: 'domcontentloaded',
    });

    const courseRow = page.getByRole('listitem').filter({ hasText: 'Civics' });
    await expect(courseRow).toBeVisible({ timeout: 30_000 });
    await expect(
      courseRow.getByText('Roster not synced yet'),
      'TC-06 FAIL: a never-synced course did not say so.'
    ).toBeVisible();

    await courseRow
      .getByRole('button', { name: GC_COPY.syncRoster, exact: true })
      .click();

    await expect(
      toastText(page, GC_COPY.rosterSyncSuccess),
      'TC-06 FAIL: no success toast after syncing the roster.'
    ).toBeVisible({ timeout: 30_000 });
    await expect(
      courseRow.getByText('Last synced', { exact: false }),
      'TC-06 FAIL: the last-synced line did not update after the sync.'
    ).toBeVisible({ timeout: 20_000 });
  });

  test('TC-07: an archived class can be relinked and lands back under Courses', async ({
    page,
  }) => {
    await stubAllApis(page);
    await seedEducatorSession(page, educatorUser());
    const gc = await mockGoogleClassroom(page, {
      connection: CONNECTED,
      provision: { items: [] },
      archived: [
        buildArchivedClass({
          classId: 'cls-701',
          className: 'Studio Art',
          googleCourseId: 'gc-701',
          googleCourseName: 'Studio Art (Google)',
        }),
      ],
    });

    await page.goto(`${BASE_URL}/google-classroom`, {
      waitUntil: 'domcontentloaded',
    });

    await page
      .getByRole('tab', { name: new RegExp(GC_COPY.tabArchived) })
      .click();

    const archivedRow = page
      .getByRole('listitem')
      .filter({ hasText: 'Studio Art' });
    await expect(
      archivedRow,
      'TC-07 FAIL: the archived class was not listed.'
    ).toBeVisible({ timeout: 30_000 });

    gc.setProvision({
      items: [
        buildProvisionItem({
          id: 'gc-701',
          name: 'Studio Art (Google)',
          classId: 'cls-701',
          linked: true,
          mappingId: 'mapping-gc-701',
        }),
      ],
    });
    gc.setArchived([]);

    await archivedRow
      .getByRole('button', { name: GC_COPY.relink, exact: true })
      .click();

    await expect(
      toastText(page, GC_COPY.relinkSuccess),
      'TC-07 FAIL: no success toast after relinking.'
    ).toBeVisible({ timeout: 30_000 });

    await expect(
      page.getByRole('tab', { name: GC_COPY.tabCourses, exact: true }),
      'TC-07 FAIL: relinking did not return the user to the Courses tab.'
    ).toHaveAttribute('aria-selected', 'true', { timeout: 20_000 });

    expect(
      gc.lastLinkPayload(),
      'TC-07 FAIL: the relink request did not carry the archived Google course metadata.'
    ).toMatchObject({
      googleCourseId: 'gc-701',
      googleCourseName: 'Studio Art (Google)',
    });
  });

  test('TC-08: an expired token shows the re-authorization banner and hides the courses list', async ({
    page,
  }) => {
    await stubAllApis(page);
    await seedEducatorSession(page, educatorUser());
    const gc = await mockGoogleClassroom(page, {
      connection: {
        connected: true,
        status: 'error',
        googleAccountEmail: 'teacher@school.test',
      },
    });

    await page.goto(`${BASE_URL}/google-classroom`, {
      waitUntil: 'domcontentloaded',
    });

    await expect(
      page
        .locator('p[role="status"]')
        .filter({ hasText: GC_COPY.tokenExpired }),
      'TC-08 FAIL: the re-authorization banner was not shown for an errored connection.'
    ).toBeVisible({ timeout: 30_000 });

    await expect(
      page.getByRole('button', { name: GC_COPY.resyncCourses }),
      'TC-08 FAIL: the courses controls are still usable while re-authorization is required.'
    ).toHaveCount(0);

    expect(
      gc.calls('POST /provision'),
      'TC-08 FAIL: courses were provisioned while the connection needed re-authorization.'
    ).toBe(0);
  });
});
