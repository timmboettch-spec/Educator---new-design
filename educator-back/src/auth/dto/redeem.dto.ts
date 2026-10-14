import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';
import { VALIDATION_MSG } from 'src/common/messages/validation.message';
import { ApiResponseDto } from 'src/common/dtos/api-response.dto';

export class RedeemReqDto {
  @IsString({ message: VALIDATION_MSG.IS_STRING('code') })
  @IsNotEmpty({ message: VALIDATION_MSG.IS_NOT_EMPTY('code') })
  @ApiProperty({ example: 'RWMASTER20250617' })
  code!: string;
}

export class RedeemResDto {
  @ApiProperty({ example: 'district.admin@example.com' })
  userEmail!: string;

  @ApiProperty({ example: [] })
  subscriptions!: object[];
}

export class RedeemResponseDto extends ApiResponseDto(RedeemResDto) { }
