import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { VALIDATION_MSG } from 'src/common/messages/validation.message';
import { VoiceProfileConstants } from 'src/common/constants';
import { VoiceProfileDto, VoiceProfileResponseEnvelopeDto } from './voice-profile.dto';

/**
 * Multipart body for `POST /voice-profiles`. The file itself arrives via
 * `@UploadedFile()`, not on this DTO — this only validates the extra fields
 * (`forbidNonWhitelisted` rejects any multipart field this class doesn't
 * declare). `gender`/`age`/`ethnicity`/`emotion` are catalog metadata
 * only — they don't drive `resolveForScenario`'s auto-selection, which still
 * keys off `defaultForGender` alone.
 */
export class CreateVoiceProfileReqDto {
  @IsString({ message: VALIDATION_MSG.IS_STRING('displayName') })
  @MinLength(VoiceProfileConstants.VALIDATION.DISPLAY_NAME_MIN_LENGTH, {
    message: VALIDATION_MSG.MIN_LENGTH(
      'displayName',
      VoiceProfileConstants.VALIDATION.DISPLAY_NAME_MIN_LENGTH,
    ),
  })
  @MaxLength(VoiceProfileConstants.VALIDATION.DISPLAY_NAME_MAX_LENGTH, {
    message: VALIDATION_MSG.MAX_LENGTH(
      'displayName',
      VoiceProfileConstants.VALIDATION.DISPLAY_NAME_MAX_LENGTH,
    ),
  })
  @ApiProperty({ example: 'Stock Female 1' })
  displayName!: string;

  @IsOptional()
  @IsString({ message: VALIDATION_MSG.IS_STRING('gender') })
  @MaxLength(VoiceProfileConstants.VALIDATION.TAG_MAX_LENGTH, {
    message: VALIDATION_MSG.MAX_LENGTH('gender', VoiceProfileConstants.VALIDATION.TAG_MAX_LENGTH),
  })
  @ApiPropertyOptional({ example: 'female' })
  gender?: string;

  /** Multipart fields arrive as strings; `@Type` coerces before `@IsInt` runs. */
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

export class CreateVoiceProfileResponseDto extends VoiceProfileResponseEnvelopeDto {}
export { VoiceProfileDto as CreateVoiceProfileResDto };
