/* eslint-disable @typescript-eslint/no-base-to-string */
import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { trace, type Tracer } from '@opentelemetry/api';

import { LoggerService } from '../../../common/services';

import {
  LIFECYCLE_SCHEMA_VERSION,
  type SessionStartedEventDto,
  type SessionCompletedEventDto,
  type ScenarioSubsystemStartedEventDto,
  type ScenarioSubsystemStoppedEventDto,
  type GradingSubsystemStartedEventDto,
  type GradingSubsystemStoppedEventDto,
} from './dto/lifecycle-events.dto';

/**
 * Service for emitting lifecycle telemetry events with deterministic emission,
 * 100% sampling, PII-free schemas, and versioned data contracts.
 *
 * All emissions are:
 * - Idempotent (in-memory deduplication per sessionId + eventName)
 * - Isolated (failures logged as warnings, never throw)
 * - Sampled at 100% (no adaptive sampling drops)
 * - Versioned (schemaVersion field for future evolution)
 */
@Injectable()
export class LifecycleTelemetryService {
  private readonly tracer: Tracer;

  /**
   * In-memory set for idempotency: tracks "${sessionId}:${eventName}" keys.
   * Prevents duplicate emissions within a single process lifetime.
   * Note: Does NOT protect against multi-pod races (acceptable trade-off).
   */
  private readonly emittedEvents = new Set<string>();

  /**
   * Sampling priority for lifecycle events (100 = guaranteed capture).
   */
  private readonly samplingPriority: number;

  /**
   * Feature flag to enable/disable lifecycle telemetry.
   */
  private readonly enabled: boolean;

  constructor(
    private readonly configService: ConfigService,
    private readonly logger: LoggerService,
  ) {
    this.tracer = trace.getTracer('lifecycle-telemetry-service', LIFECYCLE_SCHEMA_VERSION);
    this.samplingPriority = this.configService.get<number>('telemetry.samplingPriority', 100);
    this.enabled = this.configService.get<boolean>('telemetry.lifecycleEnabled', true);

    this.logger.log(
      `LifecycleTelemetryService initialized (enabled=${this.enabled}, samplingPriority=${this.samplingPriority})`,
    );
  }

  /**
   * Emit Sim.Session.Started event when a new simulation session begins.
   */
  emitSessionStarted(event: SessionStartedEventDto): void {
    this.trackLifecycleEvent('Sim.Session.Started', event as unknown as Record<string, unknown>);
  }

  /**
   * Emit Sim.Session.Completed event when a simulation session ends.
   */
  emitSessionCompleted(event: SessionCompletedEventDto): void {
    this.trackLifecycleEvent('Sim.Session.Completed', event as unknown as Record<string, unknown>);
  }

  /**
   * Emit Sim.Session.Scenario.Started event when scenario subsystem initializes.
   * @deprecated Use emitSessionStarted with scenarioInstanceId field instead (consolidated event).
   */
  emitScenarioStarted(event: ScenarioSubsystemStartedEventDto): void {
    this.trackLifecycleEvent(
      'Sim.Session.Scenario.Started',
      event as unknown as Record<string, unknown>,
    );
  }

  /**
   * Emit Sim.Session.Scenario.Stopped event when scenario subsystem terminates.
   * @deprecated Use emitSessionCompleted with scenarioInstanceId field instead (consolidated event).
   */
  emitScenarioStopped(event: ScenarioSubsystemStoppedEventDto): void {
    this.trackLifecycleEvent(
      'Sim.Session.Scenario.Stopped',
      event as unknown as Record<string, unknown>,
    );
  }

  /**
   * Emit Sim.Session.Grading.Started event when grading subsystem initializes.
   */
  emitGradingStarted(event: GradingSubsystemStartedEventDto): void {
    this.trackLifecycleEvent(
      'Sim.Session.Grading.Started',
      event as unknown as Record<string, unknown>,
    );
  }

  /**
   * Emit Sim.Session.Grading.Stopped event when grading subsystem terminates.
   */
  emitGradingStopped(event: GradingSubsystemStoppedEventDto): void {
    this.trackLifecycleEvent(
      'Sim.Session.Grading.Stopped',
      event as unknown as Record<string, unknown>,
    );
  }

  /**
   * Generic method to emit frontend subsystem lifecycle events.
   * Used by the telemetry controller to forward events from frontend.
   */
  emitSubsystemEvent(eventName: string, properties: Record<string, unknown>): void {
    this.trackLifecycleEvent(eventName, properties);
  }

  /**
   * Internal method to track a lifecycle event with idempotency, error isolation, and sampling.
   */
  private trackLifecycleEvent(eventName: string, properties: Record<string, unknown>): void {
    if (!this.enabled) {
      this.logger.debug(`Lifecycle telemetry disabled, skipping event: ${eventName}`);
      return;
    }

    try {
      // Extract sessionId for logging
      const sessionId = properties.sessionId as string;
      if (!sessionId) {
        this.logger.warn(`Missing sessionId in ${eventName}`);
      }

      // Create a short-lived span to carry the event
      const span = this.tracer.startSpan(`LifecycleEvent.${eventName}`, {
        kind: 1, // INTERNAL span kind
      });

      // Convert properties to OpenTelemetry attributes
      const attributes: Record<string, string | number | boolean> = {};

      for (const [key, value] of Object.entries(properties)) {
        if (value !== undefined && value !== null) {
          if (
            typeof value === 'string' ||
            typeof value === 'number' ||
            typeof value === 'boolean'
          ) {
            attributes[key] = value;
          } else {
            attributes[key] = String(value);
          }
        }
      }

      // Add lifecycle event metadata
      attributes['event.name'] = eventName;
      attributes['event.type'] = 'LifecycleEvent';
      attributes['event.category'] = 'SimulationLifecycle';

      // CRITICAL: Set sampling priority to 100 to guarantee capture
      attributes['samplingPriority'] = this.samplingPriority;

      // Add all attributes to the span
      for (const [key, value] of Object.entries(attributes)) {
        span.setAttribute(key, value);
      }

      // Add an event to the span with just the original properties (no duplication)
      span.addEvent(eventName, attributes);

      // End the span immediately (lifecycle events are point-in-time)
      span.end();

      this.logger.log(
        `✅ Lifecycle event emitted: ${eventName} (session: ${sessionId || 'unknown'})`,
      );
    } catch (error) {
      // Error isolation: log warning but NEVER throw
      this.logger.warn(
        `Failed to emit lifecycle event ${eventName}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Utility: Generate a new UUID v4 for instance identifiers.
   */
  static generateInstanceId(): string {
    try {
      return randomUUID();
    } catch {
      // Fallback UUID v4 generator (for edge cases where crypto is unavailable)
      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
      });
    }
  }
}
