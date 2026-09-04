import {
  IsEmail,
  IsString,
  IsNotEmpty,
  Length,
  IsOptional,
  IsUUID,
  IsEnum,
  IsNumber,
  Matches,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { AuthConstants } from '../auth.constants';
import { CommonStatus } from 'src/common/enums/status.enum';

export class SignupDto {
  @ApiProperty({ example: 'admin@school.com' })
  @IsEmail({}, { message: AuthConstants.VALIDATION.EMAIL_INVALID })
  @IsNotEmpty({ message: AuthConstants.VALIDATION.EMAIL_REQUIRED })
  email!: string;

  @ApiProperty({ example: 'Password@123', minLength: 8, maxLength: 20 })
  @IsString()
  @IsOptional()
  @Length(AuthConstants.VALIDATION.PASSWORD_MIN, AuthConstants.VALIDATION.PASSWORD_MAX, {
    message: AuthConstants.VALIDATION.PASSWORD_LENGTH,
  })
  password?: string;
  @ApiProperty({ example: "Anne-Marie O'Brien" })
  @IsString({ message: 'Full name must be a string' })
  @IsNotEmpty({ message: 'Full name is required' })
  @Length(2, 50, {
    message: 'Full name must be at least 2 characters and not exceed 50 characters',
  })
  @Matches(/^[^ ]/, { message: 'Full name cannot start with a space' })
  @Matches(/^[^\p{Emoji_Presentation}\p{Extended_Pictographic}]+$/u, {
    message: 'Emojis are not allowed in full name',
  })
  full_name!: string;
  @ApiPropertyOptional({
    example: 'invite-uuid',
    description: 'Required for educator signup — received from the invite email link',
  })
  @Transform(({ value }: { value: string }) => (value === '' ? undefined : value))
  @IsUUID('4', { message: 'invite_id must be a valid UUID' })
  @IsOptional()
  invite_id?: string;

  @ApiPropertyOptional({ enum: CommonStatus, example: CommonStatus.ACTIVE })
  @IsEnum(CommonStatus, { message: 'Status must be a valid CommonStatus' })
  @IsOptional()
  status?: CommonStatus;

  @ApiPropertyOptional({ example: 'role-uuid', description: 'Only used for admin signup' })
  @IsUUID('4', { message: 'role_id must be a valid UUID' })
  @IsOptional()
  role_id?: string;

  @ApiPropertyOptional({
    description: 'Deprecated: Used for backward compatibility with old payloads',
  })
  @IsOptional()
  @IsString()
  school_id?: string;

  @ApiPropertyOptional({
    description: 'Deprecated: Used for backward compatibility with old payloads',
  })
  @IsOptional()
  @IsString()
  class_id?: string;

  @ApiPropertyOptional({ example: '9087689877' })
  @IsString({ message: 'Phone number must be a string' })
  @IsOptional()
  phone_number?: string;

  @ApiPropertyOptional({ example: 50 })
  @IsNumber()
  @IsOptional()
  tokens?: string;
}
// export class
export class LoginDto {
  @ApiProperty({ example: 'admin@school.com' })
  @IsEmail({}, { message: AuthConstants.VALIDATION.EMAIL_INVALID })
  @IsNotEmpty({ message: AuthConstants.VALIDATION.EMAIL_REQUIRED })
  email!: string;

  @ApiProperty({ example: 'Password@123' })
  @IsString()
  @IsNotEmpty({ message: AuthConstants.VALIDATION.PASSWORD_REQUIRED })
  password!: string;
}

export class ForgotPasswordDto {
  @ApiProperty({ example: 'admin@school.com' })
  @IsEmail({}, { message: AuthConstants.VALIDATION.EMAIL_INVALID })
  @IsNotEmpty({ message: AuthConstants.VALIDATION.EMAIL_REQUIRED })
  email!: string;

  @ApiPropertyOptional({ example: 'admin', enum: ['admin', 'educator'] })
  @IsOptional()
  @IsString()
  @Matches(/^(admin|educator)$/, { message: 'role must be admin or educator' })
  role?: 'admin' | 'educator';
}

export class VerifyOtpDto {
  @ApiProperty({ example: '123456' })
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }: { value: string }) => value?.trim())
  otp!: string;

  @ApiProperty({ example: 'reset-token-here' })
  @IsString()
  @IsNotEmpty()
  reset_token!: string;
}

export class ResetPasswordDto {
  @ApiProperty({ example: 'verified-token-here' })
  @IsString()
  @IsNotEmpty()
  verified_token!: string;

  @ApiProperty({ example: 'NewPassword@123', minLength: 8, maxLength: 20 })
  @IsString()
  @IsNotEmpty({ message: AuthConstants.VALIDATION.PASSWORD_REQUIRED })
  @Length(AuthConstants.VALIDATION.PASSWORD_MIN, AuthConstants.VALIDATION.PASSWORD_MAX, {
    message: AuthConstants.VALIDATION.PASSWORD_LENGTH,
  })
  new_password!: string;
}

export class ResendOtpDto {
  @ApiProperty({ example: 'reset-token-here' })
  @IsString()
  @IsNotEmpty()
  reset_token!: string;
}

export class RedeemDto {
  @ApiProperty({ example: 'ABCD1234EFGH5678', description: 'The license activation code' })
  @IsString({ message: AuthConstants.VALIDATION.CODE_MUST_BE_STRING })
  @IsNotEmpty({ message: AuthConstants.VALIDATION.CODE_REQUIRED })
  code!: string;

  @ApiPropertyOptional({
    example: 'admin@school.com',
    description: 'Optional — email is taken from JWT token',
  })
  @IsEmail({}, { message: AuthConstants.VALIDATION.EMAIL_INVALID })
  @IsOptional()
  email?: string;
}

export type DecodedOtpToken = { purpose?: string; email: string; exp?: number; role?: string };
