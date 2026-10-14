import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Length } from 'class-validator';
import { VALIDATION_MSG } from 'src/common/messages/validation.message';
import { ApiResponseDto } from 'src/common/dtos/api-response.dto';
import { AuthConstants } from '../../auth/auth.constants';
import { EmptyDataDto } from 'src/common/dtos/api-response.dto';

export class AcceptInviteReqDto {
  @IsString({ message: VALIDATION_MSG.IS_STRING('token') })
  @IsNotEmpty({ message: VALIDATION_MSG.IS_NOT_EMPTY('token') })
  @ApiProperty({ example: 'FHZ0aXZl.YWJjZGVmZ2hpams.dGFnMTIzNA' })
  token!: string;

  @IsString({ message: VALIDATION_MSG.IS_STRING('password') })
  @Length(AuthConstants.VALIDATION.PASSWORD_MIN, AuthConstants.VALIDATION.PASSWORD_MAX, {
    message: VALIDATION_MSG.MIN_LENGTH('password', AuthConstants.VALIDATION.PASSWORD_MIN),
  })
  @ApiProperty({ example: 'StrongP@ssw0rd' })
  password!: string;
}

/** Accepting an invite only activates the account — no session is issued, so there is no data payload. */
export class AcceptInviteResponseDto extends ApiResponseDto(EmptyDataDto) { }
