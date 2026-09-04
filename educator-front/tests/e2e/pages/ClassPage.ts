import { classLocators } from '../locators/classLocators';
import { BasePage } from './base/BasePage';
import { Page } from '@playwright/test';
export class ClassPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  async classManagementForEducator(): Promise<void> {
    // Use positive-only creation flow for smoke
    return this.createClassPositive();
  }
  // create student with emial as mailosaur generated email for testing email flow in future async
  async createStudent(name: string, email: string): Promise<void> {
    await this.page.waitForLoadState(
  'networkidle'
);


// <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-chevron-down" aria-hidden="true"><path d="m6 9 6 6 6-6"></path></svg>

    const addStudentSection =
    this.page.locator(
    'button:has-text("Add Student")'
    );

    await addStudentSection
      .locator(
        'svg.lucide-chevron-down'
      )
      .click();
    await this.click(classLocators.addStudentButton);
    await this.waitForVisible(classLocators.studentNameInput, 10000);
    await this.fill(classLocators.studentNameInput, name);
    await this.fill(classLocators.studentEmailInput, email);
    await this.click(classLocators.createStudentButton);
    await this.waitForLoadState('networkidle');
    await this.expectTextVisible('Student added successfully');
    await this.expectTextVisible(name);
    // click on student menu and click edit student details to verify student creation and also to have steps ready for email verification in future
    // <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-chevron-down" aria-hidden="true"><path d="m6 9 6 6 6-6"></path></svg>
    await this.page
      .locator(
        classLocators.studentMenuButton
      )
      .first()
      .click();
  }

  async viewandeditclass(): Promise<void> {
    await this.click(classLocators.classManagementLink);
    await this.expectTextVisible('Class 101');
    await this.waitForLoadState('networkidle');

    await this.waitForVisible(classLocators.viewButton, 10000);
    await this.click(classLocators.viewButton);
    await this.click(classLocators.menuToggleButton);
    await this.click(classLocators.editClassDetailsButton);
    await this.waitForVisible(classLocators.classNameInput, 10000);

    await this.fill(classLocators.classNameInput, 'Class 101 - Updated');
    await this.click(this.page.getByRole('button', { name: 'Update Class' }));
    await this.expectTextVisible('Class 101 - Updated');

    await this.click(classLocators.menuToggleButton);
    await this.click(classLocators.editClassDetailsButton);
    await this.waitForVisible(classLocators.classNameInput, 10000);
    await this.fill(classLocators.classNameInput, 'Class 101');
    await this.click(this.page.getByRole('button', { name: 'Update Class' }));
    await this.expectTextVisible('Class 101');

    await this.waitForLoadState('networkidle', 10000);
    await this.page.locator(classLocators.studentMenuButton).first().click();
    //await this.click(classLocators.studentMenuButton);
    await this.click(classLocators.editStudentDetailsButton);
    await this.waitForLoadState('networkidle', 10000);

    const emailField = this.page.locator(classLocators.studentEmailInput);
    await emailField.waitFor({ state: 'visible' });

    const emailValue = await emailField.inputValue();
    if (emailValue === '') {
      await this.click(classLocators.updateStudentButton);
      await this.waitForLoadState('networkidle', 10000);
      await this.expectTextVisible('Student name is required');
      const serverId = 'realityworks';
      const studentEmail = `teststudent${Date.now()}@${serverId}.mailosaur.net`;
      await emailField.fill(studentEmail);
      await this.fill(classLocators.studentNameInput, 'Test Studentss');
      await this.click(classLocators.updateStudentButton);
      await this.waitForLoadState('networkidle', 10000);
      await this.expectTextVisible('Student updated successfully');
    } else {
      await this.click(classLocators.studentNameInput);
      await this.fill(classLocators.studentNameInput, 'Test Studentsss');
      await this.click(classLocators.updateStudentButton);
      await this.waitForLoadState('networkidle', 10000);
      await this.expectTextVisible('Student updated successfully');
    }

    // await this.click(classLocators.backButton);

//     const backButton =
//   this.page.getByRole(
//     'button',
//     { name: /Back/i }
//   );

// if (
//   await backButton
//     .isVisible()
//     .catch(() => false)
// ) {
//   await backButton.click();

//   await this.waitForModalClose(
//     'div.fixed.inset-0.z-50',
//     10000
//   );
// }


    // await this.waitForModalClose('div.fixed.inset-0.z-50', 10000);
    await this.waitForLoadState('networkidle');
    // click on cap icon to view the students
      await this.page
      .locator(
        'svg.lucide-chevron-down'
      )
      .first()
      .click();
    await this.expectTextVisible('Class 101');

    await this.click(classLocators.addStudentButton);
    await this.waitForVisible(classLocators.studentNameInput, 10000);
    await this.fill(classLocators.studentNameInput, 'Test Student');
    const serverId = 'realityworks';
    const studentEmail = `teststudent${Date.now()}@${serverId}.mailosaur.net`;
    await this.fill(classLocators.studentEmailInput, studentEmail);
    await this.click(classLocators.createStudentButton);
    await this.waitForLoadState('networkidle');
    await this.expectTextVisible('Student added successfully');
    await this.expectTextVisible('Test Student');
await this.page
  .locator(
    classLocators.studentMenuButton
  )
  .first()
  .click();
    // await this.click(classLocators.studentMenuButton);
    await this.click(classLocators.editStudentDetailsButton);
    await this.waitForVisible(classLocators.studentNameInput, 10000);
    await this.getLocator(classLocators.studentNameInput).clear();
    await this.fill(classLocators.studentNameInput, 'Test Student Updated');
    await this.click(classLocators.updateStudentButton);
    await this.expectTextVisible('Student updated successfully');
    await this.page.waitForTimeout(2000);
    await this.page.reload();
    await this.page
  .locator(
    'svg.lucide-chevron-down'
  )
  .first()
  .click();
    await this.expectTextVisible('Test Student Updated');
  }

  // Positive-only class creation for smoke tests
  async createClassPositive(): Promise<void> {
    // wait up to 30 s for the page to settle; use domcontentloaded to avoid blocking on websockets
    await this.waitForLoadState('domcontentloaded', 30000).catch(() => {});
    // If not already on classes, navigate to classes/manage first.
    const currentUrl = this.page.url();
    if (!currentUrl.includes('/classes')) {
      // Navigate to classes/manage
      await this.waitForVisible(classLocators.manageClassesButton, 30000);
      await this.click(classLocators.manageClassesButton);
    }

    // Wait for navigation
    await this.waitForUrl(/classes/i, 30000);
    await this.page.waitForTimeout(2000);
    
    // Wait for add class button
    await this.waitForVisible(classLocators.addClassButton, 30000);
    await this.click(classLocators.addClassButton);

    const className = `Class ${Date.now()}`;

    await this.fill(
      classLocators.classNameInput,
      className
    );

    //   await this.fill(
    //     classLocators.termInput,
    //     'Term 1'
    //   );

    //   // SELECT YEAR
    //   await this.click(
    //     classLocators.selectYearButton
    //   );

    //   await this.page
    //     .locator(
    //       classLocators.yearOption2026
    //     )
    //     .first()
    //     .click();

    //   // START DATE
    //   // START DATE
    // await this.waitForLoadState('networkidle');

    // START DATE - Click on first date picker
    const datePickerContainers = this.page.locator('div.relative.h-\\[38px\\].rounded-xl.overflow-hidden');
    const startDatePicker = datePickerContainers.first();
    await startDatePicker.waitFor({ state: 'visible', timeout: 10000 }).catch(() => {
      throw new Error('Start date picker not found');
    });
    await startDatePicker.click({ timeout: 5000 });

    await this.page.waitForTimeout(1000);
    await this.page.keyboard.press('Enter');

    // END DATE - Click on second date picker
    const endDatePicker = datePickerContainers.nth(1);
    await endDatePicker.waitFor({ state: 'visible', timeout: 10000 }).catch(() => {
      throw new Error('End date picker not found');
    });
    await endDatePicker.click({ timeout: 5000 });

    await this.page.waitForTimeout(1000);

    for (let i = 0; i < 12; i++) {
      await this.page.keyboard.press('ArrowRight');
    }

    await this.page.keyboard.press('Enter');

    // STUDENT COUNT - Select "Enter Number" option and fill count
    const enterNumberButton = this.page.getByText('Enter Number').first();
    await enterNumberButton.waitFor({ state: 'visible', timeout: 10000 }).catch(() => {
      throw new Error('Enter Number button not found');
    });
    await enterNumberButton.click({ timeout: 5000 });
    
    await this.page.waitForTimeout(500);

    // STUDENT COUNT
    const studentCountLocator = this.page.locator(classLocators.studentCountInput).first();
    await studentCountLocator.waitFor({ state: 'visible', timeout: 10000 }).catch(() => {
      throw new Error(`Student count input not found using selector: ${classLocators.studentCountInput}`);
    });
    await this.fill(
      classLocators.studentCountInput,
      '1'
    );

    // CREATE CLASS
    await this.click(
      classLocators.createClassButton
    );

    // Avoid networkidle here: websocket/polling can keep requests open and cause false timeouts.
    await this.page.waitForLoadState('domcontentloaded').catch(() => {});
    await Promise.any([
      this.page.locator(classLocators.addClassButton).first().waitFor({ state: 'visible', timeout: 20000 }),
      this.page.locator(`text="${className}"`).first().waitFor({ state: 'visible', timeout: 20000 }),
      this.page.locator('[role="status"], [role="alert"], .toast, .notification').first().waitFor({ state: 'visible', timeout: 10000 })
    ]).catch(() => {});
    if (!this.page.isClosed()) await this.page.waitForTimeout(1500);

    // Check for any visible toast or alert messages (success or error)
    const toastMessages = this.page.isClosed() ? [] : await this.page.locator('[role="status"], [role="alert"], .toast, .notification').all();
    let foundSuccessMessage = false;
    let errorFound = false;
    let errorText = '';

    for (const toast of toastMessages) {
      const isVisible = await toast.isVisible().catch(() => false);
      if (isVisible) {
        const text = await toast.textContent();
        if (text && text.includes('created') && text.includes('successfully')) {
          foundSuccessMessage = true;
        } else if (text && (text.includes('error') || text.includes('failed') || text.includes('invalid'))) {
          errorFound = true;
          errorText = text;
        }
      }
    }

    // If error found, throw it
    if (errorFound) {
      throw new Error(`Class creation failed with error: ${errorText}`);
    }

    // If success message found, continue
    if (foundSuccessMessage) {
      await this.page.waitForTimeout(1000);
    } else {
      // If no success message, check if we're on classes page (silent success) or still on form
      const currentUrl = this.page.url();
      
      // Try to find the class card with the name we created
      const classCardExists = await this.page.locator(`text="${className}"`).first().isVisible().catch(() => false);
      
      if (!classCardExists && !currentUrl.includes('/classes')) {
        // Still on form page and no class created - this is a failure
        const formErrors = await this.page.locator('div.text-red-500, span.text-red-500, .error-message').allTextContents();
        // Ignore bare asterisks — they are required-field indicators, not validation errors
        const realErrors = formErrors.filter(e => e.trim().length > 1);
        if (realErrors.length > 0) {
          throw new Error(`Form validation errors: ${realErrors.join(', ')}`);
        }
        throw new Error('Class creation failed - form still displayed and no success message found');
      }
    }

    // Reload once if the list hasn't refreshed to show the new class
    const alreadyVisible = await this.page.locator(`text="${className}"`).first()
      .isVisible({ timeout: 8000 }).catch(() => false);
    if (!alreadyVisible) {
      await this.page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
      await this.page.waitForLoadState('domcontentloaded').catch(() => {});
    }
    // Second reload if still not visible — handles slow API responses and stale list caches
    const visibleAfterReload = await this.page.locator(`text="${className}"`).first()
      .isVisible({ timeout: 20000 }).catch(() => false);
    if (!visibleAfterReload) {
      await this.page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
      await this.page.waitForLoadState('domcontentloaded').catch(() => {});
    }
    await this.page.locator(`text="${className}"`).first().waitFor({ state: 'visible', timeout: 60000 });
  }

  // ==================== NEGATIVE CLASS SCENARIOS ====================
  
  async createClassNegativeEmptyName(): Promise<void> {
    await this.openClassManagement();
    await this.click(classLocators.addClassButton);
    
    // Try to submit without entering class name
    await this.click(classLocators.createClassButton);
    
    // Verify validation error
    await this.expectTextVisible(/class name.*required|required/i);
  }

  async createClassNegativeEmptyDates(): Promise<void> {
    await this.openClassManagement();
    await this.click(classLocators.addClassButton);
    
    const className = `Class ${Date.now()}`;
    await this.fill(classLocators.classNameInput, className);
    
    // Try to submit without setting dates
    await this.click(classLocators.createClassButton);
    
    // Verify validation error
    await this.expectTextVisible(/date.*required|start date|end date/i);
  }

  async createClassNegativeEmptyStudentCount(): Promise<void> {
    await this.openClassManagement();
    await this.click(classLocators.addClassButton);
    
    const className = `Class ${Date.now()}`;
    await this.fill(classLocators.classNameInput, className);
    
    // Set start date
    const datePickerContainers = this.page.locator('div.relative.h-\\[38px\\].rounded-xl.overflow-hidden');
    await datePickerContainers.first().click({ timeout: 5000 });
    await this.page.waitForTimeout(1000);
    await this.page.keyboard.press('Enter');
    
    // Set end date
    await datePickerContainers.nth(1).click({ timeout: 5000 });
    await this.page.waitForTimeout(1000);
    for (let i = 0; i < 12; i++) {
      await this.page.keyboard.press('ArrowRight');
    }
    await this.page.keyboard.press('Enter');
    
    // Try to submit without entering student count
    await this.click(classLocators.createClassButton);
    
    // Verify validation error
    await this.expectTextVisible(/student.*required|number.*required/i);
  }

  // ==================== POSITIVE CLASS SCENARIOS ====================
  
  async openClassManagement(): Promise<void> {
    const currentUrl = this.page.url();
    if (!currentUrl.includes('/classes')) {
      // First ensure page is loaded
      await this.waitForLoadState('networkidle').catch(() => {});
      
      // Get the button locator and try to scroll it into view
      const buttonLocator = this.page.locator(classLocators.manageClassesButton).first();
      await buttonLocator.scrollIntoViewIfNeeded().catch(() => {});
      
      // Retry logic for finding the visible button
      let retries = 3;
      let lastError: Error | null = null;
      
      while (retries > 0) {
        try {
          await this.waitForVisible(classLocators.manageClassesButton, 15000);
          break;
        } catch (error) {
          lastError = error as Error;
          retries--;
          
          if (retries > 0) {
            if (this.page.isClosed()) throw new Error('Page closed during openClassManagement');
            // Try to expand navigation if there's a menu toggle
            const navToggle = this.page.locator(
              'button[aria-label*="menu" i], button[aria-label*="nav" i], button[title*="menu" i], button.mobile-menu-toggle'
            ).first();
            
            const isToggleVisible = await navToggle.isVisible().catch(() => false);
            if (isToggleVisible) {
              await navToggle.click().catch(() => {});
              await this.page.waitForTimeout(500);
            }
            
            // Re-scroll into view
            await buttonLocator.scrollIntoViewIfNeeded().catch(() => {});
            if (!this.page.isClosed()) await this.page.waitForTimeout(500);
          }
        }
      }
      
      if (lastError && retries === 0) {
        throw lastError;
      }
      
      await this.click(classLocators.manageClassesButton);
      await this.waitForUrl(/classes/i, 30000);
      await this.page.waitForTimeout(2000);
    }
  }

  async viewClassDetails(className: string): Promise<void> {
    await this.openClassManagement();
    await this.waitForLoadState('networkidle');
    
    // Find the class row and click view button
    const classRow = this.page.locator(`text="${className}"`).first();
    await classRow.waitFor({ state: 'visible', timeout: 30000 });
    
    // Find the view button near the class name
    const viewButton = classRow.locator('xpath=ancestor::tr//button').first();
    await viewButton.click({ timeout: 5000 });
    
    await this.waitForLoadState('networkidle');
    await this.expectTextVisible(className);
  }

  async editClassName(oldName: string, newName: string): Promise<void> {
    await this.openClassManagement();
    await this.waitForLoadState('networkidle');
    
    // Find and click the class
    const classRow = this.page.locator(`text="${oldName}"`).first();
    await classRow.waitFor({ state: 'visible', timeout: 30000 });
    
    // Click menu/edit button
    const menuButton = this.page.locator(classLocators.menuToggleButton).first();
    if (await menuButton.isVisible().catch(() => false)) {
      await menuButton.click({ timeout: 5000 });
      await this.click(classLocators.editClassDetailsButton);
    }
    
    await this.waitForVisible(classLocators.classNameInput, 10000);
    await this.getLocator(classLocators.classNameInput).clear();
    await this.fill(classLocators.classNameInput, newName);
    
    await this.click(this.page.getByRole('button', { name: /Update Class/i }));
    await this.expectTextVisible(/updated|successfully/i);
  }

  async addStudentToClass(studentName: string, studentEmail: string): Promise<void> {
    await this.openClassManagement();
    await this.waitForLoadState('networkidle');
    
    // Click add student button
    const addStudentButton = this.page.locator(classLocators.addStudentButton).first();
    if (await addStudentButton.isVisible().catch(() => false)) {
      await addStudentButton.click({ timeout: 5000 });
    }
    
    await this.waitForVisible(classLocators.studentNameInput, 10000);
    await this.fill(classLocators.studentNameInput, studentName);
    await this.fill(classLocators.studentEmailInput, studentEmail);
    
    await this.click(classLocators.createStudentButton);
    await this.expectTextVisible(/added|successfully/i);
    await this.expectTextVisible(studentName);
  }

  async verifyClassDisplayed(className: string): Promise<void> {
    await this.openClassManagement();
    await this.waitForLoadState('networkidle');
    
    await this.expectTextVisible(className);
  }
}