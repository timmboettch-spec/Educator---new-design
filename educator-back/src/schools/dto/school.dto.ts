import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
  MaxLength,
  IsUUID,
  Matches,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SchoolConstants } from '../schools.constants';
import { CommonStatus } from 'src/common/enums/status.enum';

export class SchoolDto {
  @ApiProperty({ example: 'Greenwood High School' })
  @IsString()
  @Matches(/^(?!.*\p{Extended_Pictographic}).*$/u, {
    message: 'Emojis are not allowed in school name',
  })
  @IsNotEmpty({ message: SchoolConstants.VALIDATION.NAME_REQUIRED })
  @MinLength(3, { message: 'School name is too short (min 3 characters)' })
  @MaxLength(100, { message: 'School name is too long (max 100 characters)' })
  school_name: string;

  @ApiPropertyOptional({ enum: CommonStatus, default: CommonStatus.ACTIVE })
  @IsOptional()
  @IsEnum(CommonStatus, { message: SchoolConstants.VALIDATION.STATUS_ENUM })
  status?: CommonStatus;

  @ApiPropertyOptional({ description: 'The UUID of the user who owns this school' })
  @IsOptional()
  @IsUUID('4', { message: 'User Not Found' })
  user_id?: string;
}

export class SchoolIdDto {
  @IsUUID('4', { message: 'Invalid School ID format' })
  @IsNotEmpty()
  id: string;
}

export class AdminIdDto {
  @IsUUID('4', { message: 'Invalid Admin ID format' })
  @IsNotEmpty()
  adminId: string;
}
