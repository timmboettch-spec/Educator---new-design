import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DistrictAdmin } from '../entities/district-admin.entity';

export class DistrictAdminResponseDto implements DistrictAdmin {
  @ApiProperty({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' })
  districtAdminId!: string;

  @ApiProperty({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' })
  userRoleId!: string;

  @ApiPropertyOptional({ example: 'Ava Thompson' })
  fullName?: string;

  @ApiPropertyOptional({ example: true })
  isLicenseActive?: boolean;

  @ApiPropertyOptional({ example: [] })
  subscriptions?: object[];

  @ApiPropertyOptional({ example: 'https://cdn.example.com/avatars/ava-thompson.png' })
  profilePicture?: string | null;

  @ApiProperty({ example: '2026-01-01T00:00:00.000Z' })
  createdAt!: Date;

  @ApiProperty({ example: '2026-01-01T00:00:00.000Z' })
  updatedAt!: Date;

  @ApiPropertyOptional({ example: null })
  deletedAt?: Date | null;
}
