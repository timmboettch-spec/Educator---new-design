import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsUUID } from 'class-validator';
import { VALIDATION_MSG } from 'src/common/messages/validation.message';

/**
 * Body for `POST /auth/select-role` — combined endpoint for both the first role selection
 * (exchanging a `purpose: 'login'` token) and switching between an account's own active roles
 * (from an existing `purpose: 'access'` token). `JwtStrategyV2` accepts either token purpose, so
 * the same `roleId` lookup handles both cases identically.
 */
export class SelectRoleReqDto {
  @IsNotEmpty({ message: VALIDATION_MSG.IS_NOT_EMPTY('roleId') })
  @IsUUID(undefined, { message: VALIDATION_MSG.IS_UUID('roleId') })
  @ApiProperty({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' })
  roleId!: string;
}
