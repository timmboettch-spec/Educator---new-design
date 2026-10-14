import { type Page, expect } from '@playwright/test';
import { schoolLocators } from '../locators/schoolLocators';
import { BasePage } from './base/BasePage';

export class SchoolPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  private schoolRow(name: string) {
    return this.page
      .locator('div[class*="grid"], div[class*="rounded"], tr')
      .filter({ hasText: name })
      .first();
  }

  private schoolFormDialog() {
    return this.page.locator('[role="dialog"]:has(form#school-form)').first();
  }

  private async openCreateSchoolDialog(): Promise<void> {
    const addBtn = this.page.locator(schoolLocators.addSchoolButton).first();
    const isVisible = await addBtn
      .waitFor({ state: 'visible', timeout: 15000 })
      .then(() => true)
      .catch(() => false);
    if (!isVisible) {
      await this.page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
      await this.page
        .waitForLoadState('networkidle', { timeout: 10000 })
        .catch(() => {});
      await addBtn.waitFor({ state: 'visible', timeout: 15000 });
    }
    await addBtn.evaluate((el) => (el as HTMLElement).click());
    await this.schoolFormDialog().waitFor({ state: 'visible', timeout: 15000 });
  }

  private async requestSubmitSchoolForm(): Promise<void> {
    await this.schoolFormDialog()
      .locator('#school-form')
      .evaluate((form) => {
        (form as HTMLFormElement).requestSubmit();
      });
  }

  async navigateToSchools(): Promise<void> {
    const currentUrl = this.page.url();

    // If already on schools, reload to ensure fresh data (e.g. after a delete).
    if (/school/i.test(currentUrl)) {
      await this.page.reload();
      await this.waitForLoadState('networkidle').catch(() => {});
      return;
    }

    // From dashboard (or other authenticated pages), navigate via Schools link.
    // Wait for visibility first - sidebar may be hidden or overlay present after other tests
    const link = this.page.locator(schoolLocators.schoolsLink).first();
    await link.waitFor({ state: 'visible', timeout: 15000 }).catch(() => {});
    await this.click(schoolLocators.schoolsLink);
    await this.waitForUrl(/school/i, 30000);
    await this.waitForLoadState('load');
    // Brief networkidle wait so React mounts before createSchool clicks Add School
    await this.page
      .waitForLoadState('networkidle', { timeout: 5000 })
      .catch(() => {});
  }

  async schoolvalidation(): Promise<void> {
    // Legacy comprehensive validation exists; for smoke tests use the positive creation flow
    return this.createSchoolPositive();
  }

  async createSchool(schoolName?: string): Promise<string> {
    const finalName = schoolName ?? `ABC${Math.floor(Math.random() * 100000)}`;

    await this.openCreateSchoolDialog();
    const dialog = this.schoolFormDialog();
    await dialog.locator('input[name="school_name"]').fill(finalName);
    // Default Formik status is ACTIVE — no status dropdown interaction (portaled listbox + Escape closes modal).

    // Wait for the POST request itself, not just a response: on the shared
    // preview a submit has been swallowed (no request, form left as filled), and
    // a request that fails at the network level never produces a response.
    const waitForCreateRequest = () =>
      this.page
        .waitForRequest(
          (req) => req.method() === 'POST' && /\/schools\b/i.test(req.url()),
          { timeout: 15000 }
        )
        .catch(() => null);
    let requestPromise = waitForCreateRequest();
    await this.requestSubmitSchoolForm();
    let request = await requestPromise;
    if (!request) {
      requestPromise = waitForCreateRequest();
      await this.requestSubmitSchoolForm();
      request = await requestPromise;
    }
    if (!request) {
      throw new Error(
        'Create school form was submitted but no request was sent'
      );
    }
    const response = await request.response();
    if (!response) {
      throw new Error(
        `Create school request failed: ${request.failure()?.errorText ?? 'no response'}`
      );
    }
    if (!response.ok()) {
      const body = await response.text().catch(() => '');
      throw new Error(
        `Create school failed (${response.status()}): ${body.slice(0, 300)}`
      );
    }
    await dialog.waitFor({ state: 'hidden', timeout: 30000 }).catch(() => {});
    await this.page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
    await this.page.waitForLoadState('domcontentloaded').catch(() => {});
    // Search by name so pagination does not hide the newly created school
    await this.waitForListRows();
    const searchBox = this.page.locator('input[placeholder*="Search"]').first();
    if (await searchBox.isVisible({ timeout: 5000 }).catch(() => false)) {
      await searchBox.fill(finalName);
      await this.page.waitForTimeout(1000);
    }
    await this.expectTextVisible(finalName, 30000);

    return finalName;
  }

  async submitCreateSchoolEmptyName(): Promise<void> {
    await this.openCreateSchoolDialog();
    const dialog = this.schoolFormDialog();
    await dialog.locator('input[name="school_name"]').fill('');
    await this.requestSubmitSchoolForm();

    await this.expectTextVisible(/school name.*required|required/i);
    await dialog
      .locator('input[name="school_name"]')
      .waitFor({ state: 'visible' });
  }

  async closeSchoolFormIfOpen(): Promise<void> {
    const backButton = this.page.locator(schoolLocators.backButton).first();
    if (await backButton.isVisible().catch(() => false)) {
      await backButton.click();
      return;
    }

    // Fallback: close modal/drawer with Escape if there is no explicit back button.
    await this.page.keyboard.press('Escape').catch(() => {});
  }

  // Positive-only school creation for smoke tests
  async createSchoolPositive(): Promise<void> {
    await this.navigateToSchools();
    await this.createSchool();
  }

  async updateSchoolName(oldName: string, newName: string): Promise<void> {
    await this.openSchoolEdit(oldName);
    const dialog = this.schoolFormDialog();
    await dialog.locator('input[name="school_name"]').fill(newName);
    const responsePromise = this.page.waitForResponse(
      (res) =>
        ['PUT', 'PATCH'].includes(res.request().method()) &&
        /\/schools\b/i.test(res.url()),
      { timeout: 60000 }
    );
    await this.requestSubmitSchoolForm();
    await responsePromise.catch(() => null);
    await dialog.waitFor({ state: 'hidden', timeout: 30000 }).catch(() => {});

    // After update the list may re-sort; use the search box to locate the updated name.
    await this.waitForListRows();
    const searchBox = this.page.locator('input[placeholder*="Search"]').first();
    if (await searchBox.isVisible({ timeout: 3000 }).catch(() => false)) {
      await searchBox.fill(newName);
      await this.page.waitForTimeout(1000);
    }

    await this.expectTextVisible(newName);
  }

  async openSchoolEdit(name: string): Promise<void> {
    // Use search to bring the school into view regardless of pagination
    await this.waitForListRows();
    const searchBox = this.page.locator('input[placeholder*="Search"]').first();
    if (await searchBox.isVisible({ timeout: 3000 }).catch(() => false)) {
      await searchBox.fill(name);
      await this.page.waitForTimeout(800);
    }
    const row = this.schoolRow(name);
    await row.waitFor({ state: 'visible', timeout: 30000 });
    await row.locator(schoolLocators.editIcon).first().click();
    await this.waitForVisible(schoolLocators.schoolNameInput);
  }

  async submitSchoolEditEmptyName(): Promise<void> {
    const dialog = this.schoolFormDialog();
    const input = dialog.locator('input[name="school_name"]');
    await input.waitFor({ state: 'visible' });
    await input.fill('');
    await this.page.waitForTimeout(300);
    await this.requestSubmitSchoolForm();
    await this.expectTextVisible(/school name.*required|required/i);
    await input.waitFor({ state: 'visible' });
  }

  async viewSchool(name: string): Promise<void> {
    // Search first, as openSchoolEdit does: the list holds 1,000+ schools, and
    // schoolRow() matches the whole grid, so without narrowing it to this
    // school the first view icon belongs to whichever school is listed first.
    await this.waitForListRows();
    const searchBox = this.page.locator('input[placeholder*="Search"]').first();
    if (await searchBox.isVisible({ timeout: 3000 }).catch(() => false)) {
      await searchBox.fill(name);
      await this.page.waitForTimeout(1200); // outlast the 1000ms search debounce
    }
    const row = this.schoolRow(name);
    await row.waitFor({ state: 'visible', timeout: 30000 });

    await row.locator(schoolLocators.viewIcon).first().click();

    const backButton = this.page.locator(schoolLocators.backButton).first();
    if (await backButton.isVisible().catch(() => false)) {
      await backButton.click();
      await row.waitFor({ state: 'visible', timeout: 30000 });
    } else {
      await this.expectTextVisible(name);
    }
  }

  async editSchoolWithValidation(
    oldName: string,
    newName: string
  ): Promise<void> {
    const row = this.schoolRow(oldName);
    await row.waitFor({ state: 'visible', timeout: 30000 });

    await row.locator(schoolLocators.editIcon).first().click();
    await this.waitForVisible(schoolLocators.schoolNameInput);

    // Negative: submit edit with empty school name and assert required validation.
    await this.fill(schoolLocators.schoolNameInput, '');
    await this.click(schoolLocators.submitButton);
    await this.expectTextVisible(/school name.*required|required/i);

    // Positive: update with a valid name.
    await this.fill(schoolLocators.schoolNameInput, newName);
    await Promise.all([
      this.page.waitForLoadState('networkidle'),
      this.click(schoolLocators.submitButton),
    ]);

    await this.expectTextVisible(newName);
  }

  async deleteSchool(name: string): Promise<void> {
    // Use the search box to bring the school to page 1 and wait for debounce.
    await this.waitForListRows();
    const searchBox = this.page.locator('input[placeholder*="Search"]').first();
    if (await searchBox.isVisible({ timeout: 3000 }).catch(() => false)) {
      await searchBox.clear();
      await searchBox.fill(name);
      await this.page
        .locator(`span[title="${name}"]`)
        .first()
        .waitFor({ state: 'visible', timeout: 8000 })
        .catch(() => {});
      await this.page.waitForTimeout(1200); // outlast the 1000ms debounce
    }

    // Locate the row index via span[title] (only school_name column has this attribute).
    const allSpans = this.page.locator('span[title]');
    const count = await allSpans.count().catch(() => 0);
    let rowIndex = -1;
    for (let i = 0; i < count; i++) {
      const t = await allSpans
        .nth(i)
        .getAttribute('title')
        .catch(() => '');
      if (t === name) {
        rowIndex = i;
        break;
      }
    }
    // Never fall back to another row — that would delete a different school
    // (possibly one a parallel spec depends on).
    if (rowIndex === -1) {
      throw new Error(`School "${name}" not found in the list`);
    }

    const deleteTrigger = this.page
      .locator('button[aria-label="delete"]')
      .nth(rowIndex);
    const triggerVisible = await deleteTrigger
      .waitFor({ state: 'visible', timeout: 5000 })
      .then(() => true)
      .catch(() => false);
    if (!triggerVisible) {
      throw new Error(`Delete action not visible for school "${name}"`);
    }

    await deleteTrigger.click();

    // Scoped to the dialog: page-wide, /Delete/ also matches the rows'
    // aria-label="delete" trash buttons, which come first in the DOM.
    const confirmButton = this.page
      .getByRole('dialog')
      .getByRole('button', { name: /Yes, Delete|Delete|Confirm/i })
      .first();
    await confirmButton.waitFor({ state: 'visible', timeout: 10000 });
    await confirmButton.click();

    // The shared preview backend can be slow to delete and refetch under
    // parallel load.
    await this.page
      .getByText(name)
      .first()
      .waitFor({ state: 'hidden', timeout: 60000 });
  }

  async assertSchoolVisible(name: string): Promise<void> {
    // Search to scope results — without this, pagination can push the school off the
    // first page in a dev environment accumulating leftover test data.
    await this.waitForListRows();
    const searchBox = this.page.locator('input[placeholder*="Search"]').first();
    if (await searchBox.isVisible({ timeout: 3000 }).catch(() => false)) {
      await searchBox.clear();
      await searchBox.fill(name);
      await this.page.waitForTimeout(1500);
    }
    await this.expectTextVisible(name, 30000);
  }

  async assertSchoolNotVisible(name: string): Promise<void> {
    // Search to scope results — span[title] only appears on table row cells, not inputs
    await this.waitForListRows();
    const searchBox = this.page.locator('input[placeholder*="Search"]').first();
    if (await searchBox.isVisible({ timeout: 3000 }).catch(() => false)) {
      await searchBox.clear();
      await searchBox.fill(name);
      await this.page.waitForTimeout(1500);
    }
    await expect(
      this.page.locator(`span[title="${name}"]`).first()
    ).not.toBeVisible({ timeout: 15000 });
  }
}
