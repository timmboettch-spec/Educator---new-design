import { ApiProperty, PickType } from '@nestjs/swagger';
import { ApiListResponseDto, ApiResponseDto } from 'src/common/dtos/api-response.dto';
import { VoiceProfileResponseDto } from 'src/database/response-dto';

/**
 * `VoiceProfileDto` (C2, `fixtures/voice-profile-dto.json`) — the shape every
 * voice-profiles endpoint returns (list, create, replace audio, rename/patch).
 * `usageCount` is a computed field, not on the entity.
 */
export class VoiceProfileDto extends PickType(VoiceProfileResponseDto, [
  'voiceProfileId',
  'displayName',
  'status',
  'gender',
  'age',
  'ethnicity',
  'emotion',
  'defaultForGender',
  'durationMs',
  'createdAt',
  'updatedAt',
] as const) {
  /** Non-deleted scenarios (drafts included) currently pointing at this profile. */
  @ApiProperty({ example: 3 })
  usageCount!: number;
}

export class VoiceProfileResponseEnvelopeDto extends ApiResponseDto(VoiceProfileDto) {}
export class VoiceProfileListResponseDto extends ApiListResponseDto(VoiceProfileDto) {}
