import { Body, Controller, Get, Headers, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags, ApiBearerAuth } from '@nestjs/swagger';

import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import type { ICurrentUser } from 'src/common/interfaces';

import { CreateReportDto } from './dto/create-report.dto';
import { SendReportEmailDto } from './dto/send-report-email.dto';
import { ReportsService } from './reports.service';
import { RequiredRoles } from 'src/common/decorators/required-roles.decorator';
import { RoleSlug } from 'src/common/constants';

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
@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get()
  @RequiredRoles(RoleSlug.STUDENT)
  @ApiOperation({ summary: 'Get all reports for the current user' })
  @ApiResponse({ status: 200, description: 'Return reports array' })
  async findAll(
    @CurrentUser() currentUser: ICurrentUser | undefined,
    @Query('mode') mode?: string,
  ) {
    return this.reportsService.findAll(currentUser, mode);
  }

  @Get(':id')
  @RequiredRoles(RoleSlug.STUDENT)
  @ApiOperation({ summary: 'Get report by ID' })
  @ApiResponse({ status: 200, description: 'Return report' })
  @ApiResponse({ status: 404, description: 'Report not found' })
  async findOne(@Param('id') id: string, @CurrentUser() currentUser: ICurrentUser | undefined) {
    return this.reportsService.findOne(id, currentUser);
  }

  @Get('transcript/:transcriptId')
  @RequiredRoles(RoleSlug.STUDENT)
  @ApiOperation({ summary: 'Get report by transcript ID' })
  @ApiResponse({ status: 200, description: 'Return report' })
  @ApiResponse({ status: 404, description: 'Report not found' })
  async findByTranscriptId(
    @Param('transcriptId') transcriptId: string,
    @CurrentUser() currentUser: ICurrentUser | undefined,
  ) {
    return this.reportsService.findByTranscriptId(transcriptId, currentUser);
  }

  @Post(':id/email')
  @RequiredRoles(RoleSlug.STUDENT)
  @ApiOperation({ summary: 'Send the selected report via email' })
  @ApiResponse({ status: 200, description: 'Report emailed' })
  async emailReport(
    @Param('id') reportId: string,
    @Body() payload: SendReportEmailDto,
    @CurrentUser() currentUser: ICurrentUser | undefined,
    @Headers('authorization') auth?: string,
  ) {
    const userId = this.extractUserId(auth);
    return this.reportsService.sendReportEmail({
      reportId,
      userId,
      currentUser,
      recipient: payload.to,
      message: payload.message,
      studentName: payload.studentName,
      studentClass: payload.studentClass,
      key: payload.key,
    });
  }

  @Post('create')
  @RequiredRoles(RoleSlug.STUDENT)
  @ApiOperation({ summary: 'Create report with AI analysis from transcript' })
  @ApiResponse({ status: 201, description: 'Report created with AI analysis' })
  async createReport(
    @Body() dto: CreateReportDto,
    @CurrentUser() currentUser: ICurrentUser,
    @Headers('accept-language') acceptLanguage?: string,
  ) {
    // The Accept-Language header tells us which UI locale the student is
    // using so the LLM can emit summary / strengths / weaknesses /
    // recommendations in that language. We keep the DTO shape unchanged
    // so the strict ValidationPipe doesn't reject the request body.
    const language = normalizeLanguage(acceptLanguage);
    return this.reportsService.createReportWithAI(currentUser, dto, language);
  }

  @Post('evaluate-communication')
  @RequiredRoles(RoleSlug.STUDENT, RoleSlug.EDUCATOR)
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
  @RequiredRoles(RoleSlug.STUDENT, RoleSlug.EDUCATOR)
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
  @RequiredRoles(RoleSlug.STUDENT, RoleSlug.EDUCATOR)
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
  @RequiredRoles(RoleSlug.STUDENT, RoleSlug.EDUCATOR)
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
