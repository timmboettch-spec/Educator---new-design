import {
  IsUUID,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  Matches,
  Min,
  IsArray,
  ValidateNested,
  IsString,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { ClassConstants } from '../classes.constants';
import { CommonStatus } from 'src/common/enums/status.enum';
import { Type } from 'class-transformer';
import { CreateStudentDto } from '../../students/dto/students.dto';

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
