import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { VoiceProfile } from '../entities/voice-profile.entity';
import { VoiceProfileGender, VoiceProfileStatus } from 'src/common/constants';

export class VoiceProfileResponseDto implements VoiceProfile {
  @ApiProperty({ example: '5b0f8a3c-2d4e-4a7b-9c1d-3e6f7a8b9c0d' })
  voiceProfileId!: string;

  @ApiProperty({ example: 'Stock Female 1' })
  displayName!: string;

  @ApiProperty({ example: VoiceProfileStatus.ACTIVE, enum: VoiceProfileStatus })
  status!: VoiceProfileStatus;

  @ApiProperty({ example: 'voices/5b0f8a3c-2d4e-4a7b-9c1d-3e6f7a8b9c0d/voice.wav' })
  blobPath!: string;

  @ApiProperty({ example: 9800 })
  durationMs!: number;

  @ApiPropertyOptional({ example: 'female', nullable: true })
  gender?: string | null;

  @ApiPropertyOptional({ example: 34, nullable: true })
  age?: number | null;

  @ApiPropertyOptional({ example: 'Not Hispanic or Latino', nullable: true })
  ethnicity?: string | null;

  @ApiPropertyOptional({ example: 'calm', nullable: true })
  emotion?: string | null;

  @ApiPropertyOptional({
    example: VoiceProfileGender.FEMALE,
    enum: VoiceProfileGender,
    nullable: true,
  })
  defaultForGender?: VoiceProfileGender | null;

  @ApiPropertyOptional({ example: '550e8400-e29b-41d4-a716-446655440001', nullable: true })
  createdBy?: string | null;

  @ApiPropertyOptional({ example: '550e8400-e29b-41d4-a716-446655440001', nullable: true })
  updatedBy?: string | null;

  @ApiPropertyOptional({ example: null, nullable: true })
  retiredAt?: Date | null;

  @ApiProperty({ example: '2026-09-30T10:00:00.000Z' })
  createdAt!: Date;

  @ApiProperty({ example: '2026-09-30T10:00:00.000Z' })
  updatedAt!: Date;

  @ApiPropertyOptional({ example: null, nullable: true })
  deletedAt?: Date | null;
}
