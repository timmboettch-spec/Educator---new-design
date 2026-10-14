import { ApiPropertyOptional, PickType } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { PaginationDto } from 'src/common/dtos/pagination.dto';
import { ApiPaginatedResponseDto } from 'src/common/dtos/api-response.dto';
import { VALIDATION_MSG } from 'src/common/messages/validation.message';
import { AvatarResponseDto } from 'src/database/response-dto';
import { AvatarStatus } from 'src/common/constants';

export class ListAvatarsReqDto extends PaginationDto {
  /**
   * Omitted means `ready` only — the picker must never offer an avatar that
   * cannot be served.
   */
  @IsOptional()
  @IsEnum(AvatarStatus, { message: VALIDATION_MSG.IS_ENUM('status') })
  @ApiPropertyOptional({ example: AvatarStatus.READY, enum: AvatarStatus })
  status?: AvatarStatus;
}

export class AvatarListItemResDto extends PickType(AvatarResponseDto, [
  'avatarUuid',
  'avatarId',
  'displayName',
  'appearance',
  'unrealMap',
  'status',
] as const) {}

export class ListAvatarsResponseDto extends ApiPaginatedResponseDto(AvatarListItemResDto) {}
