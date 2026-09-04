import { Body, Controller, Get, Headers, Param, Post, Query, Res, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { type Response } from 'express';

import { ScenarioAuthGuard } from '../../guards/scenario-auth.guard';

import { CreateReportDto } from './dto/create-report.dto';
import { SendReportEmailDto } from './dto/send-report-email.dto';
import { ReportsService } from './reports.service';

/**
 * Convert an `Accept-Language` header value ("es", "es-419,es;q=0.9,en;q=0.8",
 * etc.) into one of the app's supported UI locales. Falls back to English for
 * anything unrecognized so no request ever fails on this alone.
 */
function normalizeLanguage(header?: string): 'en' | 'es' {
  if (!header) {
    return 'en';
  }
  const primary = header.split(',')[0]?.trim().toLowerCase() ?? '';
  if (primary.startsWith('es')) {
    return 'es';
  }
  return 'en';
}

@ApiTags('Student-backend: Reports')
@ApiBearerAuth()
@UseGuards(ScenarioAuthGuard)
@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get()
  @ApiOperation({ summary: 'Get all reports for the current user' })
  @ApiResponse({ status: 200, description: 'Return reports array' })
  async findAll(@Headers('authorization') auth: string) {
    const userId = this.extractUserId(auth);
    return this.reportsService.findAll(userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get report by ID' })
  @ApiResponse({ status: 200, description: 'Return report' })
  @ApiResponse({ status: 404, description: 'Report not found' })
  async findOne(@Param('id') id: string, @Headers('authorization') auth: string) {
    const userId = this.extractUserId(auth);
    return this.reportsService.findOne(id, userId);
  }

  @Get('transcript/:transcriptId')
  @ApiOperation({ summary: 'Get report by transcript ID' })
  @ApiResponse({ status: 200, description: 'Return report' })
  @ApiResponse({ status: 404, description: 'Report not found' })
  async findByTranscriptId(
    @Param('transcriptId') transcriptId: string,
    @Headers('authorization') auth: string,
  ) {
    const userId = this.extractUserId(auth);
    return this.reportsService.findByTranscriptId(transcriptId, userId);
  }

  @Post(':id/email')
  @ApiOperation({ summary: 'Send the selected report via email' })
  @ApiResponse({ status: 200, description: 'Report emailed' })
  async emailReport(
    @Param('id') reportId: string,
    @Body() payload: SendReportEmailDto,
    @Headers('authorization') auth?: string,
  ) {
    const userId = this.extractUserId(auth);
    return this.reportsService.sendReportEmail({
      reportId,
      userId,
      recipient: payload.to,
      message: payload.message,
      studentName: payload.studentName,
      studentClass: payload.studentClass,
      key: payload.key,
    });
  }

  @Post('create')
  @ApiOperation({ summary: 'Create report with AI analysis from transcript' })
  @ApiResponse({ status: 201, description: 'Report created with AI analysis' })
  async createReport(
    @Body() dto: CreateReportDto,
    @Headers('accept-language') acceptLanguage?: string,
  ) {
    // The Accept-Language header tells us which UI locale the student is
    // using so the LLM can emit summary / strengths / weaknesses /
    // recommendations in that language. We keep the DTO shape unchanged
    // so the strict ValidationPipe doesn't reject the request body.
    const language = normalizeLanguage(acceptLanguage);
    return this.reportsService.createReportWithAI(dto, language);
  }

  @Get('metrices/download-excel')
  @ApiOperation({
    summary: 'Download reports as Excel file with optional date filtering',
  })
  @ApiResponse({ status: 200, description: 'Excel file downloaded' })
  async downloadExcel(@Query('date') date?: string, @Res() res?: Response) {
    let startDate: string | undefined;
    let endDate: string | undefined;
    let dateLabel = 'all-reports';

    if (date) {
      // Get current time in CST
      const nowCST = new Date().toLocaleString('en-US', {
        timeZone: 'America/Chicago',
      });
      const cstDate = new Date(nowCST);
      const targetDate = new Date(cstDate);

      if (date.toLowerCase() === 'today') {
        targetDate.setHours(0, 0, 0, 0);
      } else if (date.toLowerCase() === 'yesterday') {
        targetDate.setDate(cstDate.getDate() - 1);
        targetDate.setHours(0, 0, 0, 0);
      } else if (date.toLowerCase() === 'tomorrow') {
        targetDate.setDate(cstDate.getDate() + 1);
        targetDate.setHours(0, 0, 0, 0);
      } else {
        // Assume it's a date string like '2024-01-15'
        targetDate.setTime(new Date(date).getTime());
        targetDate.setHours(0, 0, 0, 0);
      }

      // Format date label manually to avoid timezone conversion issues
      const month = String(targetDate.getMonth() + 1).padStart(2, '0');
      const day = String(targetDate.getDate()).padStart(2, '0');
      const year = targetDate.getFullYear();
      dateLabel = `${month}-${day}-${year}`;

      startDate = targetDate.toISOString();
      const endOfDay = new Date(targetDate);
      endOfDay.setHours(23, 59, 59, 999);
      endDate = endOfDay.toISOString();
    }

    const buffer = await this.reportsService.generateExcelReport(startDate, endDate);

    if (res) {
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      res.setHeader(
        'Content-Disposition',
        `attachment; filename=simulation-reports-${dateLabel}.xlsx`,
      );
      res.send(buffer);
    }
  }

  @Post('evaluate-communication')
  @ApiOperation({
    summary: 'Evaluate communication transcript using LLM concepts',
  })
  @ApiResponse({ status: 200, description: 'Communication evaluation result' })
  async evaluateCommunication(
    @Body('transcript') transcript: string,
    @Body('threshold') threshold?: number,
  ) {
    return this.reportsService.evaluateCommunication(transcript, threshold);
  }

  @Post('evaluate-question')
  @ApiOperation({
    summary: 'Evaluate student question response against concept checkpoints',
  })
  @ApiResponse({ status: 200, description: 'Question evaluation result' })
  async evaluateQuestion(
    @Body('responseText') responseText: string,
    @Body('concepts') concepts: unknown[],
  ) {
    return this.reportsService.evaluateQuestionResponse(
      responseText,
      concepts as Parameters<typeof this.reportsService.evaluateQuestionResponse>[1],
    );
  }

  @Post('evaluate-site')
  @ApiOperation({
    summary: 'Evaluate medication administration site with clinical synonym support',
  })
  @ApiResponse({ status: 200, description: 'Site evaluation result' })
  async evaluateSite(
    @Body('expectedSite') expectedSite: string,
    @Body('actualSite') actualSite: string,
  ) {
    return this.reportsService.evaluateMedicationSite(expectedSite, actualSite);
  }

  @Post('evaluate-route-site')
  @ApiOperation({
    summary: 'Evaluate medication route and site with LLM clinical synonym support',
  })
  @ApiResponse({ status: 200, description: 'Route and site evaluation results' })
  async evaluateRouteSite(
    @Body('expectedRoute') expectedRoute: string,
    @Body('actualRoute') actualRoute: string,
    @Body('expectedSite') expectedSite: string,
    @Body('actualSite') actualSite: string,
  ) {
    return this.reportsService.evaluateMedicationRouteSite(
      expectedRoute,
      actualRoute,
      expectedSite,
      actualSite,
    );
  }

  private extractUserId(auth?: string): string {
    const token = auth?.replace('Bearer ', '');
    return token?.replace('token-', '') ?? 'user-001';
  }
}
