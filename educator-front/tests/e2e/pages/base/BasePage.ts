import { Locator, Page, expect } from '@playwright/test';

type NavigationOptions = Parameters<Page['goto']>[1];
type LoadStateType = 'load' | 'domcontentloaded' | 'networkidle';

export class BasePage {
  constructor(protected page: Page) {}

  async navigateTo(url: string, options?: NavigationOptions): Promise<void> {
    // If url is relative (starts with /), construct absolute URL
    if (url.startsWith('/')) {
      const baseUrl = this.page.url().match(/^https?:\/\/[^/]+/)?.[0] || 'http://localhost:3000';
      url = `${baseUrl}${url}`;
    }
    await this.page.goto(url, options);
  }

  getLocator(selector: string): Locator {
    return this.page.locator(selector);
  }

  async click(selector: string | Locator, options?: Parameters<Locator['click']>[0]): Promise<void> {
    // Always use .first() for string selectors to avoid strict mode violations with multiple matches
    const locator = typeof selector === 'string' ? this.page.locator(selector).first() : selector;
    await locator.waitFor({ state: 'visible' });
    
    // Wait for overlay to disappear with multiple attempts
    for (let i = 0; i < 2; i++) {
      await this.waitForOverlayToDisappear();
      
      try {
        // Try to click - if it fails due to overlay, retry
        await locator.click({ ...options, timeout: 2000 });
        return;
      } catch (error) {
        // Check if page is still open
        if (this.page.isClosed()) {
          throw new Error('Page closed during click operation');
        }
        // If this is not the last attempt, wait and retry
        if (i < 1) {
          await this.page.waitForTimeout(300).catch(() => {});
          continue;
        }
        // On last attempt, throw the error
        throw error;
      }
    }
  }
  async setReactDate(selector: string | Locator, date: string) {
    const locator = typeof selector === 'string' ? this.page.locator(selector) : selector;
    await locator.click();
    await this.page.keyboard.type(date);
  }

  async clickAndWaitForUrl(
    selector: string | Locator,
    urlOrRegExp: string | RegExp,
    timeout = 3000
  ): Promise<void> {
    const locator = typeof selector === 'string' ? this.page.locator(selector).first() : selector;
    await locator.waitFor({ state: 'visible', timeout });
    
    // Wait for overlay with retries
    for (let i = 0; i < 3; i++) {
      await this.waitForOverlayToDisappear();
      
      try {
        await Promise.all([
          this.page.waitForURL(urlOrRegExp, { timeout }),
          locator.click({ timeout: 2000 }),
        ]);
        return;
      } catch (error) {
        if (i < 2) {
          await this.page.waitForTimeout(500);
          continue;
        }
        throw error;
      }
    }
  }

  async fill(selector: string | Locator, value: string, options?: Parameters<Locator['fill']>[1]): Promise<void> {
    const locator = typeof selector === 'string' ? this.page.locator(selector).first() : selector;
    await locator.waitFor({ state: 'visible' });
    await locator.fill(value, options);
  }

  async fillReadonly(selector: string | Locator, value: string): Promise<void> {
    const locator = typeof selector === 'string' ? this.page.locator(selector).first() : selector;
    await locator.waitFor({ state: 'visible' });
    await locator.evaluate((element, val) => {
      const input = element as HTMLInputElement;
      input.value = val;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }, value);
  }

  async waitForVisible(selector: string | Locator, timeout = 30000): Promise<void> {
    const locator = typeof selector === 'string' ? this.page.locator(selector).first() : selector;
    
    // First try to wait for visibility
    try {
      await locator.waitFor({ state: 'visible', timeout });
    } catch (originalError) {
      // If the page/context was already closed, propagate immediately
      if (this.page.isClosed()) throw originalError;

      // If element is still hidden after timeout, check if it exists at all
      let count = 0;
      try {
        count = await locator.count();
      } catch {
        throw originalError; // page closed while checking, re-throw original
      }
      if (count === 0) {
        throw new Error(`Element not found in DOM: ${typeof selector === 'string' ? selector : 'Locator'}`);
      }
      // Element exists but is hidden - wait a bit more for it to appear
      await this.page.waitForTimeout(1000);
      await locator.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {
        throw new Error(`Element found but remains hidden after waiting: ${typeof selector === 'string' ? selector : 'Locator'}`);
      });
    }
  }

  async waitForUrl(urlOrRegExp: string | RegExp, timeout = 30000): Promise<void> {
    await this.page.waitForURL(urlOrRegExp, { timeout });
  }

  async waitForLoadState(state: LoadStateType = 'load', timeout = 30000): Promise<void> {
    await this.page.waitForLoadState(state, { timeout });
  }
async expectTextVisible(
  text: string | RegExp,
  timeout = 30000
): Promise<void> {
  // Add additional wait for network requests to settle
  await this.page.waitForLoadState('networkidle').catch(() => {});
  
  // Try getByText first - it's the most reliable
  await expect(
    this.page.getByText(text).first()
  ).toBeVisible({ timeout });
}

  async selectDropdownOption(dropdownSelector: string | Locator, optionText: string): Promise<void> {
    const dropdown = typeof dropdownSelector === 'string' ? this.page.locator(dropdownSelector) : dropdownSelector;
    await dropdown.click();
    await this.page.locator(`div[class*="cursor-pointer"]:has-text("${optionText}")`).first().click();
  }

  async waitForOverlayToDisappear(timeout = 3000): Promise<void> {
    try {
      // Look for modal backdrop overlay - matches divs with fixed positioning and z-50 with semi-transparent/dark background
      const overlay = this.page.locator('[role="dialog"]');
      const backdrop = this.page.locator('div.fixed[style*="z"], div[class*="z-50"][class*="fixed"], div[class*="inset-0"][class*="fixed"]');
      
      if ((await overlay.count()) > 0) {
        await overlay.first().waitFor({ state: 'hidden', timeout }).catch(() => {});
      }
      
      if ((await backdrop.count()) > 0) {
        await backdrop.first().waitFor({ state: 'hidden', timeout }).catch(() => {});
      }
      
      // Additional wait to ensure DOM settles
      await this.page.waitForTimeout(300);
    } catch {
      // Silently continue if overlay waiting fails
    }
  }

  async waitForModalClose(modalSelector: string, timeout = 10000): Promise<void> {
    await this.page.locator(modalSelector).waitFor({ state: 'hidden', timeout }).catch(() => {});
  }
}
