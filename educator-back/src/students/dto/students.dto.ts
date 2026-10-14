import {
  ArrayMaxSize,
  IsArray,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsUUID,
  IsNumber,
  IsString,
  IsBoolean,
  IsInt,
  IsIn,
  ValidateIf,
  Min,
  Max,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional, IntersectionType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { CommonStatus } from 'src/common/enums/status.enum';
import { PaginationDto } from 'src/common/dtos/pagination.dto';
import { LiteQueryDto } from 'src/common/dtos/lite-query.dto';
import { ApiPaginatedResponseDto } from 'src/common/dtos/api-response.dto';
import { VALIDATION_MSG } from 'src/common/messages/validation.message';
import { toStringArray, toOptionalBoolean } from 'src/common/utils/query-array.util';
import { StudentCodeStatus, StudentSortField } from '../students.constants';

export class CreateStudentDto {
  @ApiPropertyOptional({
    example: 'STU_1234',
    description: 'Student ID will be assigned by server',
  })
  @IsOptional()
  @IsString()
  student_id?: string;

  @ApiPropertyOptional({ description: 'Class ID will be assigned by server' })
  @IsOptional()
  class_id?: string;

  @ApiPropertyOptional({ description: 'Educator ID' })
  @IsOptional()
  @IsUUID('4')
  educator_id?: string;

  @ApiPropertyOptional({ description: 'School ID (inherited from class when creating via class)' })
  @IsOptional()
  @IsUUID('4')
  school_id?: string;

  @ApiPropertyOptional({ enum: CommonStatus, default: CommonStatus.ACTIVE })
  @IsOptional()
  @IsEnum(CommonStatus)
  status?: CommonStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  score?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  attempt?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  sims_completed?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  submission_date?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  time_spent?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  time_remaining?: string;

  @ApiPropertyOptional({ description: 'Student display name' })
  @IsOptional()
  @IsString()
  student_name?: string;

  @ApiPropertyOptional({ description: 'Student email address' })
  @IsOptional()
  @IsEmail()
  email?: string;
}

export class BulkCreateStudentDto {
  @ApiProperty({ example: 'uuid-class-id', description: 'Class ID' })
  @IsNotEmpty()
  @IsUUID('4')
  class_id: string = '';

  @ApiProperty({ example: 3, description: 'Number of students to create (1–50)' })
  @IsInt()
  @Min(1)
  @Max(50)
  count: number = 0;
}

export class UpdateStudentDto {
  @ApiPropertyOptional({ enum: CommonStatus })
  @IsOptional()
  @IsEnum(CommonStatus)
  status?: CommonStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  submission_date?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  sims_completed?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  time_spent?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  time_remaining?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  attempt?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  score?: number;
}

export class StudentIdDto {
  @ApiProperty({ example: '833caffa-b8ca-45da-a06c-edd023bc03b9' })
  @IsUUID('4', { message: 'Invalid Student ID format' })
  @IsNotEmpty()
  id!: string;
}

export class StudentLoginQueryDto {
  @ApiProperty({ example: 'STU_1234', description: 'Student ID to verify login' })
  @IsNotEmpty({ message: 'student_id is required' })
  @IsString()
  student_id!: string;

  @ApiPropertyOptional({
    example: 'true',
    description: 'Set to true when student_id is LTI encrypted',
  })
  @IsOptional()
  @IsString()
  lti_enabled?: string;
}

export class ClassIdDto {
  @IsUUID('4', { message: 'Invalid Class ID format' })
  @IsNotEmpty()
  classId!: string;
}

export class BatchEmailDto {
  @ApiProperty({ example: 'Your Access Code' })
  @IsNotEmpty({ message: 'Subject is required' })
  @IsString()
  subject!: string;

  @ApiProperty({ example: 'Here is your access code to login.' })
  @IsNotEmpty({ message: 'Message is required' })
  @IsString()
  message!: string;

  @ApiProperty({ example: true, description: 'Include access code in the email if true' })
  @IsNotEmpty()
  @IsBoolean()
  accessCode!: boolean;

  @ApiProperty({ description: 'Class UUID — always required' })
  @IsNotEmpty({ message: 'class_id is required' })
  @IsUUID('4', { message: 'Invalid class_id UUID' })
  class_id!: string;

  @ApiPropertyOptional({ description: 'Student UUID — if provided, sends to that student only' })
  @IsOptional()
  @IsUUID('4', { message: 'Invalid student_id UUID' })
  student_id?: string;

  @ApiPropertyOptional({
    description: 'Override email address (used when student email is stored in local DB)',
  })
  @IsOptional()
  @IsEmail({}, { message: 'Invalid email address' })
  email?: string;

  @ApiPropertyOptional({ description: 'student name' })
  @IsOptional()
  @IsString()
  student_name?: string;
}

export class EmailReportDto {
  @ApiProperty({ example: true, description: 'Attach PDF to the email if true' })
  @IsNotEmpty()
  @IsBoolean()
  sendPdf!: boolean;

  @ApiProperty({ example: 'Monthly Report' })
  @IsNotEmpty({ message: 'Subject is required' })
  @IsString()
  subject!: string;

  @ApiProperty({ example: 'Please find your report.' })
  @IsNotEmpty({ message: 'Message is required' })
  @IsString()
  message!: string;

  @ApiProperty({
    description: 'Class UUID — always required',
  })
  @IsNotEmpty({ message: 'class_id is required' })
  @IsUUID('4', { message: 'Invalid class_id UUID' })
  class_id!: string;

  @ApiPropertyOptional({
    description: 'Student UUID — used for single student targeting without class_id',
  })
  @IsOptional()
  @IsUUID('4', { message: 'Invalid student_id UUID' })
  student_id?: string;

  @ApiPropertyOptional({ description: 'User UUID' })
  @IsOptional()
  @IsUUID('4', { message: 'Invalid user_id UUID' })
  user_id?: string;

  @ApiPropertyOptional({
    description: 'Override email address (used when student email is stored in local DB)',
  })
  @IsOptional()
  @IsEmail({}, { message: 'Invalid email address' })
  email?: string;

  @ApiPropertyOptional({
    description: 'Override student name (used when real name is stored in local DB)',
  })
  @IsOptional()
  @IsString()
  student_name?: string;

  @ApiPropertyOptional({ description: 'Score override from current report' })
  @IsOptional()
  @IsNumber()
  score?: number;

  @ApiPropertyOptional({ description: 'Attempt count override from current report' })
  @IsOptional()
  @IsNumber()
  attempt?: number;

  @ApiPropertyOptional({ description: 'Time spent override from current report' })
  @IsOptional()
  @IsString()
  time_spent?: string;

  @ApiPropertyOptional({ description: 'Sims completed override from current report' })
  @IsOptional()
  @IsString()
  sims_completed?: string;

  @ApiPropertyOptional({ description: 'Scenario title from current report' })
  @IsOptional()
  @IsString()
  scenario_title?: string;

  @ApiPropertyOptional({
    description:
      'Blob storage key of the specific report (e.g. "report-1783774969498"). ' +
      'Highest priority — used before report_id.',
    example: 'report-1783774969498',
  })
  @IsOptional()
  @IsString()
  report_key?: string;

  @ApiPropertyOptional({
    description:
      'DB row ID of the specific report (UUID or numeric string). ' +
      'Used when report_key is absent.',
    example: '42',
  })
  @IsOptional()
  @IsString()
  report_id?: string;

  @ApiPropertyOptional({
    description:
      'Scenario / Simulation ID — last-resort lookup together with student_id ' +
      'when neither report_key nor report_id is available.',
  })
  @IsOptional()
  @IsString()
  simulation_id?: string;

  @ApiPropertyOptional({
    description:
      'Report type — "assessment" or "progress". ' +
      'When "assessment", email content is sourced exclusively from the fetched blob report. ' +
      'When absent or "progress", existing progress/summary behaviour is used.',
    enum: ['assessment', 'progress'],
  })
  @IsOptional()
  @IsString()
  report_type?: string;

  @ApiPropertyOptional({
    description:
      'Pre-rendered HTML body generated by the frontend. ' +
      'When present the backend sends this HTML directly and skips the server-side template.',
  })
  @IsOptional()
  @IsString()
  html?: string;

  @ApiPropertyOptional({
    description:
      'The full report data object already loaded in the frontend View Report screen. ' +
      'When present this is used as-is — the backend performs no additional DB or blob fetch.',
  })
  @IsOptional()
  report_data?: Record<string, unknown>;

  @ApiPropertyOptional({
    description:
      'Base64-encoded PDF pre-generated by the frontend (identical to the Download PDF button output). ' +
      'When present and sendPdf=true, used directly as the email attachment. ' +
      'Replaces the server-side minimal PDF generator.',
  })
  @IsOptional()
  @IsString()
  pdf_base64?: string;

  @ApiPropertyOptional({
    description:
      'Base64-encoded ZIP archive pre-generated by the frontend for bulk report emails. ' +
      'When present and sendPdf=true, the ZIP is attached instead of individual PDFs.',
  })
  @IsOptional()
  @IsString()
  zip_base64?: string;

  @ApiPropertyOptional({
    description: 'Filename to use for the ZIP attachment when zip_base64 is provided.',
  })
  @IsOptional()
  @IsString()
  zip_filename?: string;
}

export class StartAssessmentDto {
  @ApiProperty({
    example: 'scenario-abc-123',
    description: 'Scenario ID the student wants to attempt',
  })
  @IsNotEmpty({ message: 'scenario_id is required' })
  @IsString()
  scenario_id!: string;

  @ApiPropertyOptional({
    example: 'Assessment',
    description: 'Mode the student wants to launch: Assessment (default) or Practice',
    enum: ['Assessment', 'Practice'],
  })
  @IsOptional()
  @IsString()
  mode?: 'Assessment' | 'Practice';
}

export class ListStudentsReqDto extends IntersectionType(PaginationDto, LiteQueryDto) {
  @IsOptional()
  @IsString({ message: VALIDATION_MSG.IS_STRING('search') })
  @MaxLength(200, { message: VALIDATION_MSG.MAX_LENGTH('search', 200) })
  @ApiPropertyOptional({ example: 'BIO-4ZPT' })
  search?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => toStringArray(value))
  @IsArray({ message: VALIDATION_MSG.INVALID('classIds') })
  @ArrayMaxSize(100)
  @IsUUID('4', { each: true, message: VALIDATION_MSG.IS_UUID('classIds') })
  @ApiPropertyOptional({ type: [String], example: ['3fa85f64-5717-4562-b3fc-2c963f66afa6'] })
  classIds?: string[];

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => toStringArray(value))
  @IsArray({ message: VALIDATION_MSG.INVALID('schoolIds') })
  @ArrayMaxSize(100)
  @IsUUID('4', { each: true, message: VALIDATION_MSG.IS_UUID('schoolIds') })
  @ApiPropertyOptional({ type: [String], example: ['3fa85f64-5717-4562-b3fc-2c963f66afa6'] })
  schoolIds?: string[];

  /** Omitted means no filter (both active and inactive students are returned). */
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => toOptionalBoolean(value))
  @IsBoolean({ message: VALIDATION_MSG.IS_BOOLEAN('isActive') })
  @ApiPropertyOptional({ example: true })
  isActive?: boolean;

  @IsOptional()
  @IsIn(Object.values(StudentSortField), { message: VALIDATION_MSG.IS_ENUM('sortBy') })
  @ApiPropertyOptional({ enum: StudentSortField })
  sortBy?: StudentSortField;

  @IsOptional()
  @ValidateIf((dto: ListStudentsReqDto) => dto.sortBy !== undefined)
  @IsIn(['asc', 'desc'], { message: VALIDATION_MSG.IS_ENUM('sortDir') })
  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'asc' })
  sortDir?: 'asc' | 'desc';
}

export class StudentLiteResDto {
  @ApiProperty({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' })
  id!: string;

  @ApiProperty({ example: 'STU-AB12', description: 'Business/roster code, not a foreign key.' })
  studentId!: string;

  @ApiPropertyOptional({ example: 'Ava Thompson', nullable: true })
  name!: string | null;
}

export class StudentSummaryResDto extends StudentLiteResDto {
  @ApiPropertyOptional({ example: 'ava.thompson@example.com', nullable: true })
  email!: string | null;

  @ApiPropertyOptional({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6', nullable: true })
  classId!: string | null;

  @ApiPropertyOptional({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6', nullable: true })
  schoolId!: string | null;

  @ApiProperty({ enum: CommonStatus, example: CommonStatus.ACTIVE })
  status!: CommonStatus;

  @ApiProperty({ example: true })
  isActive!: boolean;

  @ApiPropertyOptional({ example: '2026-01-15', nullable: true })
  submissionDate!: string | null;

  @ApiPropertyOptional({ example: '3', nullable: true })
  simsCompleted!: string | null;

  @ApiPropertyOptional({ example: 87.5, nullable: true })
  score!: number | null;

  @ApiPropertyOptional({ example: '02:15:00', description: 'HH:MM:SS', nullable: true })
  timeSpent!: string | null;

  @ApiPropertyOptional({ example: '00:45:00', description: 'HH:MM:SS', nullable: true })
  timeRemaining!: string | null;

  @ApiProperty({ example: 3 })
  reportsCount!: number;

  @ApiProperty({ enum: StudentCodeStatus, example: StudentCodeStatus.ACTIVE })
  codeStatus!: StudentCodeStatus;
}

export class ListStudentsResponseDto extends ApiPaginatedResponseDto(
  StudentSummaryResDto,
  'Students fetched successfully',
) { }

export class ListStudentsLiteResponseDto extends ApiPaginatedResponseDto(
  StudentLiteResDto,
  'Students fetched successfully',
) { }
