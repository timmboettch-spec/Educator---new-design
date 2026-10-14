import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsString, Length } from 'class-validator';
import { VALIDATION_MSG } from 'src/common/messages/validation.message';
import { ApiResponseDto, EmptyDataDto } from 'src/common/dtos/api-response.dto';
import { AuthConstants } from '../auth.constants';

export class ResetPasswordReqDto {
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsEmail({}, { message: VALIDATION_MSG.IS_EMAIL('email') })
  @ApiProperty({ example: 'district.admin@example.com' })
  email!: string;

  @IsString({ message: VALIDATION_MSG.IS_STRING('otp') })
  @IsNotEmpty({ message: VALIDATION_MSG.IS_NOT_EMPTY('otp') })
  @ApiProperty({ example: '123456' })
  otp!: string;

  @IsString({ message: VALIDATION_MSG.IS_STRING('newPassword') })
  @Length(AuthConstants.VALIDATION.PASSWORD_MIN, AuthConstants.VALIDATION.PASSWORD_MAX, {
    message: VALIDATION_MSG.MIN_LENGTH('newPassword', AuthConstants.VALIDATION.PASSWORD_MIN),
  })
  @ApiProperty({ example: 'NewStrongP@ssw0rd' })
  newPassword!: string;
}

export class ResetPasswordResponseDto extends ApiResponseDto(EmptyDataDto) { }
