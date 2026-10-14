import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { DataSource } from 'typeorm';
import { ApiResponse } from 'src/common/types';
import * as types from 'src/common/types';
import { AppStatus } from 'src/common/utils/messages';
import {
  assertGoogleClassroomEnabledForSchool,
  resolveActingEducatorId,
  resolveSchoolIdFromRequest,
} from 'src/educators/utils/educator-school-access.util';
import { GoogleConstants } from './google.constants';
import { GoogleConnectionService } from './google-connection.service';
import { GoogleCourseMappingService } from './google-course-mapping.service';
import { GoogleRosterSyncService, GoogleRosterSyncResult } from './google-roster-sync.service';
import { GoogleOAuthService } from './google-oauth.service';
import { GoogleOAuthStateService } from './google-oauth-state.service';
import { LinkGoogleCourseDto } from './dto/link-google-course.dto';
import { BulkLinkGoogleCoursesDto } from './dto/bulk-link-google-courses.dto';
import { RequiredRoles } from 'src/common/decorators/required-roles.decorator';
import { RoleSlug } from 'src/common/constants';

@ApiTags(GoogleConstants.SWAGGER.TAG)
@ApiBearerAuth('jwt')
@RequiredRoles(RoleSlug.EDUCATOR)
@Controller(GoogleConstants.ROUTES.BASE)
export class GoogleController {
  constructor(
    private readonly connectionService: GoogleConnectionService,
    private readonly courseMappingService: GoogleCourseMappingService,
    private readonly rosterSyncService: GoogleRosterSyncService,
    private readonly oauthService: GoogleOAuthService,
    private readonly oauthStateService: GoogleOAuthStateService,
    private readonly dataSource: DataSource,
  ) { }

  @Post(GoogleConstants.ROUTES.CONNECT)
  @ApiOperation({ summary: 'Start Google Classroom OAuth connect for the logged-in educator' })
  async initiateConnect(
    @Param('schoolId') schoolIdParam: string,
    @Req() req: types.JwtRequest,
  ): Promise<ApiResponse> {
    const schoolId = await this.assertGoogleClassroomAccess(req, schoolIdParam);
    const educatorId = resolveActingEducatorId(req);

    const state = await this.oauthStateService.create(schoolId, educatorId);
    const authorizationUrl = this.oauthService.buildAuthorizationUrl(state);

    return {
      status: AppStatus.SUCCESS,
      message: GoogleConstants.MESSAGES.CONNECT_INITIATED,
      data: { authorizationUrl, schoolId },
    };
  }

  @Get(GoogleConstants.ROUTES.CONNECTION)
  @ApiOperation({ summary: 'Get Google Classroom connection status for the logged-in educator' })
  async getConnectionStatus(
    @Param('schoolId') schoolIdParam: string,
    @Req() req: types.JwtRequest,
  ): Promise<ApiResponse> {
    const schoolId = await this.assertGoogleClassroomAccess(req, schoolIdParam);
    const educatorId = resolveActingEducatorId(req);
    const data = await this.connectionService.getStatus(schoolId, educatorId);

    return {
      status: AppStatus.SUCCESS,
      message: data.connected
        ? GoogleConstants.MESSAGES.CONNECTION_STATUS
        : GoogleConstants.MESSAGES.CONNECTION_NOT_FOUND,
      data,
    };
  }

  @Delete(GoogleConstants.ROUTES.CONNECTION)
  @ApiOperation({ summary: 'Disconnect Google Classroom for the logged-in educator' })
  async disconnect(
    @Param('schoolId') schoolIdParam: string,
    @Req() req: types.JwtRequest,
  ): Promise<ApiResponse> {
    const schoolId = await this.assertGoogleClassroomAccess(req, schoolIdParam);
    const educatorId = resolveActingEducatorId(req);

    // Unlink mappings + archive classes owned by this educator before revoking OAuth.
    await this.courseMappingService.archiveGoogleClassesForEducator(schoolId, educatorId);
    const data = await this.connectionService.disconnect(schoolId, educatorId);

    return {
      status: AppStatus.SUCCESS,
      message: GoogleConstants.MESSAGES.CONNECTION_DISCONNECTED,
      data,
    };
  }

  @Get(GoogleConstants.ROUTES.COURSES)
  @ApiOperation({ summary: 'List Google Classroom courses for the logged-in educator' })
  async listCourses(
    @Param('schoolId') schoolIdParam: string,
    @Req() req: types.JwtRequest,
  ): Promise<ApiResponse> {
    const schoolId = await this.assertGoogleClassroomAccess(req, schoolIdParam);
    const educatorId = resolveActingEducatorId(req);
    const courses = await this.courseMappingService.listCoursesForSchool(schoolId, educatorId);

    return {
      status: AppStatus.SUCCESS,
      message: GoogleConstants.MESSAGES.COURSES_LISTED,
      data: { schoolId, courses },
    };
  }

  @Post(GoogleConstants.ROUTES.PROVISION_COURSES)
  @ApiOperation({
    summary:
      'Fetch Google Classroom courses (read-only scan, no class creation)',
  })
  async provisionCourses(
    @Param('schoolId') schoolIdParam: string,
    @Req() req: types.JwtRequest,
  ): Promise<ApiResponse> {
    const schoolId = await this.assertGoogleClassroomAccess(req, schoolIdParam);
    const educatorId = resolveActingEducatorId(req);
    const data = await this.courseMappingService.provisionCoursesForSchool({
      schoolId,
      educatorId,
    });

    return {
      status: AppStatus.SUCCESS,
      message: GoogleConstants.MESSAGES.COURSES_PROVISIONED,
      data,
    };
  }

  @Get(GoogleConstants.ROUTES.ARCHIVED_CLASSES)
  @ApiOperation({ summary: 'List archived Google Classroom auto-created classes' })
  async listArchivedClasses(
    @Param('schoolId') schoolIdParam: string,
    @Req() req: types.JwtRequest,
  ): Promise<ApiResponse> {
    const schoolId = await this.assertGoogleClassroomAccess(req, schoolIdParam);
    const educatorId = resolveActingEducatorId(req);
    const classes = await this.courseMappingService.listArchivedGoogleClasses(
      schoolId,
      educatorId,
    );

    return {
      status: AppStatus.SUCCESS,
      message: GoogleConstants.MESSAGES.ARCHIVED_CLASSES_LISTED,
      data: { schoolId, classes },
    };
  }

  @Get(GoogleConstants.ROUTES.COURSE_MAPPINGS)
  @ApiOperation({ summary: 'List Google Classroom course ↔ app class mappings for a school' })
  async listCourseMappings(
    @Param('schoolId') schoolIdParam: string,
    @Req() req: types.JwtRequest,
  ): Promise<ApiResponse> {
    const schoolId = await this.assertGoogleClassroomAccess(req, schoolIdParam);
    const educatorId = resolveActingEducatorId(req);
    const mappings = await this.courseMappingService.listMappings(schoolId, educatorId);

    return {
      status: AppStatus.SUCCESS,
      message: GoogleConstants.MESSAGES.MAPPINGS_LISTED,
      data: { schoolId, mappings },
    };
  }

  @Post(GoogleConstants.ROUTES.COURSE_MAPPINGS_BULK_LINK)
  @ApiOperation({
    summary: 'Link multiple Google Classroom courses and sync rosters',
  })
  async bulkLinkCourses(
    @Param('schoolId') schoolIdParam: string,
    @Body() body: BulkLinkGoogleCoursesDto,
    @Req() req: types.JwtRequest,
  ): Promise<ApiResponse> {
    const schoolId = await this.assertGoogleClassroomAccess(req, schoolIdParam);
    const educatorId = resolveActingEducatorId(req);
    const data = await this.courseMappingService.bulkLinkCourses({
      schoolId,
      educatorId,
      courses: body.courses.map((c) => ({
        googleCourseId: c.googleCourseId,
        googleCourseName: c.googleCourseName,
        googleCourseSection: c.googleCourseSection,
        googleCourseOwnerId: c.googleCourseOwnerId,
      })),
    });

    return {
      status: AppStatus.SUCCESS,
      message: GoogleConstants.MESSAGES.COURSES_BULK_LINKED,
      data,
    };
  }

  @Post(GoogleConstants.ROUTES.COURSE_MAPPINGS)
  @ApiOperation({ summary: 'Link a Google Classroom course (creates app class if needed)' })
  async linkCourse(
    @Param('schoolId') schoolIdParam: string,
    @Body() body: LinkGoogleCourseDto,
    @Req() req: types.JwtRequest,
  ): Promise<ApiResponse> {
    const schoolId = await this.assertGoogleClassroomAccess(req, schoolIdParam);
    const educatorId = resolveActingEducatorId(req);
    const { mapping, roster } = await this.courseMappingService.linkCourse({
      schoolId,
      googleCourseId: body.googleCourseId,
      googleCourseName: body.googleCourseName,
      googleCourseSection: body.googleCourseSection,
      googleCourseOwnerId: body.googleCourseOwnerId,
      educatorId,
      syncRoster: true,
    });

    return {
      status: AppStatus.SUCCESS,
      message: GoogleConstants.MESSAGES.COURSE_LINKED,
      data: {
        ...mapping,
        roster: roster
          ? {
            mappingId: roster.mappingId,
            classId: roster.classId,
            googleCourseId: roster.googleCourseId,
            lastRosterSyncedAt: roster.lastRosterSyncedAt,
            added: roster.added,
            updated: roster.reactivated,
            deactivated: roster.deactivated,
            total: roster.total,
          }
          : null,
      },
    };
  }

  @Delete(GoogleConstants.ROUTES.COURSE_MAPPING_BY_ID)
  @ApiOperation({ summary: 'Unlink a Google Classroom course from an app class' })
  async unlinkCourse(
    @Param('schoolId') schoolIdParam: string,
    @Param('mappingId') mappingId: string,
    @Req() req: types.JwtRequest,
  ): Promise<ApiResponse> {
    const schoolId = await this.assertGoogleClassroomAccess(req, schoolIdParam);
    const educatorId = resolveActingEducatorId(req);
    const data = await this.courseMappingService.unlinkMapping(
      schoolId,
      mappingId,
      educatorId,
    );

    return {
      status: AppStatus.SUCCESS,
      message: GoogleConstants.MESSAGES.COURSE_UNLINKED,
      data,
    };
  }

  @Post(GoogleConstants.ROUTES.SYNC_ROSTER)
  @ApiOperation({ summary: 'Sync Google Classroom roster for one linked course' })
  async syncRoster(
    @Param('schoolId') schoolIdParam: string,
    @Param('mappingId') mappingId: string,
    @Req() req: types.JwtRequest,
  ): Promise<ApiResponse> {
    const schoolId = await this.assertGoogleClassroomAccess(req, schoolIdParam);
    const educatorId = resolveActingEducatorId(req);
    const result = await this.rosterSyncService.syncLinkedCourse({
      schoolId,
      mappingId,
      educatorId,
    });

    return {
      status: AppStatus.SUCCESS,
      message: GoogleConstants.MESSAGES.ROSTER_SYNCED,
      data: this.toRosterSyncDto(result),
    };
  }

  @Post(GoogleConstants.ROUTES.SYNC_ROSTERS)
  @ApiOperation({ summary: 'Sync Google Classroom rosters for all linked courses in a school' })
  async syncSchoolRosters(
    @Param('schoolId') schoolIdParam: string,
    @Req() req: types.JwtRequest,
  ): Promise<ApiResponse> {
    const schoolId = await this.assertGoogleClassroomAccess(req, schoolIdParam);
    const educatorId = resolveActingEducatorId(req);
    const results = await this.rosterSyncService.syncAllLinkedCoursesForSchool(
      schoolId,
      educatorId,
    );

    return {
      status: AppStatus.SUCCESS,
      message: GoogleConstants.MESSAGES.ROSTERS_SYNCED,
      data: {
        schoolId,
        results: results.map((result) => this.toRosterSyncDto(result)),
      },
    };
  }


  private async assertGoogleClassroomAccess(
    req: types.JwtRequest,
    schoolIdParam?: string,
  ): Promise<string> {
    const schoolId = await resolveSchoolIdFromRequest(
      this.dataSource.manager,
      req,
      schoolIdParam,
      {
        districtAdminMissingSchoolMessage:
          'schoolId is required for district admin Google Classroom access',
      },
    );
    await assertGoogleClassroomEnabledForSchool(
      this.dataSource.manager,
      req,
      schoolId,
      GoogleConstants.MESSAGES.FEATURE_DISABLED,
    );
    return schoolId;
  }

  private toRosterSyncDto(result: GoogleRosterSyncResult) {
    return {
      mappingId: result.mappingId,
      classId: result.classId,
      googleCourseId: result.googleCourseId,
      lastRosterSyncedAt: result.lastRosterSyncedAt,
      added: result.added,
      updated: result.reactivated,
      deactivated: result.deactivated,
      total: result.total,
    };
  }
}
