import {
  BadGatewayException,
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { DataSource } from 'typeorm';
import { ApiResponse } from 'src/common/types';
import { AppStatus } from 'src/common/utils/messages';
import * as types from 'src/common/types';
import { LmsToolType } from 'src/common/enums/lms.enum';
import {
  ConfigureLmsDto,
  LmsRosterPreviewQueryDto,
  LmsStudentProfileQueryDto,
  ProvisionSyncDto,
  TestLmsConfigDto,
} from './dto/lms.dto';
import { LmsConstants } from './lms.constants';
import { LmsConfigService } from './services/lms-config.service';
import { LmsConnectService } from './services/lms-connect.service';
import { LmsLookupService } from './services/lms-lookup.service';
import { LmsProvisionService } from './services/lms-provision.service';
import { LmsRosterService } from './services/lms-roster.service';
import { LmsGradeService } from './services/lms-grade.service';
import { LmsAdapterFactory } from './factories/lms-adapter.factory';
import {
  Class,
  ClassEducator,
  Educator,
  LmsAssignmentMapping,
  LmsSchoolConfig,
  LmsStudentMapping,
  SimulationReport,
  Student,
} from 'src/database/entities';
import { educatorBelongsToSchool } from 'src/educators/utils/educator-school.util';
import {
  isDistrictAdminRequest as checkIsDistrictAdminRequest,
  loadEducatorForSchoolCheck as loadEducatorWithSchools,
  resolveSchoolIdFromRequest as resolveSchoolIdFromJwtRequest,
} from 'src/educators/utils/educator-school-access.util';
import { LmsAdapter } from './interfaces/lms.interfaces';
import { extractOverallScoreFromRow } from 'src/simulation-reports/utils/report-score.util';
import { RoleSlug } from 'src/common/constants';
import { RequiredRoles } from 'src/common/decorators/required-roles.decorator';

@ApiTags(LmsConstants.SWAGGER.TAG)
@ApiBearerAuth('jwt')
@Controller(LmsConstants.ROUTES.BASE)
export class LmsController {
  constructor(
    private readonly configService: LmsConfigService,
    private readonly connectService: LmsConnectService,
    private readonly lookupService: LmsLookupService,
    private readonly provisionService: LmsProvisionService,
    private readonly rosterService: LmsRosterService,
    private readonly lmsAdapterFactory: LmsAdapterFactory,
    private readonly dataSource: DataSource,
    private readonly lmsGradeService: LmsGradeService,
  ) {}

  private getAdapter(config: LmsSchoolConfig): LmsAdapter {
    return this.lmsAdapterFactory.getAdapter(config.lmsType);
  }

  private assertLmsPlatformApiConfigured(config: LmsSchoolConfig): void {
    const adapter = this.lmsAdapterFactory.tryGetAdapter(config.lmsType);
    if (!adapter || (!adapter.listCourses && !adapter.getEnrolledStudentsForCourse)) {
      throw new BadRequestException(`Platform course API not supported for ${config.lmsType}`);
    }
    if (!config.lmsBaseUrl || !config.lmsApiToken) {
      throw new BadRequestException(
        'LMS API configuration not found (lmsBaseUrl and lmsApiToken required)',
      );
    }
  }

  private isDistrictAdminRequest(req: types.JwtRequest): boolean {
    return checkIsDistrictAdminRequest(req);
  }

  private async loadEducatorForSchoolCheck(educatorId: string): Promise<Educator> {
    return loadEducatorWithSchools(this.dataSource.manager, educatorId);
  }

  private async resolveSchoolIdFromRequest(
    req: types.JwtRequest,
    requestedSchoolId?: string,
  ): Promise<string> {
    return resolveSchoolIdFromJwtRequest(this.dataSource.manager, req, requestedSchoolId, {
      districtAdminMissingSchoolMessage: 'schoolId is required for district admin LMS access',
    });
  }

  @RequiredRoles(RoleSlug.DISTRICT_ADMIN)
  @Post(LmsConstants.ROUTES.CONFIGURE)
  @ApiOperation({
    summary:
      'Save LMS configuration for a school (verifies connection first; does not save on failure)',
  })
  async configureSchool(
    @Body() dto: ConfigureLmsDto,
    @Req() req: types.JwtRequest,
  ): Promise<ApiResponse> {
    const schoolId = await this.resolveSchoolIdFromRequest(req, dto.schoolId);
    const config = await this.configService.upsertConfig({ ...dto, schoolId });
    return {
      status: AppStatus.SUCCESS,
      message: LmsConstants.MESSAGES.CONFIG_SAVED,
      data: this.configService.sanitize(config),
    };
  }

  @RequiredRoles(RoleSlug.EDUCATOR, RoleSlug.DISTRICT_ADMIN)
  @Get(LmsConstants.ROUTES.EDUCATOR_CONFIG)
  @ApiOperation({ summary: 'Get LMS configuration for logged-in educator school' })
  @ApiQuery({
    name: 'toolType',
    required: false,
    enum: LmsToolType,
    description: 'LTI tool type (educator or student). Defaults to educator.',
  })
  async getEducatorConfig(
    @Req() req: types.JwtRequest,
    @Query('toolType') toolType?: string,
  ): Promise<ApiResponse> {
    const schoolId = await this.resolveSchoolIdFromRequest(req);
    const parsedToolType = this.parseToolType(toolType);
    const config = await this.configService.getOptionalBySchoolId(schoolId, parsedToolType);
    return {
      status: AppStatus.SUCCESS,
      message: config ? LmsConstants.MESSAGES.CONFIG_SAVED : LmsConstants.MESSAGES.CONFIG_NOT_FOUND,
      data: config ? this.configService.sanitize(config) : null,
    };
  }

  @RequiredRoles(RoleSlug.DISTRICT_ADMIN)
  @Post(LmsConstants.ROUTES.EDUCATOR_CONFIGURE)
  @ApiOperation({
    summary:
      'Save LMS configuration for a school, district admin only (verifies connection first; does not save on failure)',
  })
  async configureEducatorSchool(
    @Body() dto: ConfigureLmsDto,
    @Req() req: types.JwtRequest,
  ): Promise<ApiResponse> {
    const schoolId = await this.resolveSchoolIdFromRequest(req, dto.schoolId);
    const config = await this.configService.upsertConfig({ ...dto, schoolId });
    return {
      status: AppStatus.SUCCESS,
      message: LmsConstants.MESSAGES.CONFIG_SAVED,
      data: this.configService.sanitize(config),
    };
  }

  @RequiredRoles(RoleSlug.DISTRICT_ADMIN)
  @Post(LmsConstants.ROUTES.TEST_CONFIG)
  @ApiOperation({
    summary:
      'Test LMS connection with form and/or saved credentials (does not save). Canvas and Moodle.',
  })
  async testConfig(
    @Body() dto: TestLmsConfigDto,
    @Req() req: types.JwtRequest,
  ): Promise<ApiResponse> {
    const schoolId = await this.resolveSchoolIdFromRequest(req, dto.schoolId);
    const data = await this.configService.testConfig(schoolId, dto);
    return {
      status: data.success ? AppStatus.SUCCESS : AppStatus.FAILED,
      message: data.message,
      data,
    };
  }

  @RequiredRoles(RoleSlug.EDUCATOR, RoleSlug.DISTRICT_ADMIN)
  @Get(LmsConstants.ROUTES.SCHOOL_CONFIG)
  @ApiOperation({ summary: 'Get LMS configuration for a school' })
  @ApiQuery({
    name: 'toolType',
    required: false,
    enum: LmsToolType,
    description: 'LTI tool type (educator or student). Defaults to educator.',
  })
  async getSchoolConfig(
    @Param('schoolId') schoolId: string,
    @Query('toolType') toolType: string | undefined,
    @Req() req: types.JwtRequest,
  ): Promise<ApiResponse> {
    const validatedSchoolId = await this.resolveSchoolIdFromRequest(req, schoolId);
    const parsedToolType = this.parseToolType(toolType);
    const config = await this.configService.getBySchoolId(validatedSchoolId, parsedToolType);
    return {
      status: AppStatus.SUCCESS,
      message: LmsConstants.MESSAGES.CONFIG_SAVED,
      data: this.configService.sanitize(config),
    };
  }

  @RequiredRoles(RoleSlug.EDUCATOR, RoleSlug.DISTRICT_ADMIN)
  @Get(LmsConstants.ROUTES.ROSTER_PREVIEW)
  @ApiOperation({ summary: 'Preview LMS roster in memory (no PII stored)' })
  async previewRoster(
    @Query() query: LmsRosterPreviewQueryDto,
    @Req() req: types.JwtRequest,
  ): Promise<ApiResponse> {
    const schoolId = await this.resolveSchoolIdFromRequest(req, query.schoolId);
    const data = await this.connectService.previewRoster(schoolId, query.nrpsUrl);
    return {
      status: AppStatus.SUCCESS,
      message: LmsConstants.MESSAGES.ROSTER_PREVIEW,
      data,
    };
  }

  @RequiredRoles(RoleSlug.EDUCATOR, RoleSlug.DISTRICT_ADMIN)
  @Get(LmsConstants.ROUTES.STUDENT_PROFILE)
  @ApiOperation({ summary: 'On-demand student PII lookup from LMS (in memory only)' })
  async lookupStudent(
    @Param('studentCode') studentCode: string,
    @Query() query: LmsStudentProfileQueryDto,
    @Req() req: types.JwtRequest,
  ): Promise<ApiResponse> {
    const schoolId = await this.resolveSchoolIdFromRequest(req, query.schoolId);
    const data = await this.lookupService.lookupStudentProfile(
      schoolId,
      query.classId,
      studentCode,
    );
    return {
      status: AppStatus.SUCCESS,
      message: LmsConstants.MESSAGES.PROFILE_LOOKUP,
      data,
    };
  }

  @RequiredRoles(RoleSlug.EDUCATOR, RoleSlug.DISTRICT_ADMIN)
  @Get(LmsConstants.ROUTES.MOODLE_STUDENTS)
  @ApiOperation({ summary: 'Get students enrolled in a Moodle course' })
  @ApiQuery({ name: 'courseId', required: true, description: 'Moodle course ID' })
  async getMoodleStudents(
    @Query('courseId') courseId: string,
    @Req() req: types.JwtRequest,
  ): Promise<ApiResponse> {
    const schoolId = await this.resolveSchoolIdFromRequest(req);
    const config = await this.configService.getActiveOptionalBySchoolId(schoolId);
    if (!config) {
      throw new BadRequestException('LMS configuration not found for school');
    }
    this.assertLmsPlatformApiConfigured(config);
    const adapter = this.getAdapter(config);
    if (!adapter.getEnrolledStudentsForCourse) {
      throw new BadRequestException(`Enrolled students API not supported for ${config.lmsType}`);
    }
    const data = await adapter.getEnrolledStudentsForCourse(config, Number(courseId));
    return {
      status: AppStatus.SUCCESS,
      message: `Fetched ${data.total} student(s) from Moodle`,
      data,
    };
  }

  @RequiredRoles(RoleSlug.EDUCATOR)
  @Get(LmsConstants.ROUTES.MOODLE_MAPPED_CLASSES)
  @ApiOperation({ summary: 'Get classes mapped to Moodle courses with their DB students' })
  async getMappedClasses(@Req() req: types.JwtRequest): Promise<ApiResponse> {
    const educatorId = String(req.user?.educatorId ?? '');
    const data = await this.provisionService.getMappedClasses(educatorId);
    return {
      status: AppStatus.SUCCESS,
      message: `Fetched ${data.total} mapped class(es)`,
      data,
    };
  }

  @RequiredRoles(RoleSlug.EDUCATOR, RoleSlug.DISTRICT_ADMIN)
  @Post(LmsConstants.ROUTES.PROVISION_SYNC)
  @ApiOperation({
    summary: 'Sync roster for a mapped LMS course (deactivate, reactivate, add learners)',
  })
  async syncProvision(
    @Body() dto: ProvisionSyncDto,
    @Req() req: types.JwtRequest,
  ): Promise<ApiResponse> {
    const educatorId = String(req.user?.educatorId ?? '').trim();
    const lmsCourseId = String(dto.lmsCourseId ?? dto.moodleCourseId ?? '').trim();
    if (!educatorId || !lmsCourseId) {
      throw new BadRequestException('lmsCourseId is required');
    }

    const schoolId = await this.resolveSchoolIdFromRequest(req, dto.schoolId);

    await this.provisionService.provisionFromLiveClasses(
      educatorId,
      lmsCourseId,
      schoolId,
      dto.nrpsUrl?.trim(),
    );

    return {
      status: AppStatus.SUCCESS,
      message: 'LMS roster sync completed',
      data: { lmsCourseId },
    };
  }

  @RequiredRoles(RoleSlug.EDUCATOR, RoleSlug.DISTRICT_ADMIN)
  @Get(LmsConstants.ROUTES.MOODLE_COURSES)
  @ApiOperation({ summary: 'Get all Moodle courses' })
  async getMoodleCourses(@Req() req: types.JwtRequest): Promise<ApiResponse> {
    const schoolId = await this.resolveSchoolIdFromRequest(req);
    const config = await this.configService.getActiveOptionalBySchoolId(schoolId);
    if (!config) {
      throw new BadRequestException('LMS configuration not found for school');
    }
    this.assertLmsPlatformApiConfigured(config);
    const adapter = this.getAdapter(config);
    if (!adapter.listCourses) {
      throw new BadRequestException(`Course list API not supported for ${config.lmsType}`);
    }
    const data = await adapter.listCourses(config);
    return {
      status: AppStatus.SUCCESS,
      message: `Fetched ${data.total} Moodle course(s)`,
      data,
    };
  }

  private parseToolType(value?: string): LmsToolType {
    const normalized = String(value ?? LmsToolType.EDUCATOR)
      .trim()
      .toLowerCase();
    return normalized === 'student' ? LmsToolType.STUDENT : LmsToolType.EDUCATOR;
  }

  private async loadSchoolIdsByNrpsUrl(
    educatorId: string,
    nrpsUrls: string[],
  ): Promise<Map<string, string>> {
    const query = this.dataSource
      .createQueryBuilder()
      .select('m.nrps_url', 'nrpsUrl')
      .addSelect('m.school_id', 'schoolId')
      .from('lms_class_mapping', 'm')
      .where("COALESCE(m.nrps_url, '') <> ''")
      .orderBy('m.school_id', 'ASC');

    if (nrpsUrls.length) {
      query.andWhere('m.nrps_url IN (:...nrpsUrls)', { nrpsUrls });
    } else {
      query
        .innerJoin('classes', 'c', 'c.id = m.class_id')
        .andWhere('c.educator_id = :educatorId', { educatorId });
    }

    const rows = await query.getRawMany<{ nrpsUrl: string; schoolId: string }>();
    const schoolIdByNrpsUrl = new Map<string, string>();

    for (const row of rows) {
      const url = String(row.nrpsUrl ?? '').trim();
      const schoolId = String(row.schoolId ?? '').trim();
      if (url && schoolId && !schoolIdByNrpsUrl.has(url)) {
        schoolIdByNrpsUrl.set(url, schoolId);
      }
    }

    return schoolIdByNrpsUrl;
  }

  private async loadConfigForSchool(
    req: types.JwtRequest,
    schoolId: string,
  ): Promise<LmsSchoolConfig | null> {
    const validatedSchoolId = await this.resolveSchoolIdFromRequest(req, schoolId);
    return (await this.configService.getActiveOptionalBySchoolId(validatedSchoolId)) ?? null;
  }

  @RequiredRoles(RoleSlug.EDUCATOR, RoleSlug.DISTRICT_ADMIN)
  @Get('live-students')
  @ApiOperation({
    summary: 'Get live NRPS student roster using the school LMS configuration',
  })
  async getLiveStudents(
    @Query('nrpsUrl') nrpsUrl: string,
    @Req() req: types.JwtRequest,
  ): Promise<ApiResponse> {
    const trimmedNrpsUrl = nrpsUrl?.trim() ?? '';
    if (!trimmedNrpsUrl) {
      throw new BadRequestException('nrpsUrl query parameter is required');
    }

    const educatorId = String(req.user?.educatorId ?? '').trim();
    let schoolId: string;
    if (educatorId) {
      const mapped = await this.loadSchoolIdsByNrpsUrl(educatorId, []);
      const mappedSchoolId = mapped.get(trimmedNrpsUrl);
      if (!mappedSchoolId) {
        throw new BadRequestException(
          'nrpsUrl is not linked to a mapped class for this educator',
        );
      }
      schoolId = mappedSchoolId;
    } else {
      schoolId = await this.resolveSchoolIdFromRequest(req);
    }

    const config = await this.loadConfigForSchool(req, schoolId);
    const roster = await this.rosterService.fetchRosterForLiveEndpoint(config, trimmedNrpsUrl);

    return {
      status: AppStatus.SUCCESS,
      message: `Fetched ${roster.members.length} member(s) from NRPS`,
      data: {
        total: roster.members.length,
        students: roster.members.map((m) => ({ id: m.userId, ...m })),
      },
    };
  }

  @RequiredRoles(RoleSlug.EDUCATOR, RoleSlug.DISTRICT_ADMIN)
  @Get('live-classes')
  @ApiOperation({
    summary:
      'Get live NRPS student roster for multiple classes using each school LMS configuration',
  })
  @ApiQuery({
    name: 'nrpsUrls',
    required: false,
    description:
      'Optional comma-separated NRPS URLs; if omitted, uses all mapped class NRPS URLs for this educator',
  })
  async getLiveClasses(
    @Query('nrpsUrls') nrpsUrls: string | undefined,
    @Req() req: types.JwtRequest,
  ): Promise<ApiResponse> {
    const requesterId = String(req.user?.educatorId ?? '').trim();

    const requestedUrls = Array.from(
      new Set(
        (nrpsUrls || '')
          .split(',')
          .map((u) => u.trim())
          .filter(Boolean),
      ),
    );

    // Scope to this educator's mapped NRPS URLs (reject unmapped attacker-supplied URLs).
    const schoolIdByNrpsUrl = await this.loadSchoolIdsByNrpsUrl(requesterId, []);
    if (requestedUrls.some((url) => !schoolIdByNrpsUrl.has(url))) {
      throw new BadRequestException(
        'nrpsUrls must match mapped class NRPS URLs for this educator',
      );
    }
    const urls = requestedUrls.length ? requestedUrls : Array.from(schoolIdByNrpsUrl.keys());

    if (!urls.length) {
      throw new BadRequestException(
        'No NRPS URLs found. Pass nrpsUrls or launch mapped classes first.',
      );
    }

    const configBySchoolId = new Map<string, Promise<LmsSchoolConfig | null>>();

    const classes = await Promise.all(
      urls.map(async (url) => {
        const schoolId = schoolIdByNrpsUrl.get(url) ?? null;

        try {
          if (!schoolId) {
            throw new BadRequestException(LmsConstants.MESSAGES.LIVE_CLASS_SCHOOL_MISSING);
          }

          let configPromise = configBySchoolId.get(schoolId);
          if (!configPromise) {
            configPromise = this.loadConfigForSchool(req, schoolId);
            configBySchoolId.set(schoolId, configPromise);
          }

          const roster = await this.rosterService.fetchRosterForLiveEndpoint(
            await configPromise,
            url,
          );
          const contextId = roster.context.id ?? '';

          return {
            nrpsUrl: url,
            schoolId,
            classDetails: {
              contextId,
              label: roster.context.label,
              title: roster.context.title,
            },
            total: roster.members.length,
            students: roster.members.map((m) => ({ id: m.userId, ...m })),
          };
        } catch (err) {
          return {
            nrpsUrl: url,
            schoolId,
            classDetails: null,
            total: 0,
            students: [],
            error: err instanceof Error ? err.message : String(err),
          };
        }
      }),
    );

    return {
      status: AppStatus.SUCCESS,
      message: `Fetched roster for ${classes.length} class(es)`,
      data: {
        totalClasses: classes.length,
        classes,
      },
    };
  }

  private async educatorCanAccessClass(classId: string, educatorId: string): Promise<boolean> {
    const classEntity = await this.dataSource.manager.findOne(Class, {
      where: { id: classId, is_active: true },
    });
    if (!classEntity) {
      return false;
    }
    if (classEntity.educator_id === educatorId) {
      return true;
    }
    const coTeacher = await this.dataSource.manager.findOne(ClassEducator, {
      where: { classId, educatorId },
    });
    return !!coTeacher;
  }

  /**
   * Submits a grade for one student/simulation pair to the LMS.
   */
  @RequiredRoles(RoleSlug.EDUCATOR, RoleSlug.DISTRICT_ADMIN)
  @Post(LmsConstants.ROUTES.GRADES_SYNC)
  @ApiOperation({ summary: 'Manual grade submission to LMS (testing)' })
  async syncGradeManual(
    @Req() req: types.JwtRequest,
    @Body()
    body: {
      schoolId: string;
      classId: string;
      scenarioId: string;
      studentId: string;
      score?: number;
    },
  ): Promise<ApiResponse<{ score: number; status: string; syncLogId: string }>> {
    const { schoolId, classId, scenarioId, studentId, score: scoreOverride } = body;

    const educatorId = String(req.user?.educatorId ?? '');
    const educator = await this.loadEducatorForSchoolCheck(educatorId);

    if (!educatorBelongsToSchool(educator, schoolId)) {
      throw new ForbiddenException('Educator is not assigned to the requested school');
    }

    if (!this.isDistrictAdminRequest(req)) {
      const hasAccess = await this.educatorCanAccessClass(classId, educatorId);
      if (!hasAccess) {
        throw new ForbiddenException('Educator does not have access to this class');
      }
    }

    const classEntity = await this.dataSource.manager.findOne(Class, {
      where: { id: classId },
    });
    if (!classEntity?.school_id || classEntity.school_id !== schoolId) {
      throw new BadRequestException('Class does not belong to the requested school');
    }

    const student = await this.dataSource.manager.findOne(Student, {
      where: { id: studentId },
      relations: ['class'],
    });
    if (!student) {
      throw new BadRequestException('Student not found');
    }
    if (!student.class?.id || student.class.id !== classId) {
      throw new BadRequestException('Student does not belong to the specified class');
    }

    const mapping = await this.dataSource.manager.findOne(LmsAssignmentMapping, {
      where: { classId, simulationId: scenarioId },
    });
    if (!mapping) {
      throw new BadRequestException('No LMS assignment mapping found for this class/simulation');
    }
    if (mapping.schoolId !== schoolId) {
      throw new BadRequestException('Assignment mapping does not belong to the requested school');
    }

    const lmsMapping = await this.dataSource.manager.findOne(LmsStudentMapping, {
      where: { classId, studentCode: student.student_id },
    });
    if (!lmsMapping?.lmsUserId) {
      throw new BadRequestException('No LMS user mapping found for this student');
    }

    const report = await this.dataSource.manager.findOne(SimulationReport, {
      where: { studentId, scenarioId },
    });

    const overallScore =
      typeof scoreOverride === 'number' && Number.isFinite(scoreOverride) && scoreOverride >= 0
        ? Math.min(100, Math.max(0, scoreOverride))
        : report
          ? extractOverallScoreFromRow(report)
          : null;

    if (overallScore === null) {
      throw new BadRequestException(
        'Invalid or missing score. Provide score in request body or ensure a simulation report exists.',
      );
    }

    const result = await this.lmsGradeService.submitScore({
      mappingId: mapping.id,
      schoolId: mapping.schoolId,
      lineItemUrl: mapping.lmsLineItemUrl,
      lmsUserId: lmsMapping.lmsUserId,
      scoreGiven: overallScore,
      scoreMaximum: 100,
      studentId,
      studentCode: student.student_id,
      lineItemLabel: mapping.lmsLineItemLabel,
      lmsResourceLinkId: mapping.lmsResourceLinkId,
      reportBlobId: report?.reportId ?? null,
    });

    if (!result.success) {
      throw new BadGatewayException({
        message: result.error ?? 'LMS rejected the grade submission',
        syncLogId: result.syncLogId,
      });
    }

    return {
      status: AppStatus.SUCCESS,
      message: 'Grade submitted successfully',
      data: {
        score: overallScore,
        status: 'sent',
        syncLogId: result.syncLogId,
      },
    };
  }
}
