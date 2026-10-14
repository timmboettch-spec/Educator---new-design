import {
  Controller,
  Post,
  Get,
  Patch,
  Param,
  Body,
  Res,
  Query,
  Req,
  ForbiddenException,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { RequiredRoles } from 'src/common/decorators/required-roles.decorator';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { ResponseResult } from 'src/common/class/response.class';
import { BulkReviewResult } from 'src/common/interfaces';
import { SimulationReportsService } from './simulation-reports.service';
import { throwAppError } from 'src/common/utils/app-error';
import { AppStatus } from 'src/common/utils/messages';
import { ApiResponse } from 'src/common/types';
import type { JwtRequest } from 'src/common/types';
import { SimulationReportConstants } from './simulation-reports.constant';
import { ResyncLmsGradeDto, StudentReportCompletionDto } from './dto/simulation-report.dto';
import {
  ListReportsReqDto,
  ListReportsResDto,
  ListReportsResponseDto,
} from './dto/list-reports.dto';
import type { ICurrentUser, IPaginationMeta } from 'src/common/interfaces';
import { RoleSlug, UserTokenType } from 'src/common/constants';
import { resolveActingEducatorId } from 'src/educators/utils/educator-school-access.util';
import {
  BulkReviewReportsReqDto,
  BulkReviewReportsResponseDto,
} from './dto/bulk-review-reports.dto';

@ApiTags(SimulationReportConstants.SWAGGER.TAG)
@Controller(SimulationReportConstants.ROUTES.BASE)
@ApiBearerAuth('JWT-auth')
export class SimulationReportsController {
  constructor(private readonly service: SimulationReportsService) {}

  @Get()
  @RequiredRoles(RoleSlug.DISTRICT_ADMIN)
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

  // RE-192: this route returns a `ResponseResult` shaped by the global response interceptor,
  // unlike the hand-built `{ status, message, data }` payloads of the legacy routes above.
  @Get(SimulationReportConstants.ROUTES.LIST)
  @RequiredRoles(RoleSlug.EDUCATOR)
  @ApiForbiddenResponse({ description: 'Insufficient role' })
  @ApiOkResponse({ type: ListReportsResponseDto })
  async findReports(
    @CurrentUser() currentUser: ICurrentUser,
    @Query() dto: ListReportsReqDto,
  ): Promise<ResponseResult<ListReportsResDto[], IPaginationMeta>> {
    return this.service.findReports(currentUser, dto);
  }

  @Get(SimulationReportConstants.ROUTES.BY_CLASS)
  @RequiredRoles(RoleSlug.EDUCATOR)
  @ApiOperation({ summary: SimulationReportConstants.SWAGGER.GET_BY_CLASS })
  async findByClassId(@Param('classId') classId: string): Promise<ApiResponse> {
    const result = await this.service.findByClassId(classId);
    if (!result.success) throwAppError(result.message!, result.type);
    return { status: AppStatus.SUCCESS, message: result.message!, data: result.data };
  }

  @Get(SimulationReportConstants.ROUTES.BY_EDUCATOR)
  @RequiredRoles(RoleSlug.EDUCATOR)
  @ApiOperation({ summary: SimulationReportConstants.SWAGGER.GET_BY_EDUCATOR })
  async findByEducatorId(
    @CurrentUser() currentUser: ICurrentUser,
    @Param('educatorId') educatorId: string,
  ): Promise<ApiResponse> {
    const result = await this.service.findByEducatorId(currentUser?.educatorId || educatorId);
    if (!result.success) throwAppError(result.message!, result.type);
    return { status: AppStatus.SUCCESS, message: result.message!, data: result.data };
  }

  @Get(SimulationReportConstants.ROUTES.BY_ADMIN_QUERY)
  @RequiredRoles(RoleSlug.DISTRICT_ADMIN)
  @ApiOperation({ summary: SimulationReportConstants.SWAGGER.GET_BY_ADMIN })
  async findByAdminIdQuery(@Query('adminId') adminId: string): Promise<ApiResponse> {
    if (!adminId) throwAppError('adminId query parameter is required');
    const result = await this.service.findByAdminId(adminId);
    if (!result.success) throwAppError(result.message!, result.type);
    return { status: AppStatus.SUCCESS, message: result.message!, data: result.data };
  }

  @Get(SimulationReportConstants.ROUTES.BY_ADMIN)
  @RequiredRoles(RoleSlug.DISTRICT_ADMIN)
  @ApiOperation({ summary: SimulationReportConstants.SWAGGER.GET_BY_ADMIN })
  async findByAdminId(@Param('adminId') adminId: string): Promise<ApiResponse> {
    const result = await this.service.findByAdminId(adminId);
    if (!result.success) throwAppError(result.message!, result.type);
    return { status: AppStatus.SUCCESS, message: result.message!, data: result.data };
  }

  @Get(SimulationReportConstants.ROUTES.BY_STUDENT)
  @RequiredRoles(RoleSlug.EDUCATOR, RoleSlug.STUDENT)
  @ApiOperation({ summary: SimulationReportConstants.SWAGGER.GET_BY_STUDENT })
  async findByStudentId(@Param('studentId') studentId: string): Promise<ApiResponse> {
    const result = await this.service.findByStudentId(studentId);
    if (!result.success) throwAppError(result.message!, result.type);
    return { status: AppStatus.SUCCESS, message: result.message!, data: result.data };
  }

  @Get(SimulationReportConstants.ROUTES.STATS_MONTHLY_3M)
  @RequiredRoles(RoleSlug.DISTRICT_ADMIN)
  @ApiOperation({ summary: SimulationReportConstants.SWAGGER.STATS_MONTHLY_3M })
  async monthlyBreakdown3m(): Promise<ApiResponse> {
    const result = await this.service.monthlyBreakdown(3);
    if (!result.success) throwAppError(result.message!, result.type);
    return { status: AppStatus.SUCCESS, message: result.message!, data: result.data };
  }

  @Get(SimulationReportConstants.ROUTES.STATS_MONTHLY_6M)
  @RequiredRoles(RoleSlug.DISTRICT_ADMIN)
  @ApiOperation({ summary: SimulationReportConstants.SWAGGER.STATS_MONTHLY_6M })
  async monthlyBreakdown6m(): Promise<ApiResponse> {
    const result = await this.service.monthlyBreakdown(6);
    if (!result.success) throwAppError(result.message!, result.type);
    return { status: AppStatus.SUCCESS, message: result.message!, data: result.data };
  }

  @Get(SimulationReportConstants.ROUTES.STATS_COMPLETED_3M)
  @RequiredRoles(RoleSlug.DISTRICT_ADMIN)
  @ApiOperation({ summary: SimulationReportConstants.SWAGGER.STATS_COMPLETED_3M })
  async completedCount3m(): Promise<ApiResponse> {
    const result = await this.service.completedCount(3);
    if (!result.success) throwAppError(result.message!, result.type);
    return { status: AppStatus.SUCCESS, message: result.message!, data: result.data };
  }

  @Get(SimulationReportConstants.ROUTES.STATS_COMPLETED_6M)
  @RequiredRoles(RoleSlug.DISTRICT_ADMIN)
  @ApiOperation({ summary: SimulationReportConstants.SWAGGER.STATS_COMPLETED_6M })
  async completedCount6m(): Promise<ApiResponse> {
    const result = await this.service.completedCount(6);
    if (!result.success) throwAppError(result.message!, result.type);
    return { status: AppStatus.SUCCESS, message: result.message!, data: result.data };
  }

  @Get(SimulationReportConstants.ROUTES.STATS_COMPLETED_BY_ADMIN)
  @RequiredRoles(RoleSlug.DISTRICT_ADMIN)
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
  @RequiredRoles(RoleSlug.DISTRICT_ADMIN)
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
  @RequiredRoles(RoleSlug.DISTRICT_ADMIN)
  @ApiOperation({ summary: 'TEMP — Get all students with their simulations completed stats' })
  async findAllStudentsCompleted(): Promise<ApiResponse> {
    const result = await this.service.findAllStudentsCompleted();
    if (!result.success) throwAppError(result.message!, result.type);
    return { status: AppStatus.SUCCESS, message: result.message!, data: result.data };
  }

  @Get(SimulationReportConstants.ROUTES.CLASSES_NEEDING_ATTENTION)
  @RequiredRoles(RoleSlug.EDUCATOR)
  @ApiOperation({ summary: SimulationReportConstants.SWAGGER.CLASSES_NEEDING_ATTENTION })
  async getClassesNeedingAttention(@Req() req: JwtRequest): Promise<ApiResponse> {
    const result = await this.service.getClassesNeedingAttention(resolveActingEducatorId(req));
    if (!result.success) throwAppError(result.message!, result.type);
    return { status: AppStatus.SUCCESS, message: result.message!, data: result.data };
  }

  @Get(SimulationReportConstants.ROUTES.CLASS_ATTENTION_METADATA)
  @RequiredRoles(RoleSlug.EDUCATOR)
  @ApiOperation({ summary: SimulationReportConstants.SWAGGER.CLASS_ATTENTION_METADATA })
  async getAttentionMetadataByClass(@Param('classId') classId: string): Promise<ApiResponse> {
    const result = await this.service.getAttentionMetadataByClass(classId);
    if (!result.success) throwAppError(result.message!, result.type);
    return { status: AppStatus.SUCCESS, message: result.message!, data: result.data };
  }

  @Patch(SimulationReportConstants.ROUTES.MARK_VIEWED)
  @RequiredRoles(RoleSlug.EDUCATOR)
  @ApiOperation({ summary: SimulationReportConstants.SWAGGER.MARK_VIEWED })
  async markAsViewed(@Param('id') id: string, @Req() req: JwtRequest): Promise<ApiResponse> {
    const result = await this.service.markAsViewed(id, resolveActingEducatorId(req));
    if (!result.success) throwAppError(result.message!, result.type);
    return { status: AppStatus.SUCCESS, message: result.message!, data: result.data };
  }

  @Patch(SimulationReportConstants.ROUTES.BULK_REVIEW)
  @RequiredRoles(RoleSlug.EDUCATOR)
  @ApiBody({ type: BulkReviewReportsReqDto })
  @ApiOkResponse({ type: BulkReviewReportsResponseDto })
  @ApiForbiddenResponse({ description: 'Insufficient role' })
  async bulkReview(
    @CurrentUser() currentUser: ICurrentUser,
    @Body() dto: BulkReviewReportsReqDto,
  ): Promise<ResponseResult<BulkReviewResult>> {
    return this.service.bulkReview(currentUser, dto);
  }

  @Get(SimulationReportConstants.ROUTES.ID)
  @RequiredRoles(RoleSlug.DISTRICT_ADMIN)
  @ApiOperation({ summary: SimulationReportConstants.SWAGGER.GET_BY_ID })
  async findById(@Param('id') id: string): Promise<ApiResponse> {
    const result = await this.service.findById(id);
    if (!result.success) throwAppError(result.message!, result.type);
    return { status: AppStatus.SUCCESS, message: result.message!, data: result.data };
  }

  @Get(SimulationReportConstants.ROUTES.PDF_BY_STUDENT)
  @RequiredRoles(RoleSlug.EDUCATOR, RoleSlug.STUDENT)
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
  @RequiredRoles(RoleSlug.EDUCATOR, RoleSlug.STUDENT)
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
  @RequiredRoles(RoleSlug.EDUCATOR, RoleSlug.STUDENT)
  @ApiOperation({ summary: SimulationReportConstants.SWAGGER.USER_TRANSCRIPT })
  async getUserTranscript(@Param('attemptId') attemptId: string): Promise<ApiResponse> {
    const result = await this.service.getUserTranscript(attemptId);
    if (!result.success) throwAppError(result.message!, result.type);
    return { status: AppStatus.SUCCESS, message: result.message!, data: result.data };
  }

  @Get(SimulationReportConstants.ROUTES.LMS_GRADE_SYNC)
  @RequiredRoles(RoleSlug.EDUCATOR, RoleSlug.STUDENT)
  @ApiOperation({ summary: SimulationReportConstants.SWAGGER.LMS_GRADE_SYNC_STATUS })
  async getLmsGradeSyncStatuses(
    @Param('classId') classId: string,
    @Req() req: JwtRequest,
  ): Promise<ApiResponse> {
    const result = await this.service.getLmsGradeSyncStatuses(req.user, classId);
    if (!result.success) throwAppError(result.message as unknown as string, result.type);
    return { status: AppStatus.SUCCESS, message: result.message!, data: result.data };
  }

  @Post(SimulationReportConstants.ROUTES.LMS_GRADE_SYNC)
  @RequiredRoles(RoleSlug.EDUCATOR)
  @ApiOperation({ summary: SimulationReportConstants.SWAGGER.LMS_GRADE_RESYNC })
  async resyncLmsGrade(
    @Param('classId') classId: string,
    @Body() dto: ResyncLmsGradeDto,
    @Req() req: JwtRequest,
  ): Promise<ApiResponse> {
    const result = await this.service.resyncLmsGrade(req.user, classId, dto);
    if (!result.success) throwAppError(result.message as unknown as string, result.type);
    return { status: AppStatus.SUCCESS, message: result.message!, data: result.data };
  }

  @Get('debug-report-keys/:attemptId')
  @RequiredRoles(RoleSlug.STUDENT)
  @ApiOperation({ summary: 'DEBUG — Show top-level keys inside report_data for a given attemptId' })
  async debugReportKeys(@Param('attemptId') attemptId: string): Promise<ApiResponse> {
    const result = await this.service.debugReportDataKeys(attemptId);
    if (!result.success) throwAppError(result.message!, result.type);
    return { status: AppStatus.SUCCESS, message: result.message!, data: result.data };
  }

  private assertStudentCallerMatches(pathStudentId: string, req: JwtRequest): void {
    if (req.user?.type !== UserTokenType.STUDENT) {
      throw new ForbiddenException('Student token required');
    }

    const normalise = (value: string): string => value.toUpperCase().replace(/[-_ ]/g, '');
    const pathKey = normalise(pathStudentId.trim());
    // Only the authoritative student identifiers — see the matching note in `StudentsController`.
    const callerKeys = [req.user.student_id, req.user.studentId]
      .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      .map(normalise);

    if (!callerKeys.includes(pathKey)) {
      throw new ForbiddenException('Student identity does not match the requested student');
    }
  }

  @Post(SimulationReportConstants.ROUTES.STUDENT_UPDATE)
  @RequiredRoles(RoleSlug.STUDENT)
  @ApiOperation({ summary: 'Notify educator backend of a completed simulation report' })
  async updateReportStatus(
    @Req() req: JwtRequest,
    @Param('studentId') studentId: string,
    @Body() dto: StudentReportCompletionDto,
  ): Promise<ApiResponse> {
    if (!studentId) throwAppError('studentId parameter is required');
    this.assertStudentCallerMatches(studentId, req);
    const result = await this.service.handleStudentReportCompletion(studentId, dto, req.user);
    if (!result.success) throwAppError(result.message!, result.type);
    return { status: AppStatus.SUCCESS, message: result.message!, data: result.data };
  }

  @Post(SimulationReportConstants.ROUTES.SIM_UPDATE)
  @RequiredRoles(RoleSlug.DISTRICT_ADMIN, RoleSlug.SCENARIO_ADMIN)
  @ApiOperation({ summary: 'Update simulation from blob' })
  async updateSimulationFromBlob(@Param('simId') simId: string): Promise<ApiResponse> {
    if (!simId) throwAppError('simId parameter is required');
    const result = await this.service.updateSimulationFromBlob();
    if (!result.success) throwAppError(result.message!, result.type);
    return { status: AppStatus.SUCCESS, message: result.message!, data: result.data };
  }
}
