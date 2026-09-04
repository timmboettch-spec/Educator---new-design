import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
  ForbiddenException,
  Put,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ClassesService } from './classes.service';
import { ClassDto, UpdateClassDto, ClassIdDto, BulkCreateClassesDto } from './dto/classes.dto';
import * as types from 'src/common/types';
import { throwAppError } from 'src/common/utils/app-error';
import { ClassConstants } from './classes.constants';
import { Messages, AppStatus } from 'src/common/utils/messages';
import { ApiResponse } from 'src/common/types';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CreateStudentDto } from 'src/students/dto/students.dto';
import { LmsLookupService } from 'src/lms/services/lms-lookup.service';
import { LmsConfigService } from 'src/lms/services/lms-config.service';
import { LmsRosterService } from 'src/lms/services/lms-roster.service';

@ApiTags(ClassConstants.SWAGGER.TAG)
@UseGuards(AuthGuard('jwt'))
@ApiBearerAuth('jwt')
@Controller(ClassConstants.ROUTES.BASE)
export class ClassesController {
  constructor(
    private readonly classesService: ClassesService,
    private readonly lmsLookupService: LmsLookupService,
    private readonly lmsConfigService: LmsConfigService,
    private readonly lmsRosterService: LmsRosterService,
  ) {}

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

    if (students.length > 0) {
      const providedIds = students.map((student) => student.student_id).filter((id) => !!id);
      if (providedIds.length !== new Set(providedIds).size) {
        throw new BadRequestException(ClassConstants.VALIDATION.DUPLICATE_STUDENT_ID);
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
  async create(@Body() dto: ClassDto, @Req() req: types.JwtRequest): Promise<ApiResponse> {
    const roles = req.user.roles || [];
    const isEducator = roles.includes(ClassConstants.ROLE.EDUCATOR);

    if (!isEducator) {
      throw new ForbiddenException(Messages.ONLY_EDUCATOR_CREATE);
    }

    const students = this.parseStudents(dto);
    this.validateCreatePayload(dto, students);

    const educator = await this.classesService.findEducatorById(req.user.userId);
    if (!educator) {
      throw new NotFoundException(Messages.EDUCATOR_NOT_FOUND);
    }

    if (dto.school_id) {
      const hasSchool = await this.classesService.verifyEducatorHasSchool(
        req.user.userId,
        dto.school_id,
      );
      if (!hasSchool) {
        throw new ForbiddenException('Educator is not assigned to the specified school');
      }
    }

    await this.assertNoDuplicateClassByName(dto, req.user.userId);

    const result = await this.classesService.create(dto, educator, students);
    if (!result.success) throwAppError(result.message!, result.type);

    return {
      status: AppStatus.SUCCESS,
      message: result.message || '',
      data: result.data,
    };
  }

  @Post(ClassConstants.ROUTES.BULK_CREATE)
  async createBulk(
    @Body() payload: BulkCreateClassesDto,
    @Req() req: types.JwtRequest,
  ): Promise<ApiResponse> {
    const roles = req.user.roles || [];
    const isEducator = roles.includes(ClassConstants.ROLE.EDUCATOR);

    if (!isEducator) {
      throw new ForbiddenException(Messages.ONLY_EDUCATOR_CREATE);
    }

    if (!Array.isArray(payload?.classes) || payload.classes.length === 0) {
      throw new BadRequestException('classes array is required');
    }

    const educator = await this.classesService.findEducatorById(req.user.userId);
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
            const config = await this.lmsConfigService.getOptionalBySchoolId(schoolId);
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
            req.user.userId,
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

        await this.assertNoDuplicateClassByName(dto, req.user.userId);

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

  @Get(ClassConstants.ROUTES.USERS)
  async findAll(
    @Req() req: types.JwtRequest,
    @Query('school_id') schoolId?: string,
  ): Promise<ApiResponse> {
    const result = await this.classesService.findAll(req.user.userId, schoolId);
    return {
      status: AppStatus.SUCCESS,
      message: result.message!,
      data: { classes: result.data },
    };
  }

  @Get(ClassConstants.ROUTES.ID)
  async findOne(@Param() params: ClassIdDto, @Req() req: types.JwtRequest): Promise<ApiResponse> {
    const result = await this.classesService.findOne(params.id, req.user.userId);
    if (!result.success) throwAppError(result.message!, result.type);
    return { status: AppStatus.SUCCESS, message: result.message!, data: result.data };
  }

  @Put(ClassConstants.ROUTES.ID)
  async update(
    @Param() params: ClassIdDto,
    @Body() dto: UpdateClassDto,
    @Req() req: types.JwtRequest,
  ): Promise<ApiResponse> {
    const classEntity = await this.classesService.findClassByIdWithEducator(
      params.id,
      req.user.userId,
    );
    if (!classEntity) throw new NotFoundException(Messages.CLASS_NOT_FOUND);

    if (dto.school_id && dto.school_id !== classEntity.school_id) {
      const hasSchool = await this.classesService.verifyEducatorHasSchool(
        req.user.userId,
        dto.school_id,
      );
      if (!hasSchool) {
        throw new BadRequestException('Educator is not assigned to the specified school');
      }
    }

    if (dto.class_name && dto.class_name !== classEntity.class_name) {
      const existingClass = await this.classesService.findByCriteria(
        dto.class_name,
        classEntity.term,
        classEntity.year,
        req.user.userId,
      );
      if (existingClass && existingClass.id !== classEntity.id) {
        throw new BadRequestException(Messages.CLASS_EXISTS);
      }
    }

    const result = await this.classesService.update(classEntity, dto);
    if (!result.success) throwAppError(result.message!, result.type);
    return { status: AppStatus.SUCCESS, message: result.message!, data: result.data };
  }

  @Delete(ClassConstants.ROUTES.ID)
  async remove(@Param() params: ClassIdDto, @Req() req: types.JwtRequest): Promise<ApiResponse> {
    const classEntity = await this.classesService.findClassByIdWithEducator(
      params.id,
      req.user.userId,
    );
    if (!classEntity) throw new NotFoundException(Messages.CLASS_NOT_FOUND);

    const result = await this.classesService.remove(params.id);
    if (!result.success) throwAppError(result.message!, result.type);
    return { status: AppStatus.SUCCESS, message: result.message!, data: result.data };
  }
}
