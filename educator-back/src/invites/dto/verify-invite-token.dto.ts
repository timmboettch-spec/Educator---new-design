import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';
import { VALIDATION_MSG } from 'src/common/messages/validation.message';

export class VerifyInviteTokenReqDto {
  @IsString({ message: VALIDATION_MSG.IS_STRING('token') })
  @IsNotEmpty({ message: VALIDATION_MSG.IS_NOT_EMPTY('token') })
  @ApiProperty({ example: 'FHZ0aXZl.YWJjZGVmZ2hpams.dGFnMTIzNA' })
  token!: string;
}

export class VerifyInviteTokenResDto {
  @ApiProperty({ example: 'educator@school.com' })
  email!: string;

  @ApiProperty({ example: 'John Doe' })
  full_name!: string;
}
