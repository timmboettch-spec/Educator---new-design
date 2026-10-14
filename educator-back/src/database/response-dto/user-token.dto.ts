import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserToken } from '../entities/user-token.entity';
import { UserTokenPurpose } from 'src/common/constants';

export class UserTokenResponseDto implements UserToken {
  @ApiProperty({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' })
  userTokenId!: string;

  @ApiProperty({ example: UserTokenPurpose.FORGOT_PASSWORD, enum: UserTokenPurpose })
  purpose!: UserTokenPurpose;

  @ApiProperty({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' })
  userId!: string;

  @ApiProperty({ example: '123456' })
  token!: string;

  @ApiProperty({ example: '2026-01-01T00:05:00.000Z' })
  expiresAt!: Date;

  @ApiProperty({ example: '2026-01-01T00:00:00.000Z' })
  createdAt!: Date;

  @ApiProperty({ example: '2026-01-01T00:00:00.000Z' })
  updatedAt!: Date;

  @ApiPropertyOptional({ example: null })
  deletedAt?: Date | null;
}
