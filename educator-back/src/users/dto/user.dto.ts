import {
  IsEmail,
  IsString,
  IsBoolean,
  IsOptional,
  IsEnum,
  IsUUID,
} from 'class-validator';
import { CommonStatus } from 'src/common/enums/status.enum';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';

export class CreateUserDto {
  @IsEmail()
  email!: string;

  @IsOptional()
  @IsString()
  password?: string;

  @IsString()
  full_name!: string;

  @IsOptional()
  @IsBoolean()
  invited?: boolean;

  @ApiPropertyOptional({ description: 'UUID of an accepted invite' })
  @IsOptional()
  @Transform(({ value }: { value: string }) => (value === '' ? undefined : value))
  @IsUUID()
  invite_id?: string;

  @IsOptional()
  @IsEnum(CommonStatus)
  status?: CommonStatus;

  @IsOptional()
  @IsUUID()
  role_id?: string;
}

export class UpdateProfileDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  fullName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  profilePictureUrl?: string;
}

