import { Controller, Post, Body, Get, Query, Logger, Res, HttpCode } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { type Response } from 'express';

import { type AnalyticsResponseDto } from './dto/analytics.dto';
import { SubsystemLifecycleEventDto } from './dto/lifecycle-events.dto';
import {
  TrackScenarioStartedDto,
  TrackScenarioCompletedDto,
  TrackPageViewDto,
  TrackLoginSessionStartedDto,
  TrackLoginSessionEndedDto,
} from './dto/track-scenario.dto';
import { LifecycleTelemetryService } from './lifecycle-telemetry.service';
import { TelemetryAnalyticsService } from './telemetry-analytics.service';
import { TelemetryService, SessionEndReason, CompletionStatus } from './telemetry.service';

@ApiTags('Student-backend: Telemetry')
@Controller('telemetry')
export class TelemetryController {
  private readonly logger = new Logger(TelemetryController.name);

  constructor(
    private readonly telemetryService: TelemetryService,
    private readonly lifecycleTelemetryService: LifecycleTelemetryService,
    private readonly analyticsService: TelemetryAnalyticsService,
  ) {}

  @Post('login-session-started')
  @ApiOperation({ summary: 'Track login session started event' })
  trackLoginSessionStarted(@Body() dto: TrackLoginSessionStartedDto) {
    this.logger.log('═'.repeat(80));
    this.logger.log(`📥 [Controller] Received LOGIN-SESSION-STARTED event`);
    this.logger.log(`   Session ID: ${dto.loginSessionId}`);
    this.logger.log(`   Student: ${dto.studentCode}`);
    this.logger.log(`   Device: ${dto.deviceType ?? 'unknown'}`);
    this.logger.log(`   Platform: ${dto.platform ?? 'unknown'}`);
    this.logger.log(`   Timestamp: ${dto.loginTimestamp}`);
    this.logger.log(`🔄 [Controller] Forwarding to TelemetryService...`);

    this.telemetryService.trackLoginSessionStarted(dto);

    this.logger.log(`✅ [Controller] Event forwarded successfully`);
    this.logger.log(
      `🔍 [Controller] Query in Azure: traces | where customDimensions["event.name"] == "LoginSessionStarted"`,
    );
    this.logger.log(
      `🔍 [Controller] Or by category: traces | where customDimensions["event.category"] == "UserSession"`,
    );
    this.logger.log('═'.repeat(80));

    return { success: true };
  }

  @Post('login-session-ended')
  @ApiOperation({ summary: 'Track login session ended event' })
  trackLoginSessionEnded(@Body() dto: TrackLoginSessionEndedDto) {
    this.logger.log('═'.repeat(80));
    this.logger.log(`📥 [Controller] Received LOGIN-SESSION-ENDED event`);
    this.logger.log(`   Session ID: ${dto.loginSessionId}`);
    this.logger.log(`   Student: ${dto.studentCode}`);
    this.logger.log(`   Duration: ${Math.round(dto.sessionDurationMs / 1000)}s`);
    this.logger.log(`   End Reason: ${dto.endReason}`);
    this.logger.log(`🔄 [Controller] Forwarding to TelemetryService...`);

    // Map string endReason to SessionEndReason enum
    const endReasonMap: Record<string, SessionEndReason> = {
      Logout: SessionEndReason.Logout,
      Timeout: SessionEndReason.Timeout,
      Expired: SessionEndReason.Expired,
    };

    this.telemetryService.trackLoginSessionEnded({
      ...dto,
      endReason: endReasonMap[dto.endReason] || SessionEndReason.Logout,
    });

    this.logger.log(`✅ [Controller] Event forwarded successfully`);
    this.logger.log(
      `🔍 [Controller] Query in Azure: traces | where customDimensions["event.name"] == "LoginSessionEnded"`,
    );
    this.logger.log(
      `🔍 [Controller] Or by category: traces | where customDimensions["event.category"] == "UserSession"`,
    );
    this.logger.log('═'.repeat(80));

    return { success: true };
  }

  @Post('page-view')
  @ApiOperation({ summary: 'Track page view event' })
  trackPageView(@Body() dto: TrackPageViewDto) {
    this.logger.debug(
      `📄 [Controller] Received PAGE-VIEW: ${dto.pagePath} (${dto.pageTitle ?? 'no title'})`,
    );

    this.telemetryService.trackPageView(dto);

    this.logger.debug(
      `🔍 [Controller] Query in Azure: traces | where customDimensions["event.name"] == "PageView"`,
    );

    return { success: true };
  }

  @Post('scenario-started')
  @ApiOperation({ summary: 'Track scenario started event' })
  trackScenarioStarted(@Body() dto: TrackScenarioStartedDto) {
    this.logger.log('═'.repeat(80));
    this.logger.log(`📥 [Controller] Received SCENARIO-STARTED event`);
    this.logger.log(`   Scenario: ${dto.scenarioName} (${dto.scenarioId})`);
    this.logger.log(`   Type: ${dto.scenarioType}`);
    this.logger.log(`   Session ID: ${dto.scenarioSessionId}`);
    this.logger.log(`   Student: ${dto.studentCode}`);
    this.logger.log(`   Login Session: ${dto.loginSessionId}`);
    this.logger.log(`   Timestamp: ${dto.startTimestamp}`);
    this.logger.log(`🔄 [Controller] Forwarding to TelemetryService...`);

    this.telemetryService.trackScenarioStarted(dto);

    this.logger.log(`✅ [Controller] Event forwarded successfully`);
    this.logger.log(
      `🔍 [Controller] Query in Azure: traces | where customDimensions["event.name"] == "ScenarioStarted"`,
    );
    this.logger.log(
      `🔍 [Controller] Or by category: traces | where customDimensions["event.category"] == "ScenarioEngagement"`,
    );
    this.logger.log('═'.repeat(80));

    return { success: true };
  }

  @Post('scenario-completed')
  @ApiOperation({ summary: 'Track scenario completed event' })
  trackScenarioCompleted(@Body() dto: TrackScenarioCompletedDto) {
    this.logger.log('═'.repeat(80));
    this.logger.log(`📥 [Controller] Received SCENARIO-COMPLETED event`);
    this.logger.log(`   Scenario: ${dto.scenarioName} (${dto.scenarioId})`);
    this.logger.log(`   Type: ${dto.scenarioType}`);
    this.logger.log(`   Status: ${dto.completionStatus}`);
    this.logger.log(`   Duration: ${Math.round(dto.durationMs / 1000)}s`);
    this.logger.log(`   Session ID: ${dto.scenarioSessionId}`);
    this.logger.log(`   Student: ${dto.studentCode}`);

    // Log abandoned scenarios for debugging
    if (
      dto.completionStatus === CompletionStatus.Abandoned ||
      dto.completionStatus === CompletionStatus.TimedOut
    ) {
      this.logger.warn(`⚠️  [Controller] ABANDONED SCENARIO DETECTED!`);
      this.logger.warn(`   This event will be tracked in Azure Monitor`);
    }

    if (dto.finalScore !== undefined) {
      this.logger.log(
        `   Score: ${dto.finalScore}/${dto.passingScore} (${dto.passedAssessment ? 'PASSED' : 'FAILED'})`,
      );
    }

    this.logger.log(`🔄 [Controller] Forwarding to TelemetryService...`);

    this.telemetryService.trackScenarioCompleted(dto);

    this.logger.log(`✅ [Controller] Event forwarded successfully`);
    this.logger.log(
      `🔍 [Controller] Query in Azure: traces | where customDimensions["event.name"] == "ScenarioCompleted"`,
    );
    this.logger.log(
      `🔍 [Controller] Or by category: traces | where customDimensions["event.category"] == "ScenarioEngagement"`,
    );
    this.logger.log('═'.repeat(80));

    return { success: true };
  }

  @Post('subsystem-lifecycle')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Track frontend subsystem lifecycle events (Avatar, SpeechAI, LLM, TTS, Media)',
  })
  trackSubsystemLifecycle(@Body() dto: SubsystemLifecycleEventDto) {
    this.logger.debug(
      `📥 [Lifecycle] ${dto.eventName} (session: ${dto.sessionId.substring(0, 8)}..., subsystem: ${dto.subsystemInstanceId.substring(0, 8)}...)`,
    );

    // Convert DTO to properties object
    const properties: Record<string, unknown> = {
      sessionId: dto.sessionId,
      transcriptId: dto.transcriptId,
      subsystemInstanceId: dto.subsystemInstanceId,
      startedAtUtc: dto.startedAtUtc,
      schemaVersion: dto.schemaVersion,
    };

    // Add optional fields if present
    if (dto.stoppedAtUtc) {
      properties.stoppedAtUtc = dto.stoppedAtUtc;
    }
    if (dto.durationMs !== undefined) {
      properties.durationMs = dto.durationMs;
    }
    if (dto.stopReason) {
      properties.stopReason = dto.stopReason;
    }
    if (dto.errorCode) {
      properties.errorCode = dto.errorCode;
    }
    if (dto.provider) {
      properties.provider = dto.provider;
    }
    if (dto.providerModelVersion) {
      properties.providerModelVersion = dto.providerModelVersion;
    }
    if (dto.avatarType) {
      properties.avatarType = dto.avatarType;
    }
    if (dto.voiceId) {
      properties.voiceId = dto.voiceId;
    }
    if (dto.charactersSynthesizedTotal !== undefined) {
      properties.charactersSynthesizedTotal = dto.charactersSynthesizedTotal;
    }
    if (dto.transport) {
      properties.transport = dto.transport;
    }
    if (dto.reconnectCount !== undefined) {
      properties.reconnectCount = dto.reconnectCount;
    }

    // Forward to lifecycle telemetry service
    this.lifecycleTelemetryService.emitSubsystemEvent(dto.eventName, properties);

    // 204 No Content (no return body needed for telemetry)
  }

  @Get('analytics')
  @ApiOperation({ summary: 'Get telemetry analytics from Azure Application Insights' })
  @ApiQuery({
    name: 'daysBack',
    required: false,
    description: 'Number of days of data to retrieve (default: 30)',
  })
  async getAnalytics(@Query('daysBack') daysBack?: number): Promise<AnalyticsResponseDto> {
    return this.analyticsService.getAnalytics(daysBack ? parseInt(String(daysBack)) : 30);
  }

  @Get('analytics/export')
  @ApiOperation({ summary: 'Export analytics data' })
  @ApiQuery({ name: 'format', enum: ['csv', 'json'], required: false })
  @ApiQuery({ name: 'startDate', required: false })
  @ApiQuery({ name: 'endDate', required: false })
  async exportAnalytics(
    @Query('format') format: 'csv' | 'json' = 'csv',
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const data = await this.analyticsService.exportAnalytics(format, startDate, endDate);

    if (format === 'csv') {
      return {
        data,
        contentType: 'text/csv',
        filename: `analytics-${new Date().toISOString().split('T')[0]}.csv`,
      };
    }

    return {
      data,
      contentType: 'application/json',
      filename: `analytics-${new Date().toISOString().split('T')[0]}.json`,
    };
  }

  @Get('analytics/export/excel')
  @ApiOperation({
    summary: 'Export comprehensive telemetry data to Excel',
    description:
      'Downloads an Excel workbook with multiple sheets for comprehensive telemetry analysis',
  })
  async exportToExcel(@Res() res: Response) {
    try {
      const buffer = await this.analyticsService.exportToExcel();

      const filename = `telemetry-export-${new Date().toISOString().split('T')[0]}.xlsx`;

      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Length', buffer.length);

      res.send(buffer);
    } catch (error) {
      this.logger.error('Failed to export Excel file', error);
      res.status(500).json({
        error: 'Failed to generate Excel export',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
}
