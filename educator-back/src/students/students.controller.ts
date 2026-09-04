import {
  Controller,
  Post,
  Get,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  BadRequestException,
  NotFoundException,
  Req,
  Headers,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Messages } from 'src/common/utils/messages';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { isUUID } from 'class-validator';
import { aesGcmDecrypt, deriveAesKey } from 'src/common/utils/aes-gcm.util';
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
} from './dto/students.dto';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { Public } from 'src/common/decorators/public.decorator';
import { throwAppError } from 'src/common/utils/app-error';
import { AppStatus } from 'src/common/utils/messages';
import { TokenBlacklistService } from 'src/common/strategy/jwt.blacklist.strategy';
import * as types from 'src/common/types';

@ApiTags(StudentConstants.SWAGGER.TAG)
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('jwt')
@Controller(StudentConstants.ROUTES.BASE)
export class StudentsController {
  constructor(
    private readonly service: StudentsService,
    private readonly blacklistService: TokenBlacklistService,
    private readonly configService: ConfigService,
  ) { }

  private decryptStudentCode(encryptedValue: string): string {
    const secret =
      this.configService.get<string>('LTI_STUDENT_CODE_SECRET') ||
      this.configService.get<string>('JWT_SECRET') ||
      'lti-student-code-default-secret';

    const [ivPart, cipherPart, tagPart] = encryptedValue.split('.');
    if (!ivPart || !cipherPart || !tagPart) {
      throw new BadRequestException('Invalid encrypted student_id');
    }

    return aesGcmDecrypt(deriveAesKey(secret), encryptedValue);
  }

  @Get(StudentConstants.ROUTES.LOOKUP_BY_CODE)
  @Public()
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
  async studentLogin(@Query() query: StudentLoginQueryDto): Promise<types.ApiResponse> {
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
    const result = await this.service.studentLogin(studentId);
    if (!result.success) throwAppError(result.message!, result.type);
    return { status: AppStatus.SUCCESS, message: result.message!, data: result.data };
  }

  @Post(StudentConstants.ROUTES.LOGOUT)
  @ApiOperation({ summary: 'Student app: logout and invalidate JWT token' })
  studentLogout(@Headers('authorization') authHeader?: string): types.ApiResponse {
    const token = authHeader?.startsWith('Bearer ') ? authHeader.split(' ')[1] : undefined;

    if (!token) {
      return {
        status: AppStatus.SUCCESS,
        message: StudentConstants.MESSAGES.NO_TOKEN_PROVIDED,
        data: null,
      };
    }
    this.blacklistService.add(token);
    return {
      status: AppStatus.SUCCESS,
      message: StudentConstants.MESSAGES.LOGOUT_SUCCESS,
      data: null,
    };
  }

  @Post(StudentConstants.ROUTES.START_ASSESSMENT)
  @Public()
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
  @Public() // LOCAL ADAPTATION: student app calls this unauthenticated
  @ApiOperation({ summary: 'Student app: get assigned simulations and reports by student code' })
  async getSimulationsByCode(
    @Param('studentCode') studentCode: string,
  ): Promise<types.ApiResponse> {
    const code = studentCode?.trim();
    if (!code) {
      throw new BadRequestException('Student code is required');
    }
    if (code.length > 50) {
      throw new BadRequestException('Invalid student code');
    }
    const result = await this.service.getSimulationsByCode(code);
    if (!result.success) throwAppError(result.message!, result.type);
    return { status: AppStatus.SUCCESS, message: result.message!, data: result.data };
  }

  @Post()
  async create(
    @Body() dto: CreateStudentDto,
    @Req() req: types.JwtRequest,
  ): Promise<types.ApiResponse> {
    if (!dto.class_id || !isUUID(dto.class_id)) {
      throw new BadRequestException(StudentConstants.VALIDATION.INVALID_CLASS);
    }
    const userRoles = req.user.roles || [];
    if (!userRoles.includes(StudentConstants.ROLES.EDUCATOR)) {
      throw new BadRequestException(StudentConstants.VALIDATION.USER_NOT_EDUCATOR);
    }

    const targetEducatorId = dto.educator_id || req.user.userId;
    if (!targetEducatorId || !isUUID(targetEducatorId)) {
      throw new BadRequestException(StudentConstants.VALIDATION.INVALID_USER_CONTEXT);
    }

    const classData = await this.service.findClassById(dto.class_id);
    if (!classData) throw new NotFoundException(Messages.CLASS_NOT_FOUND);

    const educator = await this.service.findEducatorById(targetEducatorId);
    if (!educator) throw new NotFoundException(Messages.USER_NOT_FOUND);

    const roleName = educator.role?.role_name;
    if (roleName !== StudentConstants.ROLES.EDUCATOR) {
      throw new BadRequestException(StudentConstants.VALIDATION.USER_NOT_EDUCATOR);
    }

    const result = await this.service.create(dto, classData, educator);
    if (!result.success) throwAppError(result.message!, result.type);
    return { status: AppStatus.SUCCESS, message: result.message!, data: result.data };
  }

  @Post(StudentConstants.ROUTES.BULK)
  @ApiOperation({ summary: 'Bulk create students with auto-generated codes' })
  async bulkCreate(
    @Body() dto: BulkCreateStudentDto,
    @Req() req: types.JwtRequest,
  ): Promise<types.ApiResponse> {
    const userRoles = req.user.roles || [];
    if (!userRoles.includes(StudentConstants.ROLES.EDUCATOR)) {
      throw new BadRequestException(StudentConstants.VALIDATION.USER_NOT_EDUCATOR);
    }

    const educatorId = req.user.userId;
    if (!educatorId || !isUUID(educatorId)) {
      throw new BadRequestException(StudentConstants.VALIDATION.INVALID_USER_CONTEXT);
    }

    const classData = await this.service.findClassById(dto.class_id);
    if (!classData) throw new NotFoundException(Messages.CLASS_NOT_FOUND);

    const educator = await this.service.findEducatorById(educatorId);
    if (!educator) throw new NotFoundException(Messages.USER_NOT_FOUND);

    const roleName = educator.role?.role_name;
    if (roleName !== StudentConstants.ROLES.EDUCATOR) {
      throw new BadRequestException(StudentConstants.VALIDATION.USER_NOT_EDUCATOR);
    }

    const result = await this.service.bulkCreate(dto, classData, educator);
    if (!result.success) throwAppError(result.message!, result.type);
    return { status: AppStatus.SUCCESS, message: result.message!, data: result.data };
  }

  @Post('batch-email')
  @ApiOperation({ summary: 'Send batch email with access code to student(s)' })
  async sendBatchEmail(@Body() dto: BatchEmailDto): Promise<types.ApiResponse> {
    const result = await this.service.sendBatchEmail(dto);
    if (!result.success) throwAppError(result.message!, result.type);
    return { status: AppStatus.SUCCESS, message: result.message!, data: result.data };
  }

  @Post('email-report')
  @ApiOperation({ summary: 'Send student report email (generated from DB data)' })
  async sendEmailReport(@Body() dto: EmailReportDto): Promise<types.ApiResponse> {
    const result = await this.service.sendEmailReport(dto);
    if (!result.success) throwAppError(result.message!, result.type);
    return { status: AppStatus.SUCCESS, message: result.message!, data: result.data };
  }

  @Put(StudentConstants.ROUTES.UPDATE_CODE)
  async updateStudentCode(@Body() dto: StudentIdDto): Promise<types.ApiResponse> {
    const student = await this.service.findById(dto.id);
    if (!student) throw new NotFoundException(Messages.STUDENT_NOT_FOUND);

    const result = await this.service.updateStudentCode(student);
    if (!result.success) throwAppError(result.message!, result.type);
    return { status: AppStatus.SUCCESS, message: result.message!, data: result.data };
  }

  @Get(StudentConstants.ROUTES.USER)
  async findAll(): Promise<types.ApiResponse> {
    const result = await this.service.findAll();
    if (!result.success) throwAppError(result.message!, result.type);
    return { status: AppStatus.SUCCESS, message: result.message!, data: result.data };
  }

  @Get(StudentConstants.ROUTES.CLASS_ID)
  async findByClass(@Param() params: ClassIdDto): Promise<types.ApiResponse> {
    const result = await this.service.findByClass(params.classId);
    if (!result.success) throwAppError(result.message!, result.type);
    return { status: AppStatus.SUCCESS, message: result.message!, data: result.data };
  }

  @Get(StudentConstants.ROUTES.ID)
  async findOne(@Param() params: StudentIdDto): Promise<types.ApiResponse> {
    const result = await this.service.findOne(params.id);
    if (!result.success) throwAppError(result.message!, result.type);
    return { status: AppStatus.SUCCESS, message: result.message!, data: result.data };
  }

  @Put(StudentConstants.ROUTES.ID)
  async update(
    @Param() params: StudentIdDto,
    @Body() dto: UpdateStudentDto,
    @Req() req: types.JwtRequest,
  ): Promise<types.ApiResponse> {
    const student = await this.service.findById(params.id);
    if (!student) throw new NotFoundException(Messages.STUDENT_NOT_FOUND);
    const userId = req.user.userId;
    const result = await this.service.update(student, dto, userId);
    if (!result.success) throwAppError(result.message!, result.type);
    return { status: AppStatus.SUCCESS, message: result.message!, data: result.data };
  }

  @Delete(StudentConstants.ROUTES.ID)
  async remove(@Param() params: StudentIdDto, @Req() req: types.JwtRequest): Promise<types.ApiResponse> {
    const student = await this.service.findById(params.id);
    if (!student) throw new NotFoundException(Messages.STUDENT_NOT_FOUND);
    const userId = req.user.userId;
    const result = await this.service.remove(student, userId);
    if (!result.success) throwAppError(result.message!, result.type);
    return { status: AppStatus.SUCCESS, message: result.message!, data: result.data };
  }

  @Put(StudentConstants.ROUTES.REVOKE_CODE)
  @ApiOperation({ summary: 'Revoke student access code (sets code to null)' })
  async revokeStudentCode(@Param() params: StudentIdDto): Promise<types.ApiResponse> {
    const student = await this.service.findById(params.id);
    if (!student) throw new NotFoundException(Messages.STUDENT_NOT_FOUND);

    const result = await this.service.revokeCode(student);
    if (!result.success) throwAppError(result.message!, result.type);
    return { status: AppStatus.SUCCESS, message: result.message!, data: result.data };
  }

  @Put(StudentConstants.ROUTES.REGENERATE_CODE)
  @ApiOperation({ summary: 'Regenerate student access code' })
  async regenerateStudentCode(@Param() params: StudentIdDto): Promise<types.ApiResponse> {
    const student = await this.service.findById(params.id);
    if (!student) throw new NotFoundException(Messages.STUDENT_NOT_FOUND);

    const result = await this.service.regenerateCode(student);
    if (!result.success) throwAppError(result.message!, result.type);
    return { status: AppStatus.SUCCESS, message: result.message!, data: result.data };
  }
}
