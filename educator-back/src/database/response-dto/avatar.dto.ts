import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Avatar } from '../entities/avatar.entity';
import { AvatarStatus } from 'src/common/constants';

export class AvatarResponseDto implements Avatar {
  @ApiProperty({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' })
  avatarUuid!: string;

  @ApiProperty({ example: 'avatar-10' })
  avatarId!: string;

  @ApiProperty({ example: 'avatar-10 — appearance not yet seen' })
  displayName!: string;

  @ApiPropertyOptional({ example: 'Black, braided hair' })
  appearance?: string | null;

  @ApiPropertyOptional({ example: '/Game/Maps/Production/L_AVT_10' })
  unrealMap?: string | null;

  @ApiPropertyOptional({ example: 'packages/avatars/10/v4' })
  assetPath?: string | null;

  @ApiProperty({ example: AvatarStatus.READY, enum: AvatarStatus })
  status!: AvatarStatus;

  @ApiPropertyOptional({ example: null })
  voiceProfileId?: string | null;

  @ApiProperty({ example: 'Standard_NV36ads_A10_v5' })
  gpuSku!: string;

  @ApiProperty({ example: 1 })
  minReplicas!: number;

  @ApiProperty({ example: 10 })
  maxReplicas!: number;

  @ApiProperty({ example: true })
  scaleToZero!: boolean;

  @ApiProperty({ example: 2 })
  pixelStreamingVersion!: number;

  @ApiProperty({ example: '2026-09-23T10:00:00.000Z' })
  createdAt!: Date;

  @ApiProperty({ example: '2026-09-23T10:00:00.000Z' })
  updatedAt!: Date;

  @ApiPropertyOptional({ example: null })
  deletedAt?: Date | null;
}
