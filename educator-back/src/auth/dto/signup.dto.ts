import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsOptional, IsString, Length } from 'class-validator';
import { VALIDATION_MSG } from 'src/common/messages/validation.message';
import { ApiResponseDto } from 'src/common/dtos/api-response.dto';
import { AuthConstants } from '../auth.constants';
import { LoginResDto } from './login.dto';

export class SignupReqDto {
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsEmail({}, { message: VALIDATION_MSG.IS_EMAIL('email') })
  @ApiProperty({ example: 'district.admin@example.com' })
  email!: string;

  @IsString({ message: VALIDATION_MSG.IS_STRING('password') })
  @Length(AuthConstants.VALIDATION.PASSWORD_MIN, AuthConstants.VALIDATION.PASSWORD_MAX, {
    message: VALIDATION_MSG.MIN_LENGTH('password', AuthConstants.VALIDATION.PASSWORD_MIN),
  })
  @ApiProperty({ example: 'StrongP@ssw0rd' })
  password!: string;

  @IsOptional()
  @IsString({ message: VALIDATION_MSG.IS_STRING('fullName') })
  @ApiPropertyOptional({ example: 'Ava Thompson' })
  fullName?: string;
}

/** Same envelope shape as login — signup auto-authenticates, so it returns the full login response. */
export class SignupResponseDto extends ApiResponseDto(LoginResDto) { }
