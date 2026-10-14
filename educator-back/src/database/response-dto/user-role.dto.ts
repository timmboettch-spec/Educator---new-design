import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserRole } from '../entities/user-role.entity';
import { CommonStatus } from 'src/common/enums/status.enum';

export class UserRoleResponseDto implements UserRole {
  @ApiProperty({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' })
  userRoleId!: string;

  @ApiProperty({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' })
  userId!: string;

  @ApiProperty({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' })
  roleId!: string;

  @ApiProperty({ example: '2026-01-01T00:00:00.000Z' })
  assignedAt!: Date;

  @ApiProperty({ enum: CommonStatus, example: CommonStatus.PENDING })
  status!: CommonStatus;

  @ApiProperty({ example: '2026-01-01T00:00:00.000Z' })
  createdAt!: Date;

  @ApiProperty({ example: '2026-01-01T00:00:00.000Z' })
  updatedAt!: Date;

  @ApiPropertyOptional({ example: null })
  deletedAt?: Date | null;
}
