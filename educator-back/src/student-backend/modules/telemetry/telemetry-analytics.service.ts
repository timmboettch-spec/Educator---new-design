import { DefaultAzureCredential, ManagedIdentityCredential } from '@azure/identity';
import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import * as ExcelJS from 'exceljs';

import {
  type ScenarioAnalyticsDto,
  type UsageAnalyticsDto,
  type PageAnalyticsDto,
  type AnalyticsResponseDto,
} from './dto/analytics.dto';

/**
 * TelemetryAnalyticsService aggregates telemetry data from Azure Application Insights
 * to provide insights on simulation usage, engagement, and performance.
 *
 * Works with both OpenTelemetry and classic Application Insights telemetry data.
 *
 * Supports two authentication modes:
 * 1. API Key (development): Set APPINSIGHTS_AUTH_TYPE=api-key
 * 2. Managed Identity (production): Set APPINSIGHTS_AUTH_TYPE=managed-identity
 */
@Injectable()
export class TelemetryAnalyticsService {
  private readonly logger = new Logger(TelemetryAnalyticsService.name);
  private readonly appId: string | null = null;

  // Authentication configuration
  private readonly authType: 'api-key' | 'managed-identity';
  private readonly apiKey: string | null = null;
  private readonly credential: DefaultAzureCredential | ManagedIdentityCredential | null = null;
  private tokenCache: { token: string; expiresOn: number } | null = null;

  private readonly queryEndpoint: string;

  constructor() {
    this.logger.log('TelemetryAnalyticsService initialized for querying Azure Monitor');

    // Determine authentication type from environment
    const authTypeEnv = process.env.APPINSIGHTS_AUTH_TYPE?.toLowerCase();
    this.authType = authTypeEnv === 'managed-identity' ? 'managed-identity' : 'api-key';

    // Get App ID from environment or connection string
    this.appId = process.env.APPLICATIONINSIGHTS_APP_ID ?? null;
    if (!this.appId) {
      const connectionString = process.env.APPLICATIONINSIGHTS_CONNECTION_STRING;
      if (connectionString) {
        const match = connectionString.match(/ApplicationId=([^;]+)/);
        if (match) {
          this.appId = match[1];
          this.logger.log(`Extracted Application ID from connection string: ${this.appId}`);
        }
      }
    }

    this.queryEndpoint = 'https://api.applicationinsights.io/v1/apps';

    // Configure authentication based on type
    if (this.authType === 'managed-identity') {
      try {
        // Use ManagedIdentityCredential in production Azure environments
        // Falls back to DefaultAzureCredential for local development with Azure CLI
        if (process.env.NODE_ENV === 'production' || process.env.AZURE_CLIENT_ID) {
          this.credential = new ManagedIdentityCredential();
          this.logger.log('✅ Using Managed Identity authentication for Application Insights');
        } else {
          this.credential = new DefaultAzureCredential();
          this.logger.log('✅ Using DefaultAzureCredential (Azure CLI) for Application Insights');
        }

        if (!this.appId) {
          this.logger.error('Application ID is required for Managed Identity authentication');
        }
      } catch (error) {
        this.logger.error('Failed to initialize Managed Identity credential', error);
        this.logger.warn('Falling back to API key authentication');
        this.authType = 'api-key';
        this.apiKey = process.env.APPLICATIONINSIGHTS_API_KEY ?? null;
      }
    } else {
      // API Key authentication (development/fallback)
      this.apiKey = process.env.APPLICATIONINSIGHTS_API_KEY ?? null;

      if (!this.appId || !this.apiKey) {
        this.logger.warn(
          '⚠️ Application Insights Query API not configured. ' +
            'Set APPLICATIONINSIGHTS_APP_ID and APPLICATIONINSIGHTS_API_KEY environment variables. ' +
            'For production, use APPINSIGHTS_AUTH_TYPE=managed-identity instead. ' +
            'Analytics will return empty data until configured.',
        );
      } else {
        this.logger.log(
          `⚠️ Using API Key authentication for Application Insights (App ID: ${this.appId})`,
        );
        this.logger.log(
          '💡 For production, consider switching to APPINSIGHTS_AUTH_TYPE=managed-identity',
        );
      }
    }
  }

  /**
   * Get authentication header for Application Insights API
   * Supports both API Key and Managed Identity authentication
   */
  private async getAuthHeader(): Promise<Record<string, string>> {
    if (this.authType === 'managed-identity' && this.credential) {
      try {
        // Check if cached token is still valid (with 5-minute buffer)
        const now = Date.now();
        if (this.tokenCache && this.tokenCache.expiresOn > now + 300000) {
          return { Authorization: `Bearer ${this.tokenCache.token}` };
        }

        // Get new token from Azure AD
        this.logger.debug('Fetching new access token from Azure AD...');
        const tokenResponse = await this.credential.getToken(
          'https://api.applicationinsights.io/.default',
        );

        if (!tokenResponse) {
          throw new Error('Failed to get access token from Managed Identity');
        }

        // Cache the token
        this.tokenCache = {
          token: tokenResponse.token,
          expiresOn: tokenResponse.expiresOnTimestamp,
        };

        this.logger.debug('✅ Successfully obtained access token from Managed Identity');
        return { Authorization: `Bearer ${tokenResponse.token}` };
      } catch (error) {
        this.logger.error('Failed to get access token from Managed Identity', error);
        throw new Error(
          'Managed Identity authentication failed. Ensure the identity has "Monitoring Reader" role.',
        );
      }
    }

    // Fallback to API Key authentication
    if (!this.apiKey) {
      throw new Error('Application Insights API Key not configured');
    }
    return { 'X-Api-Key': this.apiKey };
  }

  /**
   * Execute a Kusto query against Application Insights
   */
  private async executeQuery(
    query: string,
  ): Promise<{ tables: Array<{ columns: Array<{ name: string }>; rows: unknown[][] }> }> {
    if (!this.appId) {
      this.logger.warn('Application ID not configured - returning empty results');
      return { tables: [] };
    }

    // Check authentication configuration
    if (this.authType === 'api-key' && !this.apiKey) {
      this.logger.warn('API Key not configured - returning empty results');
      return { tables: [] };
    }

    if (this.authType === 'managed-identity' && !this.credential) {
      this.logger.warn('Managed Identity not configured - returning empty results');
      return { tables: [] };
    }

    try {
      const url = `${this.queryEndpoint}/${this.appId}/query`;

      this.logger.debug(
        `Executing query with ${this.authType} authentication: ${query.substring(0, 100)}...`,
      );

      // Get authentication header (API Key or Managed Identity token)
      const authHeader = await this.getAuthHeader();

      const response = await axios.post(
        url,
        { query },
        {
          headers: {
            ...authHeader,
            'Content-Type': 'application/json',
          },
          timeout: 30000, // 30 second timeout
        },
      );

      return response.data as {
        tables: Array<{ columns: Array<{ name: string }>; rows: unknown[][] }>;
      };
    } catch (error) {
      this.logger.error('Failed to execute Application Insights query', error);
      if (axios.isAxiosError(error)) {
        this.logger.error(
          `Query error details: ${error.response?.status} - ${error.response?.statusText}`,
        );
        this.logger.error(`Error response: ${JSON.stringify(error.response?.data)}`);

        if (error.response?.status === 401 || error.response?.status === 403) {
          this.logger.error(
            'Authentication failed. ' +
              (this.authType === 'managed-identity'
                ? 'Ensure Managed Identity has "Monitoring Reader" role assigned.'
                : 'Check your API Key configuration.'),
          );
        }
      }
      throw error;
    }
  }

  /**
   * Parse query results into a usable format
   */
  private parseQueryResults(data: {
    tables: Array<{ columns: Array<{ name: string }>; rows: unknown[][] }>;
  }): Record<string, unknown>[] {
    if (!data.tables?.length) {
      return [];
    }

    const table = data.tables[0];
    const columns = table.columns.map((col) => col.name);
    const rows = table.rows;

    return rows.map((row) => {
      const obj: Record<string, unknown> = {};
      columns.forEach((col, index) => {
        obj[col] = row[index];
      });
      return obj;
    });
  }

  /**
   * Get comprehensive analytics from Application Insights.
   */
  async getAnalytics(daysBack: number = 30): Promise<AnalyticsResponseDto> {
    try {
      // Check if authentication is configured
      const isConfigured =
        this.appId &&
        ((this.authType === 'api-key' && this.apiKey) ??
          (this.authType === 'managed-identity' && this.credential));

      if (!isConfigured) {
        this.logger.warn('Query API not configured - returning empty analytics');
        return {
          scenarioAnalytics: [],
          usageAnalytics: {
            totalLoginSessions: 0,
            totalScenarioSessions: 0,
            uniqueStudents: 0,
            averageSessionDurationMs: 0,
            totalCompletedScenarios: 0,
            totalAbandonedScenarios: 0,
          },
          pageAnalytics: [],
          generatedAt: new Date().toISOString(),
        };
      }

      const scenarioAnalytics = await this.getScenarioAnalytics(daysBack);
      const usageAnalytics = await this.getUsageAnalytics(daysBack);
      const pageAnalytics = await this.getPageAnalytics(daysBack);

      return {
        scenarioAnalytics,
        usageAnalytics,
        pageAnalytics,
        generatedAt: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error('Failed to generate analytics', error);
      throw error;
    }
  }

  /**
   * Get scenario-level analytics (usage, completion, scores, etc.)
   */
  private async getScenarioAnalytics(daysBack: number = 30): Promise<ScenarioAnalyticsDto[]> {
    const query = `
let timeRange = ago(${daysBack}d);
let started = customEvents
| where timestamp > timeRange
| where name == "ScenarioStarted"
| extend 
    scenarioId = tostring(customDimensions.scenarioId),
    scenarioName = tostring(customDimensions.scenarioName),
    scenarioType = tostring(customDimensions.scenarioType)
| summarize 
    TotalStarts = count(),
    PracticeStarts = countif(scenarioType == "Practice"),
    AssessmentStarts = countif(scenarioType == "Assessment")
    by scenarioId, scenarioName;
let completed = customEvents
| where timestamp > timeRange
| where name == "ScenarioCompleted"
| extend 
    scenarioId = tostring(customDimensions.scenarioId),
    scenarioName = tostring(customDimensions.scenarioName),
    scenarioType = tostring(customDimensions.scenarioType),
    completionStatus = tostring(customDimensions.completionStatus),
    durationMs = todouble(customDimensions.durationMs),
    finalScore = todouble(customDimensions.finalScore),
    passed = tobool(customDimensions.passedAssessment)
| summarize 
    CompletedCount = countif(completionStatus == "Completed" or completionStatus == "Submitted"),
    AbandonedCount = countif(completionStatus == "Abandoned" or completionStatus == "TimedOut"),
    AvgDurationMs = avg(durationMs),
    AvgScore = avg(finalScore),
    PassCount = countif(passed == true),
    TotalWithResult = countif(isnotnull(passed))
    by scenarioId, scenarioName;
started
| join kind=leftouter completed on scenarioId
| extend 
    CompletedCount = iff(isnull(CompletedCount), 0, CompletedCount),
    AbandonedCount = iff(isnull(AbandonedCount), 0, AbandonedCount),
    AvgScore = iff(isnull(AvgScore), 0.0, AvgScore),
    AvgDurationMs = iff(isnull(AvgDurationMs), 0.0, AvgDurationMs),
    PassRate = iff(TotalWithResult > 0, (todouble(PassCount) / todouble(TotalWithResult)) * 100.0, 0.0),
    FailureRate = iff(TotalWithResult > 0, 100.0 - ((todouble(PassCount) / todouble(TotalWithResult)) * 100.0), 0.0)
| project 
    scenarioId = scenarioId,
    scenarioName = scenarioName,
    totalSessions = TotalStarts,
    completedSessions = toint(CompletedCount),
    abandonedSessions = toint(AbandonedCount),
    averageScore = AvgScore,
    averageDurationMs = AvgDurationMs,
    practiceCount = toint(PracticeStarts),
    assessmentCount = toint(AssessmentStarts),
    passRate = PassRate,
    failureRate = FailureRate
| order by totalSessions desc
    `;

    try {
      const data = await this.executeQuery(query);
      const results = this.parseQueryResults(data);

      return results.map((row) => ({
        scenarioId: row.scenarioId as string,
        scenarioName: row.scenarioName as string,
        totalSessions: row.totalSessions as number,
        completedSessions: row.completedSessions as number,
        abandonedSessions: row.abandonedSessions as number,
        averageScore: (row.averageScore as number | null) ?? undefined,
        averageDurationMs: row.averageDurationMs as number,
        practiceCount: row.practiceCount as number,
        assessmentCount: row.assessmentCount as number,
        passRate: (row.passRate as number | null) ?? undefined,
        failureRate: (row.failureRate as number | null) ?? undefined,
      }));
    } catch (error) {
      this.logger.error('Failed to get scenario analytics', error);
      return [];
    }
  }

  /**
   * Get overall usage analytics
   */
  private async getUsageAnalytics(daysBack: number = 30): Promise<UsageAnalyticsDto> {
    const query = `
let timeRange = ago(${daysBack}d);
let loginSessions = customEvents
| where timestamp > timeRange
| where name == "LoginSessionStarted"
| summarize TotalLoginSessions = count(), UniqueStudents = dcount(tostring(customDimensions.studentCode));
let scenarioStats = customEvents
| where timestamp > timeRange
| where name == "ScenarioCompleted"
| extend 
    completionStatus = tostring(customDimensions.completionStatus),
    durationMs = todouble(customDimensions.durationMs)
| summarize 
    TotalScenarioSessions = count(),
    CompletedCount = countif(completionStatus == "Completed" or completionStatus == "Submitted"),
    AbandonedCount = countif(completionStatus == "Abandoned" or completionStatus == "TimedOut"),
    AvgDurationMs = avg(durationMs);
loginSessions
| extend dummy = 1
| join kind=inner (scenarioStats | extend dummy = 1) on dummy
| project 
    totalLoginSessions = TotalLoginSessions,
    totalScenarioSessions = TotalScenarioSessions,
    uniqueStudents = toint(UniqueStudents),
    averageSessionDurationMs = AvgDurationMs,
    totalCompletedScenarios = toint(CompletedCount),
    totalAbandonedScenarios = toint(AbandonedCount)
    `;

    try {
      const data = await this.executeQuery(query);
      const results = this.parseQueryResults(data);

      if (results.length > 0) {
        const row = results[0];
        return {
          totalLoginSessions: (row.totalLoginSessions as number) ?? 0,
          totalScenarioSessions: (row.totalScenarioSessions as number) ?? 0,
          uniqueStudents: (row.uniqueStudents as number) ?? 0,
          averageSessionDurationMs: (row.averageSessionDurationMs as number) ?? 0,
          totalCompletedScenarios: (row.totalCompletedScenarios as number) ?? 0,
          totalAbandonedScenarios: (row.totalAbandonedScenarios as number) ?? 0,
        };
      }

      return {
        totalLoginSessions: 0,
        totalScenarioSessions: 0,
        uniqueStudents: 0,
        averageSessionDurationMs: 0,
        totalCompletedScenarios: 0,
        totalAbandonedScenarios: 0,
      };
    } catch (error) {
      this.logger.error('Failed to get usage analytics', error);
      return {
        totalLoginSessions: 0,
        totalScenarioSessions: 0,
        uniqueStudents: 0,
        averageSessionDurationMs: 0,
        totalCompletedScenarios: 0,
        totalAbandonedScenarios: 0,
      };
    }
  }

  /**
   * Get page usage analytics
   */
  private async getPageAnalytics(daysBack: number = 30): Promise<PageAnalyticsDto[]> {
    const query = `
customEvents
| where timestamp > ago(${daysBack}d)
| where name == "PageView"
| extend 
    pagePath = tostring(customDimensions.pagePath),
    pageTitle = tostring(customDimensions.pageTitle),
    studentCode = tostring(customDimensions.studentCode),
    durationMs = todouble(customDimensions.durationMs)
| summarize 
    totalViews = count(),
    uniqueStudents = dcount(studentCode),
    avgDurationMs = avg(durationMs)
    by pagePath, pageTitle
| order by totalViews desc
| limit 50
    `;

    try {
      const data = await this.executeQuery(query);
      const results = this.parseQueryResults(data);

      return results.map((row) => ({
        pagePath: row.pagePath as string,
        pageTitle: (row.pageTitle as string | null) ?? (row.pagePath as string),
        totalViews: row.totalViews as number,
        uniqueViewers: row.uniqueStudents as number,
        averageTimeMs: (row.avgDurationMs as number | null) ?? 0,
      }));
    } catch (error) {
      this.logger.error('Failed to get page analytics', error);
      return [];
    }
  }

  /**
   * Export analytics data in CSV or JSON format
   */
  async exportAnalytics(
    format: 'csv' | 'json' = 'csv',
    startDate?: string,
    _endDate?: string,
  ): Promise<string> {
    // Calculate days back based on date range
    let daysBack = 30;
    if (startDate) {
      const start = new Date(startDate);
      const now = new Date();
      daysBack = Math.ceil((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    }

    const analytics = await this.getAnalytics(daysBack);

    if (format === 'json') {
      return JSON.stringify(analytics, null, 2);
    }

    // CSV format
    const headers = [
      'Scenario ID',
      'Scenario Name',
      'Total Sessions',
      'Completed',
      'Abandoned',
      'Avg Score',
      'Avg Duration (min)',
      'Practice Count',
      'Assessment Count',
      'Pass Rate (%)',
      'Failure Rate (%)',
    ];

    const rows = analytics.scenarioAnalytics.map((s) => [
      s.scenarioId,
      s.scenarioName,
      s.totalSessions,
      s.completedSessions,
      s.abandonedSessions,
      s.averageScore?.toFixed(2) ?? 'N/A',
      (s.averageDurationMs / 60000).toFixed(2),
      s.practiceCount,
      s.assessmentCount,
      s.passRate?.toFixed(2) ?? 'N/A',
      s.failureRate?.toFixed(2) ?? 'N/A',
    ]);

    const csv = [headers.join(','), ...rows.map((row) => row.join(','))].join('\n');

    return csv;
  }

  /**
   * Export comprehensive telemetry data to Excel workbook
   */
  async exportToExcel(daysBack: number = 30): Promise<Buffer> {
    try {
      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'Realityworks AI';
      workbook.created = new Date();

      const analytics = await this.getAnalytics(daysBack);

      // Sheet 1: Scenario Analytics
      const scenarioSheet = workbook.addWorksheet('Scenario Analytics');
      scenarioSheet.columns = [
        { header: 'Scenario ID', key: 'scenarioId', width: 30 },
        { header: 'Scenario Name', key: 'scenarioName', width: 40 },
        { header: 'Total Sessions', key: 'totalSessions', width: 15 },
        { header: 'Completed', key: 'completedSessions', width: 12 },
        { header: 'Abandoned', key: 'abandonedSessions', width: 12 },
        { header: 'Avg Score', key: 'averageScore', width: 12 },
        { header: 'Avg Duration (min)', key: 'avgDurationMin', width: 18 },
        { header: 'Practice Count', key: 'practiceCount', width: 15 },
        { header: 'Assessment Count', key: 'assessmentCount', width: 18 },
        { header: 'Pass Rate (%)', key: 'passRate', width: 15 },
        { header: 'Failure Rate (%)', key: 'failureRate', width: 15 },
      ];

      analytics.scenarioAnalytics.forEach((s) => {
        scenarioSheet.addRow({
          scenarioId: s.scenarioId,
          scenarioName: s.scenarioName,
          totalSessions: s.totalSessions,
          completedSessions: s.completedSessions,
          abandonedSessions: s.abandonedSessions,
          averageScore: s.averageScore,
          avgDurationMin: s.averageDurationMs / 60000,
          practiceCount: s.practiceCount,
          assessmentCount: s.assessmentCount,
          passRate: s.passRate,
          failureRate: s.failureRate,
        });
      });

      // Format header row
      scenarioSheet.getRow(1).font = { bold: true };
      scenarioSheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFD3D3D3' },
      };

      // Sheet 2: Usage Summary
      const usageSheet = workbook.addWorksheet('Usage Summary');
      usageSheet.columns = [
        { header: 'Metric', key: 'metric', width: 30 },
        { header: 'Value', key: 'value', width: 20 },
      ];

      const usage = analytics.usageAnalytics;
      usageSheet.addRows([
        { metric: 'Total Login Sessions', value: usage.totalLoginSessions },
        { metric: 'Total Scenario Sessions', value: usage.totalScenarioSessions },
        { metric: 'Unique Students', value: usage.uniqueStudents },
        {
          metric: 'Avg Session Duration (min)',
          value: (usage.averageSessionDurationMs / 60000).toFixed(2),
        },
        { metric: 'Total Completed Scenarios', value: usage.totalCompletedScenarios },
        { metric: 'Total Abandoned Scenarios', value: usage.totalAbandonedScenarios },
        {
          metric: 'Completion Rate (%)',
          value:
            usage.totalScenarioSessions > 0
              ? ((usage.totalCompletedScenarios / usage.totalScenarioSessions) * 100).toFixed(2)
              : 0,
        },
      ]);

      usageSheet.getRow(1).font = { bold: true };
      usageSheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFD3D3D3' },
      };

      // Sheet 3: Page Analytics
      const pageSheet = workbook.addWorksheet('Page Analytics');
      pageSheet.columns = [
        { header: 'Page Path', key: 'pagePath', width: 40 },
        { header: 'Page Title', key: 'pageTitle', width: 40 },
        { header: 'Total Views', key: 'totalViews', width: 15 },
        { header: 'Unique Students', key: 'uniqueStudents', width: 18 },
        { header: 'Avg Duration (sec)', key: 'avgDurationSec', width: 20 },
      ];

      analytics.pageAnalytics.forEach((p) => {
        pageSheet.addRow({
          pagePath: p.pagePath,
          pageTitle: p.pageTitle,
          totalViews: p.totalViews,
          uniqueStudents: p.uniqueViewers,
          avgDurationSec: p.averageTimeMs / 1000,
        });
      });

      pageSheet.getRow(1).font = { bold: true };
      pageSheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFD3D3D3' },
      };

      const buffer = await workbook.xlsx.writeBuffer();
      return Buffer.from(buffer);
    } catch (error) {
      this.logger.error('Failed to generate Excel export', error);
      throw error;
    }
  }
}
