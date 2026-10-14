import { BasePage } from './base/BasePage';
import { type Page } from '@playwright/test';

export class StudentPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  async navigateTo(): Promise<void> {
    await this.navigateTo('/students');
    await this.waitForLoadState('load');
  }

  async createStudent(
    name: string,
    email: string,
    classId: string
  ): Promise<void> {
    await this.click('[data-testid="create-student-btn"]');
    await this.fill('[data-testid="student-name-input"]', name);
    await this.fill('[data-testid="student-email-input"]', email);
    await this.fill('[data-testid="student-class-input"]', classId);
    await this.click('[data-testid="submit-btn"]');
    await this.waitForLoadState('networkidle');
  }

  async updateStudent(studentId: string, name: string): Promise<void> {
    await this.click(`[data-testid="edit-student-${studentId}"]`);
    await this.fill('[data-testid="student-name-input"]', name);
    await this.click('[data-testid="submit-btn"]');
    await this.waitForLoadState('networkidle');
  }

  async deleteStudent(studentId: string): Promise<void> {
    await this.click(`[data-testid="delete-student-${studentId}"]`);
    await this.click('[data-testid="confirm-delete-btn"]');
    await this.waitForLoadState('networkidle');
  }

  async viewStudent(studentId: string): Promise<void> {
    await this.click(`[data-testid="view-student-${studentId}"]`);
    await this.waitForLoadState('load');
  }
}
