import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
  ParseUUIDPipe,
  Query,
  Req,
  Put,
  BadRequestException,
  NotFoundException,
  Header,
  StreamableFile,
} from '@nestjs/common';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import type { ICurrentUser } from 'src/common/interfaces';
import { ClassesService, isValidStudentCodeFormat } from './classes.service';
import {
  ClassDto,
  ClassIdDto,
  BulkCreateClassesDto,
  ValidateRosterDto,
  AttentionSummaryReqDto,
  AttentionSummaryResDto,
  AttentionSummaryResponseDto,
  ListSchoolGroupsReqDto,
  ListClassesReqDto,
  SchoolGroupResDto,
  ListSchoolGroupsResponseDto,
  ClassSummaryResDto,
  ClassLiteResDto,
  ListClassesResponseDto,
  SimulationsCompletedGraphReqDto,
  SimulationsCompletedGraphResDto,
  SimulationsCompletedGraphResponseDto,
  ClassStatusResDto,
  ClassStatusesResponseDto,
  CreateClassReqDto,
  CreateClassResDto,
  CreateClassResponseDto,
  UpdateClassReqDto,
  UpdateClassResDto,
  UpdateClassResponseDto,
  DeleteClassResponseDto,
  ActivityOverviewReqDto,
  ActivityOverviewResDto,
  ActivityOverviewResponseDto,
  ExportStudentCodesReqDto,
} from './dto';
import * as types from 'src/common/types';
import { throwAppError } from 'src/common/utils/app-error';
import { ClassConstants } from './constants';
import { Messages, AppStatus } from 'src/common/utils/messages';
import { ApiResponse } from 'src/common/types';
import { ResponseResult } from 'src/common/class/response.class';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiBadRequestResponse,
  ApiOperation,
  ApiProduces,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { CreateStudentDto } from 'src/students/dto/students.dto';
import { LmsLookupService } from 'src/lms/services/lms-lookup.service';
import { LmsConfigService } from 'src/lms/services/lms-config.service';
import { LmsRosterService } from 'src/lms/services/lms-roster.service';
import { RoleSlug } from 'src/common/constants';
import { resolveActingEducatorId } from 'src/educators/utils/educator-school-access.util';

// --- School-groups read model (GET /classes/schools, GET /classes) ---
// These routes return a `ResponseResult` shaped by the global response interceptor, unlike the
// hand-built `{ status, message, data }` payloads of the legacy routes above.
import { RequiredRoles } from 'src/common/decorators/required-roles.decorator';
import { IPaginationMeta } from 'src/common/interfaces/pagination.interface';

@ApiTags(ClassConstants.SWAGGER.TAG)
@ApiBearerAuth('jwt')
@Controller(ClassConstants.ROUTES.BASE)
export class ClassesController {
  constructor(
    private readonly classesService: ClassesService,
    private readonly lmsLookupService: LmsLookupService,
    private readonly lmsConfigService: LmsConfigService,
    private readonly lmsRosterService: LmsRosterService,
  ) { }

  private parseStudents(dto: ClassDto): CreateStudentDto[] {
    if (!dto.students) {
      return [];
    }

    try {
      const students =
        typeof dto.students === 'string'
          ? (JSON.parse(String(dto.students)) as CreateStudentDto[])
          : dto.students;

      if (!Array.isArray(students)) {
        throw new BadRequestException(ClassConstants.VALIDATION.STUDENTS_JSON_INVALID);
      }

      return students;
    } catch {
      throw new BadRequestException(ClassConstants.VALIDATION.STUDENTS_JSON_INVALID);
    }
  }

  private validateCreatePayload(dto: ClassDto, students: CreateStudentDto[]): void {
    if (students.length > 0 && dto.total_no_of_students) {
      throw new BadRequestException(ClassConstants.VALIDATION.STUDENTS_CONFLICT);
    }

    if (dto.start_date && dto.end_date && new Date(dto.start_date) > new Date(dto.end_date)) {
      throw new BadRequestException(ClassConstants.VALIDATION.DATE_ORDER);
    }

    if (students.length > 0 && !dto.lmsCourseId) {
      const providedIds = students
        .map((student) => String(student.student_id ?? '').trim())
        .filter((id) => id.length > 0);
      const invalidCodes = providedIds.filter((id) => !isValidStudentCodeFormat(id));
      if (invalidCodes.length > 0) {
        throw new BadRequestException(
          ClassConstants.VALIDATION.INVALID_STUDENT_CODE_FORMAT(invalidCodes),
        );
      }
      const seen = new Set<string>();
      const dupes = new Set<string>();
      for (const id of providedIds) {
        if (seen.has(id.toUpperCase())) {
          dupes.add(id);
        } else {
          seen.add(id.toUpperCase());
        }
      }
      if (dupes.size > 0) {
        throw new BadRequestException(
          ClassConstants.VALIDATION.USED_STUDENT_CODES(Array.from(dupes)),
        );
      }
    }
  }

  /**
   * Block duplicate manual classes by name/term/year. When both the request and an
   * existing class carry LMS course IDs, allow the same display name only if they
   * refer to different Moodle courses (multiclass). Service-level lmsCourseId+school
   * dedup still handles relaunch/reuse for the same course.
   */
  private async assertNoDuplicateClassByName(dto: ClassDto, educatorId: string): Promise<void> {
    const existingClass = await this.classesService.findByCriteria(
      dto.class_name!,
      dto.term,
      dto.year,
      educatorId,
      dto.school_id,
    );
    if (!existingClass) {
      return;
    }

    const incomingCourseId = dto.lmsCourseId?.trim();
    const existingCourseRef = existingClass.lms_class_reference?.trim();
    if (incomingCourseId && existingCourseRef && incomingCourseId !== existingCourseRef) {
      return;
    }

    throw new BadRequestException(Messages.CLASS_EXISTS);
  }

  @Post()
  @RequiredRoles(RoleSlug.EDUCATOR)
  @ApiForbiddenResponse({ description: 'Insufficient role' })
  @ApiOkResponse({ type: CreateClassResponseDto })
  async create(
    @CurrentUser() currentUser: ICurrentUser,
    @Body() dto: CreateClassReqDto,
  ): Promise<ResponseResult<CreateClassResDto>> {
    return this.classesService.createClass(currentUser, dto);
  }

  @Post(ClassConstants.ROUTES.VALIDATE_ROSTER)
  @RequiredRoles(RoleSlug.EDUCATOR)
  async validateRoster(
    @Body() dto: ValidateRosterDto,
    @Req() req: types.JwtRequest,
  ): Promise<ApiResponse> {
    const result = await this.classesService.validateRosterCodes(dto.studentCodes);
    if (!result.success) throwAppError(result.message!, result.type);

    return {
      status: AppStatus.SUCCESS,
      message: result.message || '',
      data: result.data,
    };
  }

  @Post(ClassConstants.ROUTES.BULK_CREATE)
  @RequiredRoles(RoleSlug.EDUCATOR)
  async createBulk(
    @Body() payload: BulkCreateClassesDto,
    @Req() req: types.JwtRequest,
  ): Promise<ApiResponse> {

    if (!Array.isArray(payload?.classes) || payload.classes.length === 0) {
      throw new BadRequestException('classes array is required');
    }

    const educator = await this.classesService.findEducatorById(resolveActingEducatorId(req));
    if (!educator) {
      throw new NotFoundException(Messages.EDUCATOR_NOT_FOUND);
    }
    const schoolId = educator.school?.id;

    const results: Array<{
      index: number;
      className?: string;
      success: boolean;
      message: string;
      data?: unknown;
    }> = [];

    for (let index = 0; index < payload.classes.length; index++) {
      const dto = payload.classes[index];
      try {
        let parsedStudents = this.parseStudents(dto);

        if (parsedStudents.length === 0 && dto.nrpsUrl?.trim() && schoolId) {
          try {
            const config = await this.lmsConfigService.getActiveOptionalBySchoolId(schoolId);
            if (config) {
              const roster = await this.lmsRosterService.fetchRosterWithWsFallback(
                config,
                dto.nrpsUrl.trim(),
              );
              const learners = roster.members.filter((m) => {
                const roles = (m.roles ?? []).map((r: string) => r.toLowerCase());
                return roles.some(
                  (r: string) =>
                    r.includes('learner') ||
                    r.includes('student') ||
                    r.endsWith('#learner') ||
                    r.endsWith('/learner'),
                );
              });
              parsedStudents = learners.map((m): CreateStudentDto => ({
                student_id: String(m.userId),
              }));
            }
          } catch {
            // roster fetch is best-effort; fall through with empty students
          }
        }

        const students = await Promise.all(
          parsedStudents.map(async (student) => {
            const raw = student as CreateStudentDto & Record<string, unknown>;
            const lmsUserCandidate =
              raw.student_id ?? raw['lmsUserId'] ?? raw['userId'] ?? raw['id'];

            if (lmsUserCandidate === undefined || lmsUserCandidate === null) {
              return student;
            }

            const lmsUserId =
              typeof lmsUserCandidate === 'string' || typeof lmsUserCandidate === 'number'
                ? String(lmsUserCandidate).trim()
                : '';
            if (!lmsUserId) {
              return student;
            }

            const isNumericUserId = /^\d+$/.test(lmsUserId);
            if (!isNumericUserId) {
              const resolvedStudentCode =
                await this.lmsLookupService.findStudentCodeByLmsUserIdGlobally(lmsUserId, schoolId);
              student.student_id = resolvedStudentCode ?? lmsUserId;
            } else {
              student.student_id = lmsUserId;
            }
            return student;
          }),
        );

        this.validateCreatePayload(dto, students);

        if (dto.school_id) {
          const hasSchool = await this.classesService.verifyEducatorHasSchool(
            resolveActingEducatorId(req),
            dto.school_id,
          );
          if (!hasSchool) {
            results.push({
              index,
              className: dto.class_name,
              success: false,
              message: 'Educator is not assigned to the specified school',
            });
            continue;
          }
        }

        await this.assertNoDuplicateClassByName(dto, resolveActingEducatorId(req));

        const result = await this.classesService.create(dto, educator, students);
        results.push({
          index,
          className: dto.class_name,
          success: !!result.success,
          message:
            result.message ?? (result.success ? Messages.CLASS_CREATED : 'Failed to create class'),
          data: result.data,
        });
      } catch (error) {
        results.push({
          index,
          className: dto.class_name,
          success: false,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const created = results.filter((r) => r.success).length;
    const failed = results.length - created;

    return {
      status: AppStatus.SUCCESS,
      message: `Bulk class create completed: ${created} created, ${failed} failed`,
      data: {
        total: results.length,
        created,
        failed,
        results,
      },
    };
  }

  @Get(ClassConstants.ROUTES.ATTENTION_SUMMARY)
  @RequiredRoles(RoleSlug.EDUCATOR)
  @ApiQuery({ name: 'school_id', type: String, required: false })
  @ApiOkResponse({ type: AttentionSummaryResponseDto })
  @ApiForbiddenResponse({ description: 'Insufficient role' })
  async getAttentionSummary(
    @CurrentUser() currentUser: ICurrentUser,
    @Query() query: AttentionSummaryReqDto,
  ): Promise<ResponseResult<AttentionSummaryResDto>> {
    return this.classesService.getAttentionSummary(currentUser, query.school_id);
  }

  @Get(ClassConstants.ROUTES.USERS)
  @RequiredRoles(RoleSlug.EDUCATOR)
  async findAll(
    @Req() req: types.JwtRequest,
    @Query('school_id') schoolId?: string,
  ): Promise<ApiResponse> {
    const result = await this.classesService.findAll(resolveActingEducatorId(req), schoolId);
    return {
      status: AppStatus.SUCCESS,
      message: result.message!,
      data: { classes: result.data },
    };
  }

  @Get(ClassConstants.ROUTES.ACTIVITY_OVERVIEW)
  @RequiredRoles(RoleSlug.EDUCATOR)
  @ApiQuery({ name: 'school_id', type: String, required: false })
  @ApiOkResponse({ type: ActivityOverviewResponseDto })
  @ApiForbiddenResponse({ description: 'Insufficient role' })
  async getActivityOverview(
    @CurrentUser() currentUser: ICurrentUser,
    @Query() query: ActivityOverviewReqDto,
  ): Promise<ResponseResult<ActivityOverviewResDto>> {
    return this.classesService.getActivityOverview(currentUser, query);
  }

  // --- School-groups read model: grouped-by-school listing and a filterable flat class list. ---

  @Get(ClassConstants.ROUTES.SCHOOLS)
  @RequiredRoles(RoleSlug.EDUCATOR)
  @ApiOperation({
    summary: 'List schools grouped with their class counts',
    description:
      'Returns the schools the signed-in educator has classes in, each with its class count, grouped for the Classes-by-school view. Supports search by school/class name, class id, class status and class start/end date filters, school scoping (including the "unassigned" bucket) and pagination.',
  })
  @ApiForbiddenResponse({ description: 'Insufficient role' })
  @ApiOkResponse({ type: ListSchoolGroupsResponseDto })
  async findSchoolGroups(
    @CurrentUser() currentUser: ICurrentUser,
    @Query() dto: ListSchoolGroupsReqDto,
  ): Promise<ResponseResult<SchoolGroupResDto[], IPaginationMeta>> {
    return this.classesService.findSchoolGroups(currentUser, dto);
  }

  @Get()
  @RequiredRoles(RoleSlug.EDUCATOR)
  @ApiOperation({
    summary: 'List classes for the Filter Classes panel',
    description:
      "Returns a flat, filterable list of the signed-in educator's classes with per-class counts and status, evaluated server-side against school, class name/id, status and start/end date filters (including `endDateFrom`, classes ending on or after a date), with sorting and pagination.",
  })
  @ApiForbiddenResponse({ description: 'Insufficient role' })
  @ApiOkResponse({
    type: ListClassesResponseDto,
    description:
      'With `?lite=true`, `data` items are the lite shape (`ClassLiteResDto`: classId, className, startDate, endDate, status) instead.',
  })
  async findClasses(
    @CurrentUser() currentUser: ICurrentUser,
    @Query() dto: ListClassesReqDto,
  ): Promise<ResponseResult<ClassSummaryResDto[] | ClassLiteResDto[], IPaginationMeta>> {
    return this.classesService.findClasses(currentUser, dto);
  }

  @Get(ClassConstants.ROUTES.SIMULATIONS_COMPLETED_GRAPH)
  @RequiredRoles(RoleSlug.EDUCATOR)
  @ApiOperation({
    summary: 'Simulation completion trend',
    description:
      'Returns completions by month plus one breakdown: bySchool by default, byClass when forSchool is set, byStudent when forClass is set. With compareBy it also returns byMonthSeries, the per-month counts of each selected school, class or student.',
  })
  @ApiBadRequestResponse({
    description:
      'Invalid ids or compareBy, forSchool/forClass combined with other filters or with compareBy, or more than 15 ids in the list matching compareBy',
  })
  @ApiForbiddenResponse({ description: 'Insufficient role' })
  @ApiOkResponse({ type: SimulationsCompletedGraphResponseDto })
  async getSimulationsCompletedGraph(
    @CurrentUser() currentUser: ICurrentUser,
    @Query() dto: SimulationsCompletedGraphReqDto,
  ): Promise<ResponseResult<SimulationsCompletedGraphResDto>> {
    return this.classesService.getSimulationsCompletedGraph(currentUser, dto);
  }

  @Get(ClassConstants.ROUTES.STATUSES)
  @RequiredRoles(RoleSlug.EDUCATOR)
  @ApiOperation({
    summary: 'List the class status values available for filtering',
    description:
      'Returns the fixed set of class status values (Active, Inactive, Archived) used to populate the Class Status filter on the Filter Classes panel.',
  })
  @ApiForbiddenResponse({ description: 'Insufficient role' })
  @ApiOkResponse({ type: ClassStatusesResponseDto })
  async getClassStatuses(): Promise<ResponseResult<ClassStatusResDto>> {
    return this.classesService.getClassStatuses();
  }

  /**
   * Streamed CSV/PDF download (`?format=csv|pdf`, default csv) — deliberately no
   * `ResponseInterceptor`, which would wrap the `StreamableFile` in the JSON envelope.
   */
  @Get(ClassConstants.ROUTES.EXPORT_STUDENT_CODES)
  @RequiredRoles(RoleSlug.EDUCATOR)
  @Header('Cache-Control', 'no-store')
  @ApiProduces('text/csv', 'application/pdf')
  @ApiForbiddenResponse({ description: 'Insufficient role' })
  @ApiOkResponse({ schema: { type: 'string', format: 'binary' } })
  async exportStudentCodes(
    @CurrentUser() currentUser: ICurrentUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() dto: ExportStudentCodesReqDto,
  ): Promise<StreamableFile> {
    return this.classesService.exportStudentCodes(currentUser, id, dto);
  }

  @Get(ClassConstants.ROUTES.LMS_LINKAGE)
  @RequiredRoles(RoleSlug.EDUCATOR)
  @ApiOperation({ summary: ClassConstants.SWAGGER.LMS_LINKAGE })
  @ApiForbiddenResponse({ description: 'Insufficient role' })
  async getLmsLinkage(
    @Param() params: ClassIdDto,
    @Req() req: types.JwtRequest,
  ): Promise<ApiResponse> {
    const result = await this.classesService.getClassLmsLinkage(
      params.id,
      resolveActingEducatorId(req),
    );
    return { status: AppStatus.SUCCESS, message: result.message!, data: result.data };
  }

  @Get(ClassConstants.ROUTES.ID)
  @RequiredRoles(RoleSlug.EDUCATOR)
  async findOne(@Param() params: ClassIdDto, @Req() req: types.JwtRequest): Promise<ApiResponse> {
    const result = await this.classesService.findOne(params.id, resolveActingEducatorId(req));
    if (!result.success) throwAppError(result.message!, result.type);
    return { status: AppStatus.SUCCESS, message: result.message!, data: result.data };
  }

  @Put(ClassConstants.ROUTES.ID)
  @RequiredRoles(RoleSlug.EDUCATOR)
  @ApiForbiddenResponse({ description: 'Insufficient role' })
  @ApiOkResponse({ type: UpdateClassResponseDto })
  async update(
    @CurrentUser() currentUser: ICurrentUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateClassReqDto,
  ): Promise<ResponseResult<UpdateClassResDto>> {
    return this.classesService.update(currentUser, id, dto);
  }

  @Delete(ClassConstants.ROUTES.ID)
  @RequiredRoles(RoleSlug.EDUCATOR)
  @ApiForbiddenResponse({ description: 'Insufficient role' })
  @ApiOkResponse({ type: DeleteClassResponseDto })
  async remove(
    @CurrentUser() currentUser: ICurrentUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ResponseResult<null>> {
    return this.classesService.remove(currentUser, id);
  }
}
