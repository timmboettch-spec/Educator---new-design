import {
  IsEmail,
  IsString,
  IsBoolean,
  IsOptional,
  IsEnum,
  IsUUID,
  IsNotEmpty,
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
  full_name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  profile_picture_url?: string;
}

export class ChangePasswordDto {
  @ApiPropertyOptional({ description: 'User UUID' })
  @IsUUID('4', { message: 'Invalid User ID format' })
  @IsNotEmpty()
  user_id!: string;

  @ApiPropertyOptional()
  @IsString()
  @IsNotEmpty()
  old_password!: string;

  @ApiPropertyOptional()
  @IsString()
  @IsNotEmpty()
  new_password!: string;
}
