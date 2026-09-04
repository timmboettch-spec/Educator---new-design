import { Module, Global } from '@nestjs/common';

import { LifecycleTelemetryService } from './lifecycle-telemetry.service';
import { TelemetryAnalyticsService } from './telemetry-analytics.service';
import { TelemetryController } from './telemetry.controller';
import { TelemetryService } from './telemetry.service';

/**
 * TelemetryModule provides a global telemetry service for tracking
 * business-level events across the application.
 *
 * This module is marked as @Global, so TelemetryService can be injected
 * into any module without explicit imports.
 *
 * Analytics are retrieved from Azure Application Insights via Query API.
 */
@Global()
@Module({
  imports: [],
  controllers: [TelemetryController],
  providers: [TelemetryService, TelemetryAnalyticsService, LifecycleTelemetryService],
  exports: [TelemetryService, TelemetryAnalyticsService, LifecycleTelemetryService],
})
export class TelemetryModule {}
