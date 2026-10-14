import { ApiProperty, ApiPropertyOptional, PickType } from '@nestjs/swagger';
import {
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Min,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ClassResponseDto } from 'src/database/response-dto';
import { VALIDATION_MSG } from 'src/common/messages/validation.message';
import { ApiResponseDto } from 'src/common/dtos/api-response.dto';
import { ClassConstants as NewClassConstants } from 'src/common/constants';
import { ClassConstants as LegacyClassConstants } from '../constants';
import { CommonStatus } from 'src/common/enums/status.enum';
import { CreateStudentDto } from 'src/students/dto/students.dto';

export class CreateClassReqDto {
  @IsString({ message: VALIDATION_MSG.IS_STRING('className') })
  @IsNotEmpty({ message: VALIDATION_MSG.IS_NOT_EMPTY('className') })
  @MaxLength(NewClassConstants.VALIDATION.NAME_MAX_LENGTH, {
    message: VALIDATION_MSG.MAX_LENGTH('className', NewClassConstants.VALIDATION.NAME_MAX_LENGTH),
  })
  @ApiProperty({ example: 'Oncology Nursing — Sec D' })
  className!: string;

  @IsDateString({}, { message: VALIDATION_MSG.INVALID('startDate') })
  @ApiProperty({ example: '2026-01-01' })
  startDate!: string;

  @IsDateString({}, { message: VALIDATION_MSG.INVALID('endDate') })
  @ApiProperty({ example: '2026-12-31' })
  endDate!: string;

  @IsOptional()
  @IsUUID('4', { message: VALIDATION_MSG.IS_UUID('schoolId') })
  @ApiPropertyOptional({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' })
  schoolId?: string;

  @IsOptional()
  @IsString({ message: VALIDATION_MSG.IS_STRING('term') })
  @ApiPropertyOptional({ example: 'Fall' })
  term?: string;

  @IsOptional()
  @Matches(/^\d{4}$/, { message: VALIDATION_MSG.INVALID('year') })
  @ApiPropertyOptional({ example: '2026' })
  year?: string;

  @IsOptional()
  @IsIn(LegacyClassConstants.VALID_STATUSES, { message: VALIDATION_MSG.IS_ENUM('status') })
  @ApiPropertyOptional({ enum: CommonStatus, example: CommonStatus.ACTIVE })
  status?: CommonStatus;

  @IsOptional()
  @IsInt({ message: VALIDATION_MSG.IS_INT('totalNoOfStudents') })
  @Min(0, { message: VALIDATION_MSG.MIN_VALUE('totalNoOfStudents', 0) })
  @ApiPropertyOptional({ example: 28 })
  totalNoOfStudents?: number;

  @IsOptional()
  @IsArray({ message: VALIDATION_MSG.INVALID('students') })
  @ValidateNested({ each: true })
  @Type(() => CreateStudentDto)
  @ApiPropertyOptional({ type: [CreateStudentDto] })
  students?: CreateStudentDto[];

  @IsOptional()
  @IsString({ message: VALIDATION_MSG.IS_STRING('lmsCourseId') })
  @ApiPropertyOptional({
    example: 'moodle-course-1029',
    description: 'LMS course ID (contextId) for mapping — used when creating from an LMS roster',
  })
  lmsCourseId?: string;

  @IsOptional()
  @IsString({ message: VALIDATION_MSG.IS_STRING('nrpsUrl') })
  @ApiPropertyOptional({
    example: 'https://moodle.example.com/mod/lti/services.php/NRPS/1029',
    description: 'NRPS URL for this LMS course — stored in the class mapping',
  })
  nrpsUrl?: string;
}

export class CreateClassResDto extends PickType(ClassResponseDto, [
  'classId',
  'className',
  'startDate',
  'endDate',
  'status',
  'schoolId',
  'educatorId',
  'term',
  'year',
  'totalNoOfStudents',
  'createdAt',
  'updatedAt',
] as const) { }

export class CreateClassResponseDto extends ApiResponseDto(
  CreateClassResDto,
  'Class created successfully',
) { }
