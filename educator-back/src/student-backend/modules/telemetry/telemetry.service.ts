/* eslint-disable @typescript-eslint/no-base-to-string */
import { Injectable } from '@nestjs/common';
import { trace, type Tracer } from '@opentelemetry/api';

import { LoggerService } from '../../../common/services';

/**
 * Schema version constants for telemetry events.
 */
export const LOGIN_SESSION_SCHEMA_VERSION = '1.0.0';
export const SCENARIO_SCHEMA_VERSION = '1.0.0';
export const PAGE_VIEW_SCHEMA_VERSION = '1.0.0';

/**
 * Custom event names for business telemetry.
 * These events track learner engagement, scenario lifecycle, and session management.
 */
export enum TelemetryEventName {
  LoginSessionStarted = 'LoginSessionStarted',
  LoginSessionEnded = 'LoginSessionEnded',
  ScenarioStarted = 'ScenarioStarted',
  ScenarioCompleted = 'ScenarioCompleted',
  PageView = 'PageView',
}

/**
 * Enum for session end reasons.
 */
export enum SessionEndReason {
  Logout = 'Logout',
  Timeout = 'Timeout',
  Expired = 'Expired',
}

/**
 * Enum for scenario completion status.
 */
export enum CompletionStatus {
  Completed = 'Completed',
  Submitted = 'Submitted',
  Abandoned = 'Abandoned',
  TimedOut = 'TimedOut',
}

/**
 * Properties for LoginSessionStarted event.
 */
export interface LoginSessionStartedProperties {
  loginSessionId: string;
  studentCode: string;
  loginTimestamp: string;
  deviceType?: string;
  platform?: string;
  authMethod?: string;
  schemaVersion: string;
}

/**
 * Properties for LoginSessionEnded event.
 */
export interface LoginSessionEndedProperties {
  loginSessionId: string;
  studentCode: string;
  logoutTimestamp: string;
  sessionDurationMs: number;
  endReason: SessionEndReason;
  schemaVersion: string;
}

/**
 * Properties for ScenarioStarted event.
 */
export interface ScenarioStartedProperties {
  scenarioSessionId: string;
  loginSessionId: string;
  transcriptId: string;
  studentCode: string;
  scenarioId: string;
  scenarioName: string;
  scenarioType: 'Practice' | 'Assessment';
  startTimestamp: string;
  schemaVersion: string;
}

/**
 * Properties for PageView event.
 */
export interface PageViewProperties {
  loginSessionId?: string;
  studentCode?: string;
  pagePath: string;
  pageTitle?: string;
  referrer?: string;
  timestamp: string;
  durationMs?: number;
  schemaVersion: string;
}

/**
 * Properties for ScenarioCompleted event.
 */
export interface ScenarioCompletedProperties {
  scenarioSessionId: string;
  loginSessionId: string;
  transcriptId: string;
  studentCode: string;
  scenarioId: string;
  scenarioName: string;
  scenarioType: 'Practice' | 'Assessment';
  durationMs: number;
  completionStatus: CompletionStatus;
  finalScore?: number;
  passingScore?: number;
  passedAssessment?: boolean;
  endTimestamp: string;
  schemaVersion: string;
}

/**
 * TelemetryService provides a centralized way to emit custom telemetry events
 * to Azure Application Insights for tracking learner engagement, scenario lifecycle,
 * and session management.
 */
@Injectable()
export class TelemetryService {
  private readonly tracer: Tracer;

  constructor(private readonly logger: LoggerService) {
    // Get OpenTelemetry tracer for custom events
    this.tracer = trace.getTracer('telemetry-service', '1.0.0');
    this.logger.log('TelemetryService initialized with OpenTelemetry');
  }

  /**
   * Emit a LoginSessionStarted event when a learner successfully logs in.
   */
  trackLoginSessionStarted(properties: LoginSessionStartedProperties): void {
    this.trackEvent(
      TelemetryEventName.LoginSessionStarted,
      properties as unknown as Record<string, unknown>,
    );
  }

  /**
   * Emit a LoginSessionEnded event when a learner logs out, session expires, or times out.
   */
  trackLoginSessionEnded(properties: LoginSessionEndedProperties): void {
    this.trackEvent(
      TelemetryEventName.LoginSessionEnded,
      properties as unknown as Record<string, unknown>,
    );
  }

  /**
   * Emit a ScenarioStarted event when a learner begins an individual simulation/scenario attempt.
   */
  trackScenarioStarted(properties: ScenarioStartedProperties): void {
    this.trackEvent(
      TelemetryEventName.ScenarioStarted,
      properties as unknown as Record<string, unknown>,
    );
  }

  /**
   * Emit a ScenarioCompleted event when a learner completes, submits, times out, or abandons a scenario attempt.
   */
  trackScenarioCompleted(properties: ScenarioCompletedProperties): void {
    this.trackEvent(
      TelemetryEventName.ScenarioCompleted,
      properties as unknown as Record<string, unknown>,
    );
  }

  /**
   * Emit a PageView event to track which pages students visit.
   */
  trackPageView(properties: PageViewProperties): void {
    this.trackEvent(TelemetryEventName.PageView, properties as unknown as Record<string, unknown>);
  }

  /**
   * Internal method to track a custom event.
   * Logs the event and sends it to Azure Monitor via OpenTelemetry.
   * Uses span events which map to customEvents in Azure Monitor.
   *
   * Emits with same structure as lifecycle events for consistent querying.
   */
  private trackEvent(name: string, properties: Record<string, unknown>): void {
    // Enhanced logging for detailed tracking
    this.logger.log('─'.repeat(80));
    this.logger.log(`📤 [Telemetry] Tracking event: ${name}`);
    this.logger.log(`📋 [Telemetry] Properties: ${JSON.stringify(properties, null, 2)}`);

    try {
      this.logger.log(`🔄 [Telemetry] Creating OpenTelemetry span...`);

      // Create a very short-lived span to carry the event
      const span = this.tracer.startSpan(`BusinessEvent.${name}`, {
        kind: 1, // INTERNAL span kind
      });
      this.logger.log(`✅ [Telemetry] Span created successfully`);

      // Convert properties to attributes that Azure Monitor recognizes
      const attributes: Record<string, string | number | boolean> = {};

      for (const [key, value] of Object.entries(properties)) {
        if (value !== undefined && value !== null) {
          if (typeof value === 'string') {
            attributes[key] = value;
          } else if (typeof value === 'number') {
            attributes[key] = value;
          } else if (typeof value === 'boolean') {
            attributes[key] = value;
          } else {
            attributes[key] = String(value);
          }
        }
      }

      // Determine event category based on event name
      let eventCategory = 'BusinessTelemetry';
      if (name.includes('LoginSession')) {
        eventCategory = 'UserSession';
      } else if (name.includes('Scenario')) {
        eventCategory = 'ScenarioEngagement';
      } else if (name === 'PageView') {
        eventCategory = 'Navigation';
      }

      // Add event metadata (matching lifecycle event structure)
      attributes['event.name'] = name;
      attributes['event.type'] = 'BusinessEvent';
      attributes['event.category'] = eventCategory;
      attributes['samplingPriority'] = 100; // Guarantee capture

      this.logger.log(`📊 [Telemetry] Converted ${Object.keys(attributes).length} attributes`);

      // Add all attributes to the span
      for (const [key, value] of Object.entries(attributes)) {
        span.setAttribute(key, value);
      }
      this.logger.log(`✅ [Telemetry] Attributes set on span`);

      // Add an event to the span - this creates an entry in Azure Monitor
      span.addEvent(name, attributes);
      this.logger.log(`✅ [Telemetry] Event added to span`);

      // End the span immediately (custom events are point-in-time)
      span.end();

      this.logger.log(`✅ [Telemetry] Event '${name}' sent successfully to OpenTelemetry`);
      this.logger.log(
        `🔍 [Telemetry] Query in Azure Monitor with: traces | where customDimensions["event.name"] == "${name}"`,
      );
      this.logger.log(
        `🔍 [Telemetry] Or by category: traces | where customDimensions["event.category"] == "${eventCategory}"`,
      );
      this.logger.log(`⏱️  [Telemetry] Data should appear in Azure Portal within 2-5 minutes`);
      this.logger.log('─'.repeat(80));
    } catch (error) {
      this.logger.error('─'.repeat(80));
      this.logger.error(`❌ [Telemetry] Failed to track event ${name}`);
      this.logger.error(
        `❌ [Telemetry] Error: ${error instanceof Error ? error.message : String(error)}`,
      );
      this.logger.error('─'.repeat(80));
    }
  }

  /**
   * Calculate duration in milliseconds between two ISO timestamp strings.
   */
  static calculateDurationMs(startTimestamp: string, endTimestamp: string): number {
    const start = new Date(startTimestamp).getTime();
    const end = new Date(endTimestamp).getTime();
    return Math.max(0, end - start);
  }

  /**
   * Generate a unique session identifier (UUID v4).
   */
  static generateSessionId(): string {
    // Use crypto.randomUUID if available (Node 19+), otherwise fallback to manual generation
    if (crypto?.randomUUID) {
      return crypto.randomUUID();
    }

    // Fallback UUID v4 generator
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }
}
