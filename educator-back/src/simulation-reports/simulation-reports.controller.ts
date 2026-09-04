import {
  Controller,
  Post,
  Get,
  Patch,
  Param,
  Body,
  UseGuards,
  Res,
  Query,
  Req,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { SimulationReportsService } from './simulation-reports.service';
import { throwAppError } from 'src/common/utils/app-error';
import { AppStatus } from 'src/common/utils/messages';
import { ApiResponse } from 'src/common/types';
import type { JwtRequest } from 'src/common/types';
import { SimulationReportConstants } from './simulation-reports.constant';
import { Public } from 'src/common/decorators/public.decorator';

@ApiTags(SimulationReportConstants.SWAGGER.TAG)
@Controller(SimulationReportConstants.ROUTES.BASE)
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('JWT-auth')
export class SimulationReportsController {
  constructor(private readonly service: SimulationReportsService) {}

  @Get()
  @ApiOperation({ summary: SimulationReportConstants.SWAGGER.GET_ALL })
  async findAll(
    @Query('take') takeRaw?: string,
    @Query('skip') skipRaw?: string,
    @Query('studentId') studentId?: string,
    @Query('scenarioId') scenarioId?: string,
    @Query('includeBlob') includeBlobRaw?: string,
  ): Promise<ApiResponse> {
    const take = takeRaw !== undefined ? Number.parseInt(takeRaw, 10) : undefined;
    const skip = skipRaw !== undefined ? Number.parseInt(skipRaw, 10) : undefined;
    const includeBlob =
      includeBlobRaw !== undefined ? includeBlobRaw.toLowerCase() !== 'false' : undefined;

    const result = await this.service.findAll({
      take,
      skip,
      studentId,
      scenarioId,
      includeBlob,
    });
    if (!result.success) throwAppError(result.message!, result.type);
    return { status: AppStatus.SUCCESS, message: result.message!, data: result.data };
  }

  @Get(SimulationReportConstants.ROUTES.BY_CLASS)
  @ApiOperation({ summary: SimulationReportConstants.SWAGGER.GET_BY_CLASS })
  async findByClassId(@Param('classId') classId: string): Promise<ApiResponse> {
    const result = await this.service.findByClassId(classId);
    if (!result.success) throwAppError(result.message!, result.type);
    return { status: AppStatus.SUCCESS, message: result.message!, data: result.data };
  }

  @Get(SimulationReportConstants.ROUTES.BY_EDUCATOR)
  @ApiOperation({ summary: SimulationReportConstants.SWAGGER.GET_BY_EDUCATOR })
  async findByEducatorId(@Param('educatorId') educatorId: string): Promise<ApiResponse> {
    const result = await this.service.findByEducatorId(educatorId);
    if (!result.success) throwAppError(result.message!, result.type);
    return { status: AppStatus.SUCCESS, message: result.message!, data: result.data };
  }

  @Get(SimulationReportConstants.ROUTES.BY_ADMIN_QUERY)
  @ApiOperation({ summary: SimulationReportConstants.SWAGGER.GET_BY_ADMIN })
  async findByAdminIdQuery(@Query('adminId') adminId: string): Promise<ApiResponse> {
    if (!adminId) throwAppError('adminId query parameter is required');
    const result = await this.service.findByAdminId(adminId);
    if (!result.success) throwAppError(result.message!, result.type);
    return { status: AppStatus.SUCCESS, message: result.message!, data: result.data };
  }

  @Get(SimulationReportConstants.ROUTES.BY_ADMIN)
  @ApiOperation({ summary: SimulationReportConstants.SWAGGER.GET_BY_ADMIN })
  async findByAdminId(@Param('adminId') adminId: string): Promise<ApiResponse> {
    const result = await this.service.findByAdminId(adminId);
    if (!result.success) throwAppError(result.message!, result.type);
    return { status: AppStatus.SUCCESS, message: result.message!, data: result.data };
  }

  @Get(SimulationReportConstants.ROUTES.BY_STUDENT)
  @ApiOperation({ summary: SimulationReportConstants.SWAGGER.GET_BY_STUDENT })
  async findByStudentId(@Param('studentId') studentId: string): Promise<ApiResponse> {
    const result = await this.service.findByStudentId(studentId);
    if (!result.success) throwAppError(result.message!, result.type);
    return { status: AppStatus.SUCCESS, message: result.message!, data: result.data };
  }

  @Get(SimulationReportConstants.ROUTES.STATS_MONTHLY_3M)
  @ApiOperation({ summary: SimulationReportConstants.SWAGGER.STATS_MONTHLY_3M })
  async monthlyBreakdown3m(): Promise<ApiResponse> {
    const result = await this.service.monthlyBreakdown(3);
    if (!result.success) throwAppError(result.message!, result.type);
    return { status: AppStatus.SUCCESS, message: result.message!, data: result.data };
  }

  @Get(SimulationReportConstants.ROUTES.STATS_MONTHLY_6M)
  @ApiOperation({ summary: SimulationReportConstants.SWAGGER.STATS_MONTHLY_6M })
  async monthlyBreakdown6m(): Promise<ApiResponse> {
    const result = await this.service.monthlyBreakdown(6);
    if (!result.success) throwAppError(result.message!, result.type);
    return { status: AppStatus.SUCCESS, message: result.message!, data: result.data };
  }

  @Get(SimulationReportConstants.ROUTES.STATS_COMPLETED_3M)
  @ApiOperation({ summary: SimulationReportConstants.SWAGGER.STATS_COMPLETED_3M })
  async completedCount3m(): Promise<ApiResponse> {
    const result = await this.service.completedCount(3);
    if (!result.success) throwAppError(result.message!, result.type);
    return { status: AppStatus.SUCCESS, message: result.message!, data: result.data };
  }

  @Get(SimulationReportConstants.ROUTES.STATS_COMPLETED_6M)
  @ApiOperation({ summary: SimulationReportConstants.SWAGGER.STATS_COMPLETED_6M })
  async completedCount6m(): Promise<ApiResponse> {
    const result = await this.service.completedCount(6);
    if (!result.success) throwAppError(result.message!, result.type);
    return { status: AppStatus.SUCCESS, message: result.message!, data: result.data };
  }

  @Get(SimulationReportConstants.ROUTES.STATS_COMPLETED_BY_ADMIN)
  @ApiOperation({ summary: SimulationReportConstants.SWAGGER.STATS_COMPLETED_BY_ADMIN })
  async completedCountByAdmin(
    @Param('adminId') adminId: string,
    @Param('months') months: string,
  ): Promise<ApiResponse> {
    const result = await this.service.completedCountByAdmin(adminId, parseInt(months, 10) || 6);
    if (!result.success) throwAppError(result.message!, result.type);
    return { status: AppStatus.SUCCESS, message: result.message!, data: result.data };
  }

  @Get(SimulationReportConstants.ROUTES.STATS_MONTHLY_BY_ADMIN)
  @ApiOperation({ summary: SimulationReportConstants.SWAGGER.STATS_MONTHLY_BY_ADMIN })
  async monthlyBreakdownByAdmin(
    @Param('adminId') adminId: string,
    @Param('months') months: string,
  ): Promise<ApiResponse> {
    const result = await this.service.monthlyBreakdownByAdmin(adminId, parseInt(months, 10) || 6);
    if (!result.success) throwAppError(result.message!, result.type);
    return { status: AppStatus.SUCCESS, message: result.message!, data: result.data };
  }

  @Get(SimulationReportConstants.ROUTES.ALL_STUDENTS_COMPLETED)
  @ApiOperation({ summary: 'TEMP — Get all students with their simulations completed stats' })
  async findAllStudentsCompleted(): Promise<ApiResponse> {
    const result = await this.service.findAllStudentsCompleted();
    if (!result.success) throwAppError(result.message!, result.type);
    return { status: AppStatus.SUCCESS, message: result.message!, data: result.data };
  }

  @Get(SimulationReportConstants.ROUTES.CLASSES_NEEDING_ATTENTION)
  @ApiOperation({ summary: SimulationReportConstants.SWAGGER.CLASSES_NEEDING_ATTENTION })
  async getClassesNeedingAttention(@Req() req: JwtRequest): Promise<ApiResponse> {
    const result = await this.service.getClassesNeedingAttention(req.user.userId);
    if (!result.success) throwAppError(result.message!, result.type);
    return { status: AppStatus.SUCCESS, message: result.message!, data: result.data };
  }

  @Get(SimulationReportConstants.ROUTES.CLASS_ATTENTION_METADATA)
  @ApiOperation({ summary: SimulationReportConstants.SWAGGER.CLASS_ATTENTION_METADATA })
  async getAttentionMetadataByClass(@Param('classId') classId: string): Promise<ApiResponse> {
    const result = await this.service.getAttentionMetadataByClass(classId);
    if (!result.success) throwAppError(result.message!, result.type);
    return { status: AppStatus.SUCCESS, message: result.message!, data: result.data };
  }

  @Patch(SimulationReportConstants.ROUTES.MARK_VIEWED)
  @ApiOperation({ summary: SimulationReportConstants.SWAGGER.MARK_VIEWED })
  async markAsViewed(@Param('id') id: string, @Req() req: JwtRequest): Promise<ApiResponse> {
    const result = await this.service.markAsViewed(id, req.user.userId);
    if (!result.success) throwAppError(result.message!, result.type);
    return { status: AppStatus.SUCCESS, message: result.message!, data: result.data };
  }

  @Get(SimulationReportConstants.ROUTES.ID)
  @ApiOperation({ summary: SimulationReportConstants.SWAGGER.GET_BY_ID })
  async findById(@Param('id') id: string): Promise<ApiResponse> {
    const result = await this.service.findById(id);
    if (!result.success) throwAppError(result.message!, result.type);
    return { status: AppStatus.SUCCESS, message: result.message!, data: result.data };
  }

  @Get(SimulationReportConstants.ROUTES.PDF_BY_STUDENT)
  @ApiOperation({ summary: 'Download simulation report PDF for a student' })
  async downloadReportPdf(
    @Param('studentId') studentId: string,
    @Res() res: Response,
  ): Promise<void> {
    const result = await this.service.getReportPdfByStudentId(studentId);
    if (!result.success) {
      throwAppError(result.message!, result.type);
    }
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="simulation-report-${studentId}.pdf"`,
      'Content-Length': result.data!.length,
    });
    res.send(result.data);
  }

  @Post(SimulationReportConstants.ROUTES.EMAIL_PDF_BY_STUDENT)
  @ApiOperation({ summary: 'Email simulation report PDF to student (or provided email)' })
  async emailReportPdf(
    @Param('studentId') studentId: string,
    @Query('email') email: string,
  ): Promise<ApiResponse> {
    const result = await this.service.emailReportPdfByStudentId(studentId, email);
    if (!result.success) throwAppError(result.message!, result.type);
    return { status: AppStatus.SUCCESS, message: result.message!, data: null };
  }

  @Get(SimulationReportConstants.ROUTES.USER_TRANSCRIPT)
  @ApiOperation({ summary: SimulationReportConstants.SWAGGER.USER_TRANSCRIPT })
  async getUserTranscript(@Param('attemptId') attemptId: string): Promise<ApiResponse> {
    const result = await this.service.getUserTranscript(attemptId);
    if (!result.success) throwAppError(result.message!, result.type);
    return { status: AppStatus.SUCCESS, message: result.message!, data: result.data };
  }

  @Get('debug-report-keys/:attemptId')
  @ApiOperation({ summary: 'DEBUG — Show top-level keys inside report_data for a given attemptId' })
  async debugReportKeys(@Param('attemptId') attemptId: string): Promise<ApiResponse> {
    const result = await this.service.debugReportDataKeys(attemptId);
    if (!result.success) throwAppError(result.message!, result.type);
    return { status: AppStatus.SUCCESS, message: result.message!, data: result.data };
  }

  @Public()
  @Post(SimulationReportConstants.ROUTES.STUDENT_UPDATE)
  @ApiOperation({ summary: 'Update simulation report status from student' })
  async updateReportStatus(@Param('studentId') studentId: string): Promise<ApiResponse> {
    if (!studentId) throwAppError('studentId parameter is required');
    const result = await this.service.updateReportStatusByStudentId(studentId);
    if (!result.success) throwAppError(result.message!, result.type);
    return { status: AppStatus.SUCCESS, message: result.message!, data: result.data };
  }

  @Public()
  @Post(SimulationReportConstants.ROUTES.SIM_UPDATE)
  @ApiOperation({ summary: 'Update simulation from blob' })
  async updateSimulationFromBlob(@Param('simId') simId: string): Promise<ApiResponse> {
    if (!simId) throwAppError('simId parameter is required');
    const result = await this.service.updateSimulationFromBlob();
    if (!result.success) throwAppError(result.message!, result.type);
    return { status: AppStatus.SUCCESS, message: result.message!, data: result.data };
  }
}
