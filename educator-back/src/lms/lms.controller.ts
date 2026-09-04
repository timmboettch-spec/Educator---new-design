import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { DataSource } from 'typeorm';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { ApiResponse } from 'src/common/types';
import { AppStatus } from 'src/common/utils/messages';
import * as types from 'src/common/types';
import { Educator } from 'src/educators/entity/educator.entity';
import { educatorBelongsToSchool } from 'src/educators/utils/educator-school.util';
import { LmsToolType, LmsType } from 'src/common/enums/lms.enum';
import {
  ConfigureLmsDto,
  ConnectClassDto,
  LmsRosterPreviewQueryDto,
  LmsStudentProfileQueryDto,
  ProvisionSyncDto,
} from './dto/lms.dto';
import { LmsConstants } from './lms.constants';
import { LmsConfigService } from './services/lms-config.service';
import { LmsConnectService } from './services/lms-connect.service';
import { LmsLookupService } from './services/lms-lookup.service';
import { LmsProvisionService } from './services/lms-provision.service';
import { LmsRosterService } from './services/lms-roster.service';
import { LmsAdapterFactory } from './factories/lms-adapter.factory';
import { MoodleAdapter } from './adapters/moodle.adapter';

@ApiTags(LmsConstants.SWAGGER.TAG)
@UseGuards(JwtAuthGuard)
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
  ) {}

  private getMoodleAdapter(): MoodleAdapter {
    return this.lmsAdapterFactory.getAdapter(LmsType.MOODLE) as MoodleAdapter;
  }

  private isDistrictAdminRequest(req: types.JwtRequest): boolean {
    return (req.user.roles ?? []).includes(LmsConstants.ROLES.DISTRICT_ADMIN);
  }

  private async loadEducatorForSchoolCheck(educatorId: string): Promise<Educator> {
    const educator = await this.dataSource.manager.findOne(Educator, {
      where: { id: educatorId },
      relations: ['school', 'schoolAssignments', 'schoolAssignments.school'],
    });
    if (!educator) {
      throw new BadRequestException('Educator account not found');
    }
    return educator;
  }

  private async resolveSchoolIdFromRequest(
    req: types.JwtRequest,
    requestedSchoolId?: string,
  ): Promise<string> {
    const trimmed = requestedSchoolId?.trim();

    if (this.isDistrictAdminRequest(req)) {
      if (trimmed) {
        return trimmed;
      }
      throw new BadRequestException('schoolId is required for district admin LMS access');
    }

    const educatorId = String(req.user?.userId ?? '');
    if (!educatorId) {
      throw new BadRequestException('Missing authenticated educator id');
    }

    const educator = await this.loadEducatorForSchoolCheck(educatorId);

    if (trimmed) {
      if (!educatorBelongsToSchool(educator, trimmed)) {
        throw new ForbiddenException('Educator is not assigned to the requested school');
      }
      return trimmed;
    }

    const schoolId = educator.school?.id ?? null;
    if (!schoolId) {
      throw new BadRequestException('No school linked to educator account');
    }

    return schoolId;
  }

  @Post(LmsConstants.ROUTES.CONFIGURE)
  @ApiOperation({ summary: 'One-time LMS configuration for a school (District Admin)' })
  async configureSchool(
    @Body() dto: ConfigureLmsDto,
    @Req() req: types.JwtRequest,
  ): Promise<ApiResponse> {
    this.assertEducatorOrAdmin(req);
    const schoolId = await this.resolveSchoolIdFromRequest(req, dto.schoolId);
    const config = await this.configService.upsertConfig({ ...dto, schoolId });
    return {
      status: AppStatus.SUCCESS,
      message: LmsConstants.MESSAGES.CONFIG_SAVED,
      data: this.configService.sanitize(config),
    };
  }

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
    this.assertEducatorOrAdmin(req);
    const schoolId = await this.resolveSchoolIdFromRequest(req);
    const parsedToolType = this.parseToolType(toolType);
    const config = await this.configService.getOptionalBySchoolId(schoolId, parsedToolType);
    return {
      status: AppStatus.SUCCESS,
      message: config ? LmsConstants.MESSAGES.CONFIG_SAVED : LmsConstants.MESSAGES.CONFIG_NOT_FOUND,
      data: config ? this.configService.sanitize(config) : null,
    };
  }

  @Post(LmsConstants.ROUTES.EDUCATOR_CONFIGURE)
  @ApiOperation({ summary: 'Save LMS configuration using logged-in educator school context' })
  async configureEducatorSchool(
    @Body() dto: ConfigureLmsDto,
    @Req() req: types.JwtRequest,
  ): Promise<ApiResponse> {
    this.assertEducatorOrAdmin(req);
    const schoolId = await this.resolveSchoolIdFromRequest(req);
    const config = await this.configService.upsertConfig({ ...dto, schoolId });
    return {
      status: AppStatus.SUCCESS,
      message: LmsConstants.MESSAGES.CONFIG_SAVED,
      data: this.configService.sanitize(config),
    };
  }

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
    this.assertEducatorOrAdmin(req);
    const validatedSchoolId = await this.resolveSchoolIdFromRequest(req, schoolId);
    const parsedToolType = this.parseToolType(toolType);
    const config = await this.configService.getBySchoolId(validatedSchoolId, parsedToolType);
    return {
      status: AppStatus.SUCCESS,
      message: LmsConstants.MESSAGES.CONFIG_SAVED,
      data: this.configService.sanitize(config),
    };
  }

  @Get(LmsConstants.ROUTES.ROSTER_PREVIEW)
  @ApiOperation({ summary: 'Preview LMS roster in memory (no PII stored)' })
  async previewRoster(
    @Query() query: LmsRosterPreviewQueryDto,
    @Req() req: types.JwtRequest,
  ): Promise<ApiResponse> {
    this.assertEducatorOrAdmin(req);
    const schoolId = await this.resolveSchoolIdFromRequest(req, query.schoolId);
    const data = await this.connectService.previewRoster(schoolId, query.nrpsUrl);
    return {
      status: AppStatus.SUCCESS,
      message: LmsConstants.MESSAGES.ROSTER_PREVIEW,
      data,
    };
  }

  @Post(LmsConstants.ROUTES.CONNECT_CLASS)
  @ApiOperation({ summary: 'Connect class to LMS course and create student code mappings' })
  async connectClass(
    @Body() dto: ConnectClassDto,
    @Req() req: types.JwtRequest,
  ): Promise<ApiResponse> {
    this.assertEducatorOrAdmin(req);
    const schoolId = await this.resolveSchoolIdFromRequest(req, dto.schoolId);
    const data = await this.connectService.connectClass({ ...dto, schoolId });
    return {
      status: AppStatus.SUCCESS,
      message: LmsConstants.MESSAGES.CLASS_CONNECTED,
      data,
    };
  }

  @Get(LmsConstants.ROUTES.STUDENT_PROFILE)
  @ApiOperation({ summary: 'On-demand student PII lookup from LMS (in memory only)' })
  async lookupStudent(
    @Param('studentCode') studentCode: string,
    @Query() query: LmsStudentProfileQueryDto,
    @Req() req: types.JwtRequest,
  ): Promise<ApiResponse> {
    this.assertEducatorOrAdmin(req);
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

  @Get(LmsConstants.ROUTES.MOODLE_STUDENTS)
  @ApiOperation({ summary: 'Get students enrolled in a Moodle course' })
  @ApiQuery({ name: 'courseId', required: true, description: 'Moodle course ID' })
  async getMoodleStudents(
    @Query('courseId') courseId: string,
    @Req() req: types.JwtRequest,
  ): Promise<ApiResponse> {
    this.assertEducatorOrAdmin(req);
    const schoolId = await this.resolveSchoolIdFromRequest(req);
    const config = await this.configService.getOptionalBySchoolId(schoolId);
    if (!config?.lmsBaseUrl || !config?.lmsApiToken) {
      throw new BadRequestException(
        'LMS API configuration not found (lmsBaseUrl and lmsApiToken required)',
      );
    }
    const data = await this.getMoodleAdapter().getEnrolledStudents(
      config.lmsBaseUrl,
      config.lmsApiToken,
      Number(courseId),
    );
    return {
      status: AppStatus.SUCCESS,
      message: `Fetched ${data.total} student(s) from Moodle`,
      data,
    };
  }

  @Get(LmsConstants.ROUTES.MOODLE_MAPPED_CLASSES)
  @ApiOperation({ summary: 'Get classes mapped to Moodle courses with their DB students' })
  async getMappedClasses(@Req() req: types.JwtRequest): Promise<ApiResponse> {
    this.assertEducatorOrAdmin(req);
    const educatorId = String(req.user?.userId ?? '');
    const data = await this.provisionService.getMappedClasses(educatorId);
    return {
      status: AppStatus.SUCCESS,
      message: `Fetched ${data.total} mapped class(es)`,
      data,
    };
  }

  @Post(LmsConstants.ROUTES.PROVISION_SYNC)
  @ApiOperation({
    summary: 'Sync roster for a mapped LMS course (deactivate, reactivate, add learners)',
  })
  async syncProvision(
    @Body() dto: ProvisionSyncDto,
    @Req() req: types.JwtRequest,
  ): Promise<ApiResponse> {
    this.assertEducatorOrAdmin(req);
    const educatorId = String(req.user?.userId ?? '').trim();
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

  @Get(LmsConstants.ROUTES.MOODLE_COURSES)
  @ApiOperation({ summary: 'Get all Moodle courses' })
  async getMoodleCourses(@Req() req: types.JwtRequest): Promise<ApiResponse> {
    this.assertEducatorOrAdmin(req);
    const schoolId = await this.resolveSchoolIdFromRequest(req);
    const config = await this.configService.getOptionalBySchoolId(schoolId);
    if (!config?.lmsBaseUrl || !config?.lmsApiToken) {
      throw new BadRequestException(
        'LMS API configuration not found (lmsBaseUrl and lmsApiToken required)',
      );
    }
    const data = await this.getMoodleAdapter().getMoodleCourses(
      config.lmsBaseUrl,
      config.lmsApiToken,
    );
    return {
      status: AppStatus.SUCCESS,
      message: `Fetched ${data.total} Moodle course(s)`,
      data,
    };
  }

  private assertDistrictAdmin(req: types.JwtRequest): void {
    const roles = req.user.roles ?? [];
    if (!roles.includes(LmsConstants.ROLES.DISTRICT_ADMIN)) {
      throw new ForbiddenException(LmsConstants.MESSAGES.FORBIDDEN);
    }
  }

  private parseToolType(value?: string): LmsToolType {
    const normalized = String(value ?? LmsToolType.EDUCATOR)
      .trim()
      .toLowerCase();
    return normalized === 'student' ? LmsToolType.STUDENT : LmsToolType.EDUCATOR;
  }

  private assertEducatorOrAdmin(req: types.JwtRequest): void {
    const roles = req.user.roles ?? [];
    if (
      !roles.includes(LmsConstants.ROLES.EDUCATOR) &&
      !roles.includes(LmsConstants.ROLES.DISTRICT_ADMIN)
    ) {
      throw new ForbiddenException(LmsConstants.MESSAGES.FORBIDDEN);
    }
  }

  private getNrpsAccessTokenFromRequest(req: types.JwtRequest): string | null {
    const explicit = String(req.headers['access-token'] ?? '').trim();
    if (explicit) {
      return explicit;
    }

    return null;
  }

  private async fetchRosterWithFallback(
    req: types.JwtRequest,
    nrpsUrl: string,
  ): Promise<{
    context: { id: string | null; label: string | null; title: string | null };
    members: Array<{ userId: string; name: string | null; email: string | null; roles: string[] }>;
  }> {
    try {
      const schoolId = await this.resolveSchoolIdFromRequest(req);
      const config = await this.configService.getOptionalBySchoolId(schoolId);
      if (config) {
        return this.rosterService.fetchRosterWithWsFallback(config, nrpsUrl);
      }
    } catch {
      // Fall through to launch access-token NRPS when school config is unavailable.
    }

    const accessToken = this.getNrpsAccessTokenFromRequest(req);
    let roster: Awaited<ReturnType<LmsRosterService['fetchRoster']>>;

    if (accessToken) {
      roster = await this.getMoodleAdapter().fetchRoster(nrpsUrl, accessToken);
    } else {
      let schoolId: string;
      try {
        schoolId = await this.resolveSchoolIdFromRequest(req);
      } catch {
        throw new BadRequestException(
          'Missing LMS access token and no school linked to educator for LMS config fallback.',
        );
      }

      const config = await this.configService.getOptionalBySchoolId(schoolId);
      if (!config) {
        throw new BadRequestException(
          'Missing LMS access token and no LMS configuration found for fallback token flow.',
        );
      }

      roster = await this.rosterService.fetchRoster(config, nrpsUrl);
    }

    try {
      const schoolId = await this.resolveSchoolIdFromRequest(req);
      const config = await this.configService.getOptionalBySchoolId(schoolId);
      if (config) {
        return this.rosterService.enrichRosterRolesFromWs(config, nrpsUrl, roster);
      }
    } catch {
      // Best-effort enrichment only.
    }

    return roster;
  }

  @Get('live-students')
  @ApiOperation({
    summary: 'Get live NRPS student roster (access-token header or LMS config fallback)',
  })
  async getLiveStudents(
    @Query('nrpsUrl') nrpsUrl: string,
    @Req() req: types.JwtRequest,
  ): Promise<ApiResponse> {
    this.assertEducatorOrAdmin(req);

    if (!nrpsUrl?.trim()) {
      throw new BadRequestException('nrpsUrl query parameter is required');
    }

    const roster = await this.fetchRosterWithFallback(req, nrpsUrl);

    return {
      status: AppStatus.SUCCESS,
      message: `Fetched ${roster.members.length} member(s) from NRPS`,
      data: {
        total: roster.members.length,
        students: roster.members.map((m) => ({ id: m.userId, ...m })),
      },
    };
  }

  @Get('live-classes')
  @ApiOperation({
    summary:
      'Get live NRPS student roster for multiple classes (access-token header or LMS config fallback)',
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
    this.assertEducatorOrAdmin(req);
    const requesterId = String(req.user?.userId ?? '').trim();

    let urls = (nrpsUrls || '')
      .split(',')
      .map((u) => u.trim())
      .filter(Boolean);

    if (!urls.length) {
      const mapped = await this.dataSource
        .createQueryBuilder()
        .select('m.nrps_url', 'nrpsUrl')
        .from('lms_class_mapping', 'm')
        .innerJoin('classes', 'c', 'c.id = m.class_id')
        .where('c.educator_id = :educatorId', { educatorId: requesterId })
        .andWhere("COALESCE(m.nrps_url, '') <> ''")
        .getRawMany<{ nrpsUrl: string }>();

      urls = Array.from(
        new Set(mapped.map((row) => String(row.nrpsUrl || '').trim()).filter(Boolean)),
      );
    }

    if (!urls.length) {
      throw new BadRequestException(
        'No NRPS URLs found. Pass nrpsUrls or launch mapped classes first.',
      );
    }

    const classes = await Promise.all(
      urls.map(async (url) => {
        try {
          const roster = await this.fetchRosterWithFallback(req, url);
          const contextId = roster.context.id ?? '';

          return {
            nrpsUrl: url,
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
}
