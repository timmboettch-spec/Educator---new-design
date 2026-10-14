import { PartialType, OmitType } from '@nestjs/swagger';
import { ApiResponseDto } from 'src/common/dtos/api-response.dto';
import { CreateAvatarReqDto, CreateAvatarResDto } from './create-avatar.dto';

/**
 * Every field except `avatarId`, which is the business key and never changes —
 * re-publishing an avatar at a new package version updates the row it already
 * has rather than renaming it.
 */
export class UpdateAvatarReqDto extends PartialType(
  OmitType(CreateAvatarReqDto, ['avatarId'] as const),
) {}

export class UpdateAvatarResDto extends CreateAvatarResDto {}

export class UpdateAvatarResponseDto extends ApiResponseDto(UpdateAvatarResDto) {}
