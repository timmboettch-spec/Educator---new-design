import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Length } from 'class-validator';
import { VALIDATION_MSG } from 'src/common/messages/validation.message';
import { ApiResponseDto, EmptyDataDto } from 'src/common/dtos/api-response.dto';
import { AuthConstants } from '../auth.constants';

export class ChangePasswordReqDto {
  @IsString({ message: VALIDATION_MSG.IS_STRING('oldPassword') })
  @IsNotEmpty({ message: VALIDATION_MSG.IS_NOT_EMPTY('oldPassword') })
  @ApiProperty({ example: 'CurrentP@ssw0rd' })
  oldPassword!: string;

  @IsString({ message: VALIDATION_MSG.IS_STRING('newPassword') })
  @Length(AuthConstants.VALIDATION.PASSWORD_MIN, AuthConstants.VALIDATION.PASSWORD_MAX, {
    message: VALIDATION_MSG.MIN_LENGTH('newPassword', AuthConstants.VALIDATION.PASSWORD_MIN),
  })
  @ApiProperty({ example: 'NewStrongP@ssw0rd' })
  newPassword!: string;
}

export class ChangePasswordResponseDto extends ApiResponseDto(EmptyDataDto) { }
