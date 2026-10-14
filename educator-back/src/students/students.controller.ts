import {
  Controller,
  Post,
  Get,
  Put,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  Req,
  Res,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Request, Response } from 'express';
import { extractAccessToken } from 'src/common/utils/token-extractor.util';
import { ConfigService } from '@nestjs/config';
import { TokenService } from 'src/common/services/token.service';
import { Messages } from 'src/common/utils/messages';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiForbiddenResponse,
  ApiOkResponse,
} from '@nestjs/swagger';
import { isUUID } from 'class-validator';
import { aesGcmDecrypt, deriveAesKey } from 'src/common/utils/aes-gcm.util';
import { redactCode } from 'src/common/utils/redact.util';
import { StudentConstants } from './students.constants';
import { StudentsService } from './students.service';
import {
  CreateStudentDto,
  UpdateStudentDto,
  StudentIdDto,
  ClassIdDto,
  EmailReportDto,
  BatchEmailDto,
  StudentLoginQueryDto,
  StartAssessmentDto,
  BulkCreateStudentDto,
  ListStudentsReqDto,
  StudentLiteResDto,
  StudentSummaryResDto,
  ListStudentsResponseDto,
} from './dto/students.dto';
import { RequiredRoles } from 'src/common/decorators/required-roles.decorator';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import type { ICurrentUser } from 'src/common/interfaces';
import { ResponseResult } from 'src/common/class/response.class';
import { IPaginationMeta } from 'src/common/interfaces/pagination.interface';
import { Public } from 'src/common/decorators/public.decorator';
import { throwAppError } from 'src/common/utils/app-error';
import { AppStatus } from 'src/common/utils/messages';
import { UserTokenType } from 'src/common/constants';
import { LoggerService } from 'src/common/services';
import * as types from 'src/common/types';
import { RoleSlug } from 'src/common/constants';
import { resolveActingEducatorId } from 'src/educators/utils/educator-school-access.util';

@ApiTags(StudentConstants.SWAGGER.TAG)
@ApiBearerAuth('jwt')
@Controller(StudentConstants.ROUTES.BASE)
export class StudentsController {
  constructor(
    private readonly service: StudentsService,
    private readonly configService: ConfigService,
    private readonly tokenService: TokenService,
    private readonly logger: LoggerService,
  ) { }

  private decryptStudentCode(encryptedValue: string): string {
    const secret =
      this.configService.get<string>('lti.studentCodeSecret') ||
      this.configService.get<string>('jwt.accessSecret') ||
      'lti-student-code-default-secret';

    const [ivPart, cipherPart, tagPart] = encryptedValue.split('.');
    if (!ivPart || !cipherPart || !tagPart) {
      throw new BadRequestException('Invalid encrypted student_id');
    }

    return aesGcmDecrypt(deriveAesKey(secret), encryptedValue);
  }

  @Get(StudentConstants.ROUTES.LOOKUP_BY_CODE)
  @RequiredRoles(RoleSlug.STUDENT)
  @ApiOperation({ summary: 'Student app: look up full student profile by access code' })
  async lookupByCode(@Param('studentCode') studentCode: string): Promise<types.ApiResponse> {
    const code = studentCode?.trim();
    if (!code) {
      throw new BadRequestException('Student code is required');
    }
    if (code.length > 50) {
      throw new BadRequestException('Invalid student code');
    }
    const result = await this.service.lookupByCode(code);
    if (!result.success) throwAppError(result.message!, result.type);
    return { status: AppStatus.SUCCESS, message: result.message!, data: result.data };
  }

  @Get(StudentConstants.ROUTES.LOGIN)
  @Public()
  @ApiOperation({ summary: 'Student app: verify student by student_id and return profile' })
  async studentLogin(
    @Query() query: StudentLoginQueryDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<types.ApiResponse> {
    const ltiEnabled = String(query.lti_enabled ?? '').toLowerCase() === 'true';
    let studentId = query.student_id?.trim();
    if (!studentId) {
      throw new BadRequestException(StudentConstants.VALIDATION.STUDENT_ID_REQUIRED);
    }

    if (ltiEnabled) {
      try {
        studentId = this.decryptStudentCode(studentId);
      } catch {
        throw new BadRequestException('Invalid encrypted student_id');
      }
    }

    if (studentId.length > 50) {
      throw new BadRequestException('Invalid student_id');
    }
    const result = await this.service.studentLogin(studentId, res);
    if (!result.success) throwAppError(result.message!, result.type);
    return { status: AppStatus.SUCCESS, message: result.message!, data: result.data };
  }

  @Post(StudentConstants.ROUTES.LOGOUT)
  @RequiredRoles(RoleSlug.STUDENT)
  @ApiOperation({ summary: 'Student app: logout and invalidate JWT token' })
  async studentLogout(
    @Req() req: Request,
    @Res({ passthrough: true }) res?: Response,
  ): Promise<types.ApiResponse> {
    if (res) {
      this.tokenService.clearAuthCookies(res);
    }

    const token = extractAccessToken(req) ?? undefined;

    if (!token) {
      return {
        status: AppStatus.SUCCESS,
        message: StudentConstants.MESSAGES.NO_TOKEN_PROVIDED,
        data: null,
      };
    }
    await this.tokenService.blackListToken(token);
    return {
      status: AppStatus.SUCCESS,
      message: StudentConstants.MESSAGES.LOGOUT_SUCCESS,
      data: null,
    };
  }

  @Post(StudentConstants.ROUTES.START_ASSESSMENT)
  @RequiredRoles(RoleSlug.STUDENT)
  @ApiOperation({
    summary:
      'Student app: validate whether a simulation launch (Assessment or Practice) is allowed',
  })
  async startAssessment(
    @Param('studentId') studentId: string,
    @Body() dto: StartAssessmentDto,
  ): Promise<types.ApiResponse> {
    if (!studentId || !isUUID(studentId)) {
      throw new BadRequestException('Invalid student ID');
    }
    const result = await this.service.startAssessment(
      studentId,
      dto.scenario_id,
      dto.mode ?? 'Assessment',
    );
    if (!result.success) throwAppError(result.message!, result.type);
    return { status: AppStatus.SUCCESS, message: result.message!, data: result.data };
  }

  @Get(StudentConstants.ROUTES.SIMULATIONS_BY_CODE)
  @RequiredRoles(RoleSlug.STUDENT)
  @ApiOperation({ summary: 'Student app: get assigned simulations and reports by student code' })
  async getSimulationsByCode(
    @Param('studentCode') studentCode: string,
    @Req() req: types.JwtRequest,
  ): Promise<types.ApiResponse> {
    const code = studentCode?.trim();
    if (!code) {
      throw new BadRequestException('Student code is required');
    }
    if (code.length > 50) {
      throw new BadRequestException('Invalid student code');
    }

    // Issue #9: Ownership check — ensure authenticated student can only look up their own code
    const user = req.user;
    if (user?.type === UserTokenType.STUDENT) {
      const normalise = (value: string): string => value.toUpperCase().replace(/[-_ ]/g, '');
      const requestedKey = normalise(code);
      // Match only the two authoritative student identifiers. `userId` was previously accepted
      // as an alias because a student token's `sub` carries the same login code, but matching on
      // it would start granting access on an unrelated id the moment student tokens move to
      // `users.id`. `studentId` preserves the UUID path for students with no login code.
      const callerKeys = [user.student_id, user.studentId]
        .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
        .map(normalise);

      if (callerKeys.length === 0 || !callerKeys.includes(requestedKey)) {
        this.logger.warn(
          `Student ${user.userId ?? user.student_id ?? 'unknown'} attempted to look up code ${redactCode(code)} that does not belong to them`,
        );
        throw new ForbiddenException('You can only access your own simulations');
      }
    }

    const result = await this.service.getSimulationsByCode(code);
    if (!result.success) throwAppError(result.message!, result.type);

    // Include LTI launch context from JWT if present (for simulation locking)
    const ltiLaunch = req.user?.ltiLaunch;
    const responseData = result.data ? { ...result.data, ltiLaunch } : result.data;

    return { status: AppStatus.SUCCESS, message: result.message!, data: responseData };
  }

  @Post()
  @RequiredRoles(RoleSlug.EDUCATOR)
  async create(
    @Body() dto: CreateStudentDto,
    @Req() req: types.JwtRequest,
  ): Promise<types.ApiResponse> {
    if (!dto.class_id || !isUUID(dto.class_id)) {
      throw new BadRequestException(StudentConstants.VALIDATION.INVALID_CLASS);
    }

    const targetEducatorId = dto.educator_id || req.user.educatorId;
    if (!targetEducatorId || !isUUID(targetEducatorId)) {
      throw new BadRequestException(StudentConstants.VALIDATION.INVALID_USER_CONTEXT);
    }

    const classData = await this.service.findClassById(dto.class_id);
    if (!classData) throw new NotFoundException(Messages.CLASS_NOT_FOUND);

    const educator = await this.service.findEducatorById(targetEducatorId);
    if (!educator) throw new NotFoundException(Messages.USER_NOT_FOUND);


    const result = await this.service.create(dto, classData, educator);
    if (!result.success) throwAppError(result.message!, result.type);
    return { status: AppStatus.SUCCESS, message: result.message!, data: result.data };
  }

  @Post(StudentConstants.ROUTES.BULK)
  @RequiredRoles(RoleSlug.EDUCATOR)
  @ApiOperation({ summary: 'Bulk create students with auto-generated codes' })
  async bulkCreate(
    @Body() dto: BulkCreateStudentDto,
    @Req() req: types.JwtRequest,
  ): Promise<types.ApiResponse> {
    const educatorId = req.user.educatorId;
    if (!educatorId || !isUUID(educatorId)) {
      throw new BadRequestException(StudentConstants.VALIDATION.INVALID_USER_CONTEXT);
    }

    const classData = await this.service.findClassById(dto.class_id);
    if (!classData) throw new NotFoundException(Messages.CLASS_NOT_FOUND);

    const educator = await this.service.findEducatorById(educatorId);
    if (!educator) throw new NotFoundException(Messages.USER_NOT_FOUND);


    const result = await this.service.bulkCreate(dto, classData, educator);
    if (!result.success) throwAppError(result.message!, result.type);
    return { status: AppStatus.SUCCESS, message: result.message!, data: result.data };
  }

  @Post(StudentConstants.ROUTES.BULK_UPLOAD)
  @RequiredRoles(RoleSlug.EDUCATOR)
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  @ApiOperation({ summary: 'Import students from a CSV file (roster upload)' })
  async bulkUpload(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Query('class_id') classId: string,
    @Req() req: types.JwtRequest,
  ): Promise<types.ApiResponse> {
    if (!file) throw new BadRequestException(StudentConstants.VALIDATION.FILE_NOT_PROVIDED);
    if (!classId || !isUUID(classId))
      throw new BadRequestException(StudentConstants.VALIDATION.INVALID_CLASS);

    const classData = await this.service.findClassById(classId);
    if (!classData) throw new NotFoundException(Messages.CLASS_NOT_FOUND);

    const educator = await this.service.findEducatorById(resolveActingEducatorId(req));
    if (!educator) throw new NotFoundException(Messages.USER_NOT_FOUND);

    const result = await this.service.importFromCsv(file.buffer, classData, educator);
    if (!result.success) throwAppError(result.message!, result.type);
    return { status: AppStatus.SUCCESS, message: result.message!, data: result.data };
  }

  @Post('batch-email')
  @RequiredRoles(RoleSlug.EDUCATOR)
  @HttpCode(200)
  @ApiOperation({ summary: 'Send batch email with access code to student(s)' })
  async sendBatchEmail(@Body() dto: BatchEmailDto): Promise<types.ApiResponse> {
    const result = await this.service.sendBatchEmail(dto);
    if (!result.success) throwAppError(result.message!, result.type);
    return { status: AppStatus.SUCCESS, message: result.message!, data: result.data };
  }

  @Post('email-report')
  @RequiredRoles(RoleSlug.EDUCATOR)
  @HttpCode(200)
  @ApiOperation({ summary: 'Send student report email (generated from DB data)' })
  async sendEmailReport(@Body() dto: EmailReportDto): Promise<types.ApiResponse> {
    const result = await this.service.sendEmailReport(dto);
    if (!result.success) throwAppError(result.message!, result.type);
    return { status: AppStatus.SUCCESS, message: result.message!, data: result.data };
  }

  @Put(StudentConstants.ROUTES.UPDATE_CODE)
  @RequiredRoles(RoleSlug.EDUCATOR)
  async updateStudentCode(@Body() dto: StudentIdDto): Promise<types.ApiResponse> {
    const student = await this.service.findById(dto.id);
    if (!student) throw new NotFoundException(Messages.STUDENT_NOT_FOUND);

    const result = await this.service.updateStudentCode(student);
    if (!result.success) throwAppError(result.message!, result.type);
    return { status: AppStatus.SUCCESS, message: result.message!, data: result.data };
  }

  @Get(StudentConstants.ROUTES.USER)
  @RequiredRoles(RoleSlug.EDUCATOR)
  async findAll(): Promise<types.ApiResponse> {
    const result = await this.service.findAll();
    if (!result.success) throwAppError(result.message!, result.type);
    return { status: AppStatus.SUCCESS, message: result.message!, data: result.data };
  }

  @Get(StudentConstants.ROUTES.CLASS_ID)
  @RequiredRoles(RoleSlug.EDUCATOR)
  async findByClass(@Param() params: ClassIdDto): Promise<types.ApiResponse> {
    const result = await this.service.findByClass(params.classId);
    if (!result.success) throwAppError(result.message!, result.type);
    return { status: AppStatus.SUCCESS, message: result.message!, data: result.data };
  }

  @Get()
  @RequiredRoles(RoleSlug.EDUCATOR)
  @ApiForbiddenResponse({ description: 'Insufficient role' })
  @ApiOkResponse({
    type: ListStudentsResponseDto,
    description:
      'With `?lite=true`, `data` items are the lite shape (`StudentLiteResDto`) instead.',
  })
  async findStudents(
    @CurrentUser() currentUser: ICurrentUser,
    @Query() dto: ListStudentsReqDto,
  ): Promise<ResponseResult<StudentSummaryResDto[] | StudentLiteResDto[], IPaginationMeta>> {
    return this.service.findStudents(currentUser, dto);
  }

  @Get(StudentConstants.ROUTES.ID)
  @RequiredRoles(RoleSlug.EDUCATOR)
  async findOne(@Param() params: StudentIdDto): Promise<types.ApiResponse> {
    const result = await this.service.findOne(params.id);
    if (!result.success) throwAppError(result.message!, result.type);
    return { status: AppStatus.SUCCESS, message: result.message!, data: result.data };
  }

  @Put(StudentConstants.ROUTES.ID)
  @RequiredRoles(RoleSlug.EDUCATOR, RoleSlug.STUDENT)
  async update(
    @Param() params: StudentIdDto,
    @Body() dto: UpdateStudentDto,
    @Req() req: types.JwtRequest,
  ): Promise<types.ApiResponse> {
    const student = await this.service.findById(params.id);
    if (!student) throw new NotFoundException(Messages.STUDENT_NOT_FOUND);
    const userId = resolveActingEducatorId(req);
    const result = await this.service.update(student, dto, userId);
    if (!result.success) throwAppError(result.message!, result.type);
    return { status: AppStatus.SUCCESS, message: result.message!, data: result.data };
  }

  @Delete(StudentConstants.ROUTES.ID)
  @RequiredRoles(RoleSlug.EDUCATOR, RoleSlug.STUDENT)
  async remove(
    @Param() params: StudentIdDto,
    @Req() req: types.JwtRequest,
  ): Promise<types.ApiResponse> {
    const student = await this.service.findById(params.id);
    if (!student) throw new NotFoundException(Messages.STUDENT_NOT_FOUND);
    const userId = resolveActingEducatorId(req);
    const result = await this.service.remove(student, userId);
    if (!result.success) throwAppError(result.message!, result.type);
    return { status: AppStatus.SUCCESS, message: result.message!, data: result.data };
  }

  @Put(StudentConstants.ROUTES.REVOKE_CODE)
  @RequiredRoles(RoleSlug.EDUCATOR)
  @ApiOperation({ summary: 'Revoke student access code (sets code to null)' })
  async revokeStudentCode(@Param() params: StudentIdDto): Promise<types.ApiResponse> {
    const student = await this.service.findById(params.id);
    if (!student) throw new NotFoundException(Messages.STUDENT_NOT_FOUND);

    const result = await this.service.revokeCode(student);
    if (!result.success) throwAppError(result.message!, result.type);
    return { status: AppStatus.SUCCESS, message: result.message!, data: result.data };
  }

  @Put(StudentConstants.ROUTES.REGENERATE_CODE)
  @RequiredRoles(RoleSlug.EDUCATOR)
  @ApiOperation({ summary: 'Regenerate student access code' })
  async regenerateStudentCode(@Param() params: StudentIdDto): Promise<types.ApiResponse> {
    const student = await this.service.findById(params.id);
    if (!student) throw new NotFoundException(Messages.STUDENT_NOT_FOUND);

    const result = await this.service.regenerateCode(student);
    if (!result.success) throwAppError(result.message!, result.type);
    return { status: AppStatus.SUCCESS, message: result.message!, data: result.data };
  }
}
