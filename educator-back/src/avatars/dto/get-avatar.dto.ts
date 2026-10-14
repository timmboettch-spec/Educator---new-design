import { PickType } from '@nestjs/swagger';
import { AvatarResponseDto } from 'src/database/response-dto';
import { ApiResponseDto } from 'src/common/dtos/api-response.dto';

export class GetAvatarResDto extends PickType(AvatarResponseDto, [
  'avatarUuid',
  'avatarId',
  'displayName',
  'appearance',
  'unrealMap',
  'assetPath',
  'status',
] as const) {}

export class GetAvatarResponseDto extends ApiResponseDto(GetAvatarResDto) {}
