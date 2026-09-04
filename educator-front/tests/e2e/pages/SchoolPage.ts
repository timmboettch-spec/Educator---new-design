import { Page, expect } from '@playwright/test';
import { schoolLocators } from '../locators/schoolLocators';
import { commonLocators } from '../locators/commonLocators';
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

  async navigateToSchools(): Promise<void> {
    const currentUrl = this.page.url();

    // If already on schools, reload to ensure fresh data (e.g. after a delete).
    if (/school/i.test(currentUrl)) {
      await this.page.reload();
      await this.waitForLoadState('networkidle');
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
    await this.page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
  }

  async schoolvalidation(): Promise<void> {
    // Legacy comprehensive validation exists; for smoke tests use the positive creation flow
    return this.createSchoolPositive();
  }

  async createSchool(schoolName?: string): Promise<string> {
    const finalName = schoolName ?? `ABC${Math.floor(Math.random() * 100000)}`;

    // JS click reaches React's event handler regardless of any pointer-events overlay
    await this.page.locator(schoolLocators.addSchoolButton).first()
      .waitFor({ state: 'visible', timeout: 10000 });
    await this.page.locator(schoolLocators.addSchoolButton).first()
      .evaluate(el => (el as HTMLElement).click());
    await this.waitForVisible(schoolLocators.schoolNameInput);
    await this.fill(schoolLocators.schoolNameInput, finalName);
    await this.click(schoolLocators.statusDropdown);
    await this.page.locator(commonLocators.statusActiveOption).first().click();
    // Wait for the modal to close — more reliable than networkidle which hangs on websockets
    const dialog = this.page.locator('[role="dialog"]').first();
    await this.click(schoolLocators.submitButton);
    await dialog.waitFor({ state: 'hidden', timeout: 20000 }).catch(() => {});
    await this.page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
    await this.page.waitForLoadState('domcontentloaded').catch(() => {});
    // Search by name so pagination does not hide the newly created school
    const searchBox = this.page.locator('input[placeholder*="Search"]').first();
    if (await searchBox.isVisible({ timeout: 5000 }).catch(() => false)) {
      await searchBox.fill(finalName);
      await this.page.waitForTimeout(1000);
    }
    await this.expectTextVisible(finalName, 30000);

    return finalName;
  }

  async submitCreateSchoolEmptyName(): Promise<void> {
    await this.page.locator(schoolLocators.addSchoolButton).first()
      .waitFor({ state: 'visible', timeout: 15000 });
    await this.page.locator(schoolLocators.addSchoolButton).first()
      .evaluate(el => (el as HTMLElement).click());
    await this.waitForVisible(schoolLocators.schoolNameInput, 20000);
    await this.fill(schoolLocators.schoolNameInput, '');
    await this.click(schoolLocators.submitButton);

    // Validate that submit is blocked and modal remains open.
    await this.expectTextVisible(/school name.*required|required/i);
    await this.waitForVisible(schoolLocators.schoolNameInput);
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
    await this.fill(schoolLocators.schoolNameInput, newName);
    await Promise.all([
      this.page.waitForLoadState('networkidle'),
      this.click(schoolLocators.submitButton)
    ]);

    // After update the list may re-sort; use the search box to locate the updated name.
    const searchBox = this.page.locator('input[placeholder*="Search"]').first();
    if (await searchBox.isVisible({ timeout: 3000 }).catch(() => false)) {
      await searchBox.fill(newName);
      await this.page.waitForTimeout(1000);
    }

    await this.expectTextVisible(newName);
  }

  async openSchoolEdit(name: string): Promise<void> {
    // Use search to bring the school into view regardless of pagination
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
    const input = this.page.locator(schoolLocators.schoolNameInput).first();
    await input.waitFor({ state: 'visible' });
    // fill('') triggers React's onChange so the controlled input registers as empty
    await input.fill('');
    await this.page.waitForTimeout(300);
    // Click submit directly to avoid waitForOverlayToDisappear blocking inside an open dialog
    const submitBtn = this.page.locator(schoolLocators.submitButton).first();
    await submitBtn.waitFor({ state: 'visible' });
    await submitBtn.click();
    await this.expectTextVisible(/school name.*required|required/i);
    await this.waitForVisible(schoolLocators.schoolNameInput);
  }

  async viewSchool(name: string): Promise<void> {
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

  async editSchoolWithValidation(oldName: string, newName: string): Promise<void> {
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
      this.click(schoolLocators.submitButton)
    ]);

    await this.expectTextVisible(newName);
  }

  async deleteSchool(name: string): Promise<void> {
    // Use the search box to bring the school to page 1 and wait for debounce.
    const searchBox = this.page.locator('input[placeholder*="Search"]').first();
    if (await searchBox.isVisible({ timeout: 3000 }).catch(() => false)) {
      await searchBox.clear();
      await searchBox.fill(name);
      await this.page.locator(`span[title="${name}"]`).first()
        .waitFor({ state: 'visible', timeout: 8000 }).catch(() => {});
      await this.page.waitForTimeout(1200); // outlast the 1000ms debounce
    }

    // Locate the row index via span[title] (only school_name column has this attribute).
    const allSpans = this.page.locator('span[title]');
    const count = await allSpans.count().catch(() => 0);
    let rowIndex = 0;
    for (let i = 0; i < count; i++) {
      const t = await allSpans.nth(i).getAttribute('title').catch(() => '');
      if (t === name) { rowIndex = i; break; }
    }

    const deleteTrigger = this.page.locator('button[aria-label="delete"]').nth(rowIndex);
    const triggerVisible = await deleteTrigger.waitFor({ state: 'visible', timeout: 5000 }).then(() => true).catch(() => false);
    if (!triggerVisible) {
      throw new Error(`Delete action not visible for school "${name}"`);
    }

    await deleteTrigger.click();

    const confirmButton = this.page.getByRole('button', { name: /Yes, Delete|Delete|Confirm/i }).first();
    // waitFor ensures we catch the confirm button even if it renders slightly after the click.
    if (await confirmButton.waitFor({ state: 'visible', timeout: 6000 }).then(() => true).catch(() => false)) {
      await confirmButton.click();
    }

    await this.page.getByText(name).first().waitFor({ state: 'hidden', timeout: 30000 });
  }

  async assertSchoolVisible(name: string): Promise<void> {
    await this.expectTextVisible(name);
  }

  async assertSchoolNotVisible(name: string): Promise<void> {
    await expect(this.page.getByText(name).first()).not.toBeVisible({ timeout: 30000 });
  }
}
