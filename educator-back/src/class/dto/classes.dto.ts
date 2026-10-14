import {
  ArrayMaxSize,
  IsUUID,
  IsEnum,
  IsIn,
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsOptional,
  Matches,
  Min,
  IsArray,
  ArrayNotEmpty,
  ValidateIf,
  ValidateNested,
  IsString,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional, IntersectionType, PickType } from '@nestjs/swagger';
import { ClassAttentionMeasure, ClassConstants, ClassSortField } from '../constants';
import { CommonStatus } from 'src/common/enums/status.enum';
import { Transform, Type } from 'class-transformer';
import { CreateStudentDto } from '../../students/dto/students.dto';
import { PaginationDto } from 'src/common/dtos/pagination.dto';
import { ApiPaginatedResponseDto, ApiResponseDto } from 'src/common/dtos/api-response.dto';
import { LiteQueryDto } from 'src/common/dtos/lite-query.dto';
import { VALIDATION_MSG } from 'src/common/messages/validation.message';
import { toStringArray } from 'src/common/utils/query-array.util';
import { IsCalendarDate } from 'src/common/validators/is-calendar-date.validator';
import { IsUuidOrSentinel } from 'src/common/validators/is-uuid-or-sentinel.validator';

export class ClassDto {
  @IsOptional()
  @IsString()
  class_id?: string;

  @IsNotEmpty({ message: ClassConstants.VALIDATION.NAME_REQUIRED })
  class_name?: string;

  @IsOptional()
  term?: string;

  @IsOptional()
  @Matches(/^\d{4}$/, {
    message: ClassConstants.VALIDATION.YEAR_INVALID,
  })
  year?: string;

  @IsNotEmpty({ message: 'Start date is required' })
  start_date?: string;

  @IsNotEmpty({ message: 'End date is required' })
  end_date?: string;

  @ApiPropertyOptional({ enum: CommonStatus, default: CommonStatus.ACTIVE })
  @IsOptional()
  @IsEnum(CommonStatus, { message: ClassConstants.VALIDATION.STATUS_ENUM })
  status?: CommonStatus;

  @ApiPropertyOptional({ description: 'Ignored by the server' })
  @IsOptional()
  id?: string;

  @ApiPropertyOptional({ description: 'The UUID of the school this class belongs to' })
  @IsOptional()
  @IsUUID('4', { message: 'Invalid school ID format' })
  school_id?: string;

  @ApiPropertyOptional({ description: 'The UUID of the educator who owns this class' })
  @IsOptional()
  @IsUUID('4', { message: 'Educator Not Found' })
  educator_id?: string;

  @IsOptional()
  @IsInt({ message: 'Total number of students must be an integer' })
  @Min(0, { message: 'Total number of students cannot be negative' })
  total_no_of_students?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateStudentDto)
  students?: CreateStudentDto[];

  @ApiPropertyOptional({
    description: 'LMS course ID (contextId) for mapping — used when bulk-creating from LMS roster',
  })
  @IsOptional()
  @IsString()
  lmsCourseId?: string;

  @ApiPropertyOptional({ description: 'NRPS URL for this LMS course — stored in class mapping' })
  @IsOptional()
  @IsString()
  nrpsUrl?: string;
}

export class UpdateClassDto {
  @IsOptional()
  class_name?: string;

  @IsOptional()
  term?: string;

  @IsOptional()
  year?: string;

  @IsOptional()
  end_date?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'Start date must be in YYYY-MM-DD format',
  })
  start_date?: string;

  @IsOptional()
  @IsEnum(CommonStatus, { message: ClassConstants.VALIDATION.STATUS_ENUM })
  status?: CommonStatus;

  @ApiPropertyOptional({ description: 'The UUID of the school this class belongs to' })
  @IsOptional()
  @IsUUID('4', { message: 'Invalid school ID format' })
  school_id?: string;
}

export class ClassIdDto {
  @IsUUID('4', { message: 'Invalid Class ID format' })
  @IsNotEmpty()
  id!: string;
}

export class BulkCreateClassesDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ClassDto)
  classes!: ClassDto[];
}

export class ValidateRosterDto {
  @ApiProperty({ type: [String], description: 'List of student codes to validate' })
  @IsArray()
  @ArrayNotEmpty({ message: 'studentCodes array cannot be empty' })
  @IsString({ each: true })
  studentCodes!: string[];
}

export class AttentionSummaryReqDto {
  @ApiPropertyOptional({ description: 'The UUID of the school this class belongs to' })
  @IsOptional()
  @IsUUID('4', { message: VALIDATION_MSG.IS_UUID('school_id') })
  school_id?: string;
}

export class AttentionSummaryResDto {
  @ApiProperty({ example: 12, description: 'Total active classes for the educator' })
  totalClasses!: number;

  @ApiProperty({
    example: 3,
    description:
      'Distinct active classes needing attention for at least one reason (unread reports, no students, or no assigned sims) — deduplicated, so it is not just the sum of the fields below',
  })
  classesNeedingAttention!: number;

  @ApiProperty({ example: 2, description: 'Active classes with at least one unread report' })
  unreadReports!: number;

  @ApiProperty({ example: 1, description: 'Active classes with zero active students' })
  noStudents!: number;

  @ApiProperty({ example: 0, description: 'Active classes with no simulations assigned' })
  noAssignedSims!: number;
}

export class AttentionSummaryResponseDto extends ApiResponseDto(AttentionSummaryResDto) {}

// --- School-groups read model (GET /classes/schools, GET /classes) ---

export class ListSchoolGroupsReqDto extends PaginationDto {
  /** Partial, case-insensitive match on the school's name. */
  @IsOptional()
  @IsString({ message: VALIDATION_MSG.IS_STRING('schoolName') })
  @MaxLength(200, { message: VALIDATION_MSG.MAX_LENGTH('schoolName', 200) })
  @ApiPropertyOptional({ example: 'Cedar Hollow' })
  schoolName?: string;

  /** Partial, case-insensitive match on class names — only groups with at least one matching
   * class are returned, same as the school-name filter. */
  @IsOptional()
  @IsString({ message: VALIDATION_MSG.IS_STRING('className') })
  @MaxLength(200, { message: VALIDATION_MSG.MAX_LENGTH('className', 200) })
  @ApiPropertyOptional({ example: 'Nursing' })
  className?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => toStringArray(value))
  @IsArray({ message: VALIDATION_MSG.INVALID('schoolId') })
  @ArrayMaxSize(100)
  @IsUuidOrSentinel(ClassConstants.UNASSIGNED_SCHOOL_SENTINEL, { each: true })
  @ApiPropertyOptional({
    type: [String],
    example: ['3fa85f64-5717-4562-b3fc-2c963f66afa6', 'unassigned'],
  })
  schoolId?: string[];

  /** Exact class ids multi-select — same filter as GET /classes' classId. */
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => toStringArray(value))
  @IsArray({ message: VALIDATION_MSG.INVALID('classId') })
  @ArrayMaxSize(100)
  @IsUUID('4', { each: true, message: VALIDATION_MSG.IS_UUID('classId') })
  @ApiPropertyOptional({ type: [String], example: ['3fa85f64-5717-4562-b3fc-2c963f66afa6'] })
  classId?: string[];

  /** Class status multi-select. */
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => toStringArray(value))
  @IsArray({ message: VALIDATION_MSG.INVALID('classStatus') })
  @ArrayMaxSize(Object.keys(CommonStatus).length)
  @IsEnum(CommonStatus, { each: true, message: VALIDATION_MSG.IS_ENUM('classStatus') })
  @ApiPropertyOptional({ enum: CommonStatus, isArray: true, example: [CommonStatus.ACTIVE] })
  classStatus?: CommonStatus[];

  /** Class start date, on/after. */
  @IsOptional()
  @IsDateString({}, { message: VALIDATION_MSG.INVALID('classStartDateFrom') })
  @ApiPropertyOptional({ example: '2026-01-01' })
  classStartDateFrom?: string;

  /** Class end date, on/before. */
  @IsOptional()
  @IsDateString({}, { message: VALIDATION_MSG.INVALID('classEndDateTo') })
  @ApiPropertyOptional({ example: '2026-12-31' })
  classEndDateTo?: string;

  @IsOptional()
  @IsEnum(ClassAttentionMeasure, { message: VALIDATION_MSG.IS_ENUM('measure') })
  @ApiPropertyOptional({ enum: ClassAttentionMeasure, example: ClassAttentionMeasure.CLOSING_SOON })
  measure?: ClassAttentionMeasure;
}

export class ListClassesReqDto extends IntersectionType(PaginationDto, LiteQueryDto) {
  @IsOptional()
  @IsString({ message: VALIDATION_MSG.IS_STRING('search') })
  @MaxLength(200, { message: VALIDATION_MSG.MAX_LENGTH('search', 200) })
  @ApiPropertyOptional({ example: 'Oncology' })
  search?: string;

  /** Optional school scoping — accepts school UUIDs and/or the "unassigned" sentinel. When
   * omitted, classes across every school (and the unassigned bucket) are returned. */
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => toStringArray(value))
  @IsArray({ message: VALIDATION_MSG.INVALID('schoolIds') })
  @ArrayMaxSize(100)
  @IsUuidOrSentinel(ClassConstants.UNASSIGNED_SCHOOL_SENTINEL, { each: true })
  @ApiPropertyOptional({
    type: [String],
    example: ['3fa85f64-5717-4562-b3fc-2c963f66afa6', 'unassigned'],
  })
  schoolIds?: string[];

  /** Filter Classes sub-task: "Class Name" multi-select (exact class ids, not text). */
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => toStringArray(value))
  @IsArray({ message: VALIDATION_MSG.INVALID('classId') })
  @ArrayMaxSize(100)
  @IsUUID('4', { each: true, message: VALIDATION_MSG.IS_UUID('classId') })
  @ApiPropertyOptional({ type: [String], example: ['3fa85f64-5717-4562-b3fc-2c963f66afa6'] })
  classId?: string[];

  /** Filter Classes sub-task: "Class Status" multi-select. */
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => toStringArray(value))
  @IsArray({ message: VALIDATION_MSG.INVALID('status') })
  @ArrayMaxSize(Object.keys(CommonStatus).length)
  @IsEnum(CommonStatus, { each: true, message: VALIDATION_MSG.IS_ENUM('status') })
  @ApiPropertyOptional({ enum: CommonStatus, isArray: true, example: [CommonStatus.ACTIVE] })
  status?: CommonStatus[];

  /** Filter Classes sub-task: "Class Start Date (on/after)". */
  @IsOptional()
  @IsDateString({}, { message: VALIDATION_MSG.INVALID('startDateFrom') })
  @ApiPropertyOptional({ example: '2026-01-01' })
  startDateFrom?: string;

  /** Filter Classes sub-task: "Class End Date (on/before)". */
  @IsOptional()
  @IsDateString({}, { message: VALIDATION_MSG.INVALID('endDateTo') })
  @ApiPropertyOptional({ example: '2026-12-31' })
  endDateTo?: string;

  /** Class End Date (on/after) — leaves out classes that ended before this calendar date. */
  @IsOptional()
  @IsCalendarDate({ message: VALIDATION_MSG.INVALID('endDateFrom') })
  @ApiPropertyOptional({ example: '2026-06-15', description: 'Calendar date, `YYYY-MM-DD`.' })
  endDateFrom?: string;

  @IsOptional()
  @IsIn(Object.values(ClassSortField), { message: VALIDATION_MSG.IS_ENUM('sortBy') })
  @ApiPropertyOptional({ enum: ClassSortField })
  sortBy?: ClassSortField;

  @IsOptional()
  @ValidateIf((dto: ListClassesReqDto) => dto.sortBy !== undefined)
  @IsIn(['asc', 'desc'], { message: VALIDATION_MSG.IS_ENUM('sortDir') })
  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'asc' })
  sortDir?: 'asc' | 'desc';

  @IsOptional()
  @IsEnum(ClassAttentionMeasure, { message: VALIDATION_MSG.IS_ENUM('measure') })
  @ApiPropertyOptional({ enum: ClassAttentionMeasure, example: ClassAttentionMeasure.CLOSING_SOON })
  measure?: ClassAttentionMeasure;
}

export class SchoolGroupResDto {
  @ApiPropertyOptional({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6', nullable: true })
  schoolId!: string | null;

  @ApiProperty({ example: 'Cedar Hollow Health Sciences Academy' })
  schoolName!: string;

  @ApiProperty({ example: 6 })
  classCount!: number;
}

export class ListSchoolGroupsResponseDto extends ApiPaginatedResponseDto(
  SchoolGroupResDto,
  'School groups fetched successfully',
) {}

export class ClassSummaryResDto {
  @ApiProperty({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' })
  classId!: string;

  @ApiProperty({ example: 'Oncology Nursing — Sec D' })
  className!: string;

  @ApiProperty({ example: '2026-01-01' })
  startDate!: string;

  @ApiProperty({ example: '2026-12-31' })
  endDate!: string;

  @ApiProperty({ example: 28 })
  studentsCount!: number;

  @ApiProperty({ example: 7 })
  simsCount!: number;

  @ApiProperty({ example: 0 })
  reportsCount!: number;

  @ApiProperty({
    example: 2,
    description:
      'Reports of active students in this class that the educator has not viewed yet. ' +
      'There is no separate `needsAttention` flag: treat the class as needing attention for unread reports when `unreadReportsCount > 0`.',
  })
  unreadReportsCount!: number;

  @ApiProperty({ enum: CommonStatus, example: CommonStatus.ACTIVE })
  status!: CommonStatus;
}

export class ListClassesResponseDto extends ApiPaginatedResponseDto(
  ClassSummaryResDto,
  'Classes fetched successfully',
) {}

export class ClassLiteResDto extends PickType(ClassSummaryResDto, [
  'classId',
  'className',
  'startDate',
  'endDate',
  'status',
] as const) {}

export class ListClassesLiteResponseDto extends ApiPaginatedResponseDto(
  ClassLiteResDto,
  'Classes fetched successfully',
) {}

export class ClassStatusResDto {
  @ApiProperty({
    enum: CommonStatus,
    isArray: true,
    example: [CommonStatus.ACTIVE, CommonStatus.INACTIVE, CommonStatus.ARCHIEVED],
  })
  statuses!: CommonStatus[];
}

export class ClassStatusesResponseDto extends ApiResponseDto(
  ClassStatusResDto,
  'Class statuses fetched successfully',
) {}
