import { Injectable } from '@nestjs/common';

export interface VitalsProgressionRule {
  id: string;
  vitalType:
    | 'heartRate'
    | 'bloodPressure'
    | 'respiratoryRate'
    | 'spO2'
    | 'temperature'
    | 'weight'
    | 'height';
  triggerType: 'time' | 'action';
  triggerValue: string | number; // Time in minutes or action ID
  newValue: string;
  description?: string;
}

export interface VitalsProgressionConfig {
  enabled: boolean;
  rules: VitalsProgressionRule[];
}

export interface VitalsState {
  heartRate: string;
  bloodPressure: string;
  respiratoryRate: string;
  spO2: string;
  temperature: string;
  weight?: string;
  height?: string;
}

export interface ProgressionContext {
  scenarioStartTime: Date;
  currentTime: Date;
  completedActions: string[];
  currentVitals: VitalsState;
}

@Injectable()
export class VitalsProgressionService {
  /**
   * Apply vitals progression rules based on current context
   */
  applyProgressionRules(config: VitalsProgressionConfig, context: ProgressionContext): VitalsState {
    if (!config.enabled || !config.rules || config.rules.length === 0) {
      return context.currentVitals;
    }

    const updatedVitals = { ...context.currentVitals };
    const elapsedMinutes = this.getElapsedMinutes(context.scenarioStartTime, context.currentTime);

    // Sort rules by trigger value to apply in chronological order
    const sortedRules = [...config.rules].sort((a, b) => {
      if (a.triggerType === 'time' && b.triggerType === 'time') {
        return Number(a.triggerValue) - Number(b.triggerValue);
      }
      return 0;
    });

    for (const rule of sortedRules) {
      if (this.shouldApplyRule(rule, elapsedMinutes, context.completedActions)) {
        updatedVitals[rule.vitalType] = rule.newValue;
      }
    }

    return updatedVitals;
  }

  /**
   * Check if a rule should be applied based on current context
   */
  private shouldApplyRule(
    rule: VitalsProgressionRule,
    elapsedMinutes: number,
    completedActions: string[],
  ): boolean {
    switch (rule.triggerType) {
      case 'time':
        return elapsedMinutes >= Number(rule.triggerValue);
      case 'action':
        return completedActions.includes(String(rule.triggerValue));
      default:
        return false;
    }
  }

  /**
   * Calculate elapsed minutes between two dates
   */
  private getElapsedMinutes(startTime: Date, currentTime: Date): number {
    return Math.floor((currentTime.getTime() - startTime.getTime()) / (1000 * 60));
  }

  /**
   * Get the current vitals state for a scenario with progression applied
   */
  getCurrentVitals(
    baseVitals: VitalsState,
    progressionConfig: VitalsProgressionConfig,
    scenarioStartTime: Date,
    completedActions: string[] = [],
  ): VitalsState {
    const context: ProgressionContext = {
      scenarioStartTime,
      currentTime: new Date(),
      completedActions,
      currentVitals: baseVitals,
    };

    return this.applyProgressionRules(progressionConfig, context);
  }

  /**
   * Validate vitals progression configuration
   */
  validateProgressionConfig(config: VitalsProgressionConfig): string[] {
    const errors: string[] = [];

    if (!config.rules) {
      return errors;
    }

    for (const rule of config.rules) {
      if (!rule.id) {
        errors.push('Rule ID is required');
      }
      if (!rule.vitalType) {
        errors.push('Vital type is required');
      }
      if (!rule.triggerType) {
        errors.push('Trigger type is required');
      }
      if (rule.triggerValue === undefined || rule.triggerValue === null) {
        errors.push('Trigger value is required');
      }
      if (!rule.newValue) {
        errors.push('New value is required');
      }
      if (rule.triggerType === 'time' && isNaN(Number(rule.triggerValue))) {
        errors.push('Time trigger value must be a number');
      }
    }

    return errors;
  }
}
