import { BasePage } from './base/BasePage';
import { Page } from '@playwright/test';

export class SimulationPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  async navigateTo(): Promise<void> {
    await this.navigateTo('/simulations');
    await this.waitForLoadState('load');
  }

  async assignSimulation(simulationId: string, classId: string): Promise<void> {
    await this.click(`[data-testid="assign-simulation-${simulationId}"]`);
    await this.fill('[data-testid="class-select"]', classId);
    await this.click('[data-testid="submit-btn"]');
    await this.waitForLoadState('networkidle');
  }

  async viewTestResults(simulationId: string): Promise<void> {
    await this.click(`[data-testid="view-results-${simulationId}"]`);
    await this.waitForLoadState('load');
  }

  async updateAssignment(assignmentId: string, dueDate: string): Promise<void> {
    await this.click(`[data-testid="edit-assignment-${assignmentId}"]`);
    await this.fill('[data-testid="due-date-input"]', dueDate);
    await this.click('[data-testid="submit-btn"]');
    await this.waitForLoadState('networkidle');
  }

  async filterSimulations(filterType: string): Promise<void> {
    await this.click('[data-testid="filter-btn"]');
    await this.click(`[data-testid="filter-${filterType}"]`);
    await this.waitForLoadState('networkidle');
  }

  async searchSimulation(query: string): Promise<void> {
    await this.fill('[data-testid="search-input"]', query);
    await this.click('[data-testid="search-btn"]');
    await this.waitForLoadState('networkidle');
  }
}
