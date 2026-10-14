import { ApiPropertyOptional, PickType } from '@nestjs/swagger';
import {
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';
import { ClassResponseDto } from 'src/database/response-dto';
import { VALIDATION_MSG } from 'src/common/messages/validation.message';
import { ApiResponseDto } from 'src/common/dtos/api-response.dto';
import { ClassConstants as NewClassConstants } from 'src/common/constants';
import { ClassConstants as LegacyClassConstants } from '../constants';
import { CommonStatus } from 'src/common/enums/status.enum';

export class UpdateClassReqDto {
  @IsOptional()
  @IsString({ message: VALIDATION_MSG.IS_STRING('className') })
  @MaxLength(NewClassConstants.VALIDATION.NAME_MAX_LENGTH, {
    message: VALIDATION_MSG.MAX_LENGTH('className', NewClassConstants.VALIDATION.NAME_MAX_LENGTH),
  })
  @ApiPropertyOptional({ example: 'Oncology Nursing — Sec D' })
  className?: string;

  @IsOptional()
  @IsDateString({}, { message: VALIDATION_MSG.INVALID('startDate') })
  @ApiPropertyOptional({ example: '2026-01-01' })
  startDate?: string;

  @IsOptional()
  @IsDateString({}, { message: VALIDATION_MSG.INVALID('endDate') })
  @ApiPropertyOptional({ example: '2026-12-31' })
  endDate?: string;

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
}

export class UpdateClassResDto extends PickType(ClassResponseDto, [
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
] as const) {}

export class UpdateClassResponseDto extends ApiResponseDto(
  UpdateClassResDto,
  'Class updated successfully',
) {}
