import { ApiProperty, ApiPropertyOptional, PickType } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { AvatarResponseDto } from 'src/database/response-dto';
import { VALIDATION_MSG } from 'src/common/messages/validation.message';
import { ApiResponseDto } from 'src/common/dtos/api-response.dto';
import { AvatarConstants, AvatarStatus } from 'src/common/constants';

export class CreateAvatarReqDto {
  @IsString({ message: VALIDATION_MSG.IS_STRING('avatarId') })
  @MaxLength(AvatarConstants.VALIDATION.AVATAR_ID_MAX_LENGTH, {
    message: VALIDATION_MSG.MAX_LENGTH('avatarId', AvatarConstants.VALIDATION.AVATAR_ID_MAX_LENGTH),
  })
  @Matches(AvatarConstants.VALIDATION.AVATAR_ID_PATTERN, {
    message: VALIDATION_MSG.INVALID('avatarId'),
  })
  @ApiProperty({ example: 'avatar-10' })
  avatarId!: string;

  @IsString({ message: VALIDATION_MSG.IS_STRING('displayName') })
  @MaxLength(AvatarConstants.VALIDATION.DISPLAY_NAME_MAX_LENGTH, {
    message: VALIDATION_MSG.MAX_LENGTH('displayName', AvatarConstants.VALIDATION.DISPLAY_NAME_MAX_LENGTH),
  })
  @ApiProperty({ example: 'avatar-10 — appearance not yet seen' })
  displayName!: string;

  @IsOptional()
  @IsString({ message: VALIDATION_MSG.IS_STRING('appearance') })
  @MaxLength(AvatarConstants.VALIDATION.APPEARANCE_MAX_LENGTH, {
    message: VALIDATION_MSG.MAX_LENGTH('appearance', AvatarConstants.VALIDATION.APPEARANCE_MAX_LENGTH),
  })
  @ApiPropertyOptional({ example: 'Black, braided hair' })
  appearance?: string;

  @IsOptional()
  @IsString({ message: VALIDATION_MSG.IS_STRING('unrealMap') })
  @MaxLength(AvatarConstants.VALIDATION.UNREAL_MAP_MAX_LENGTH, {
    message: VALIDATION_MSG.MAX_LENGTH('unrealMap', AvatarConstants.VALIDATION.UNREAL_MAP_MAX_LENGTH),
  })
  @Matches(AvatarConstants.VALIDATION.UNREAL_MAP_PATTERN, {
    message: VALIDATION_MSG.INVALID('unrealMap'),
  })
  @ApiPropertyOptional({ example: '/Game/Maps/Production/L_AVT_10' })
  unrealMap?: string;

  @IsOptional()
  @IsString({ message: VALIDATION_MSG.IS_STRING('assetPath') })
  @MaxLength(AvatarConstants.VALIDATION.ASSET_PATH_MAX_LENGTH, {
    message: VALIDATION_MSG.MAX_LENGTH('assetPath', AvatarConstants.VALIDATION.ASSET_PATH_MAX_LENGTH),
  })
  @ApiPropertyOptional({ example: 'packages/avatars/10/v4' })
  assetPath?: string;

  @IsOptional()
  @IsEnum(AvatarStatus, { message: VALIDATION_MSG.IS_ENUM('status') })
  @ApiPropertyOptional({ example: AvatarStatus.SYNCING, enum: AvatarStatus })
  status?: AvatarStatus;
}

export class CreateAvatarResDto extends PickType(AvatarResponseDto, [
  'avatarUuid',
  'avatarId',
  'displayName',
  'appearance',
  'unrealMap',
  'assetPath',
  'status',
] as const) {}

export class CreateAvatarResponseDto extends ApiResponseDto(CreateAvatarResDto) {}
