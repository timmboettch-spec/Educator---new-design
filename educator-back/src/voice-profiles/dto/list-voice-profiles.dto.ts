import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { VALIDATION_MSG } from 'src/common/messages/validation.message';
import { VoiceProfileConstants, VoiceProfileListStatus } from 'src/common/constants';
import { VoiceProfileDto, VoiceProfileListResponseDto } from './voice-profile.dto';

/**
 * `gender`/`age`/`ethnicity`/`emotion` are catalog filters only — an
 * exact, case-insensitive match on the stored tag (age is an exact number
 * match). They don't affect `resolveForScenario`'s auto-selection.
 */
export class ListVoiceProfilesReqDto {
  /** Omitted means `active` only. */
  @IsOptional()
  @IsEnum(VoiceProfileListStatus, { message: VALIDATION_MSG.IS_ENUM('status') })
  @ApiPropertyOptional({ example: VoiceProfileListStatus.ACTIVE, enum: VoiceProfileListStatus })
  status?: VoiceProfileListStatus;

  @IsOptional()
  @IsString({ message: VALIDATION_MSG.IS_STRING('gender') })
  @MaxLength(VoiceProfileConstants.VALIDATION.TAG_MAX_LENGTH, {
    message: VALIDATION_MSG.MAX_LENGTH('gender', VoiceProfileConstants.VALIDATION.TAG_MAX_LENGTH),
  })
  @ApiPropertyOptional({ example: 'female' })
  gender?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: VALIDATION_MSG.IS_INT('age') })
  @Min(VoiceProfileConstants.VALIDATION.AGE_MIN, {
    message: VALIDATION_MSG.MIN_VALUE('age', VoiceProfileConstants.VALIDATION.AGE_MIN),
  })
  @Max(VoiceProfileConstants.VALIDATION.AGE_MAX, {
    message: VALIDATION_MSG.MAX_VALUE('age', VoiceProfileConstants.VALIDATION.AGE_MAX),
  })
  @ApiPropertyOptional({ example: 34 })
  age?: number;

  @IsOptional()
  @IsString({ message: VALIDATION_MSG.IS_STRING('ethnicity') })
  @MaxLength(VoiceProfileConstants.VALIDATION.TAG_MAX_LENGTH, {
    message: VALIDATION_MSG.MAX_LENGTH(
      'ethnicity',
      VoiceProfileConstants.VALIDATION.TAG_MAX_LENGTH,
    ),
  })
  @ApiPropertyOptional({ example: 'Not Hispanic or Latino' })
  ethnicity?: string;

  @IsOptional()
  @IsString({ message: VALIDATION_MSG.IS_STRING('emotion') })
  @MaxLength(VoiceProfileConstants.VALIDATION.TAG_MAX_LENGTH, {
    message: VALIDATION_MSG.MAX_LENGTH('emotion', VoiceProfileConstants.VALIDATION.TAG_MAX_LENGTH),
  })
  @ApiPropertyOptional({ example: 'calm' })
  emotion?: string;
}

export { VoiceProfileDto, VoiceProfileListResponseDto };
