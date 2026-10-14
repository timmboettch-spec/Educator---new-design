import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { VALIDATION_MSG } from 'src/common/messages/validation.message';
import { VoiceProfileConstants, VoiceProfileGender } from 'src/common/constants';
import { VoiceProfileDto, VoiceProfileResponseEnvelopeDto } from './voice-profile.dto';

/** `null` on any of the optional tags below clears it; omitted leaves it unchanged. */
export class UpdateVoiceProfileReqDto {
  @IsOptional()
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
  @ApiPropertyOptional({ example: 'Stock Female 1 (updated)' })
  displayName?: string;

  @IsOptional()
  @ValidateIf((dto: UpdateVoiceProfileReqDto) => dto.gender !== null)
  @IsString({ message: VALIDATION_MSG.IS_STRING('gender') })
  @MaxLength(VoiceProfileConstants.VALIDATION.TAG_MAX_LENGTH, {
    message: VALIDATION_MSG.MAX_LENGTH('gender', VoiceProfileConstants.VALIDATION.TAG_MAX_LENGTH),
  })
  @ApiPropertyOptional({ example: 'female', nullable: true })
  gender?: string | null;

  @IsOptional()
  @ValidateIf((dto: UpdateVoiceProfileReqDto) => dto.age !== null)
  @Type(() => Number)
  @IsInt({ message: VALIDATION_MSG.IS_INT('age') })
  @Min(VoiceProfileConstants.VALIDATION.AGE_MIN, {
    message: VALIDATION_MSG.MIN_VALUE('age', VoiceProfileConstants.VALIDATION.AGE_MIN),
  })
  @Max(VoiceProfileConstants.VALIDATION.AGE_MAX, {
    message: VALIDATION_MSG.MAX_VALUE('age', VoiceProfileConstants.VALIDATION.AGE_MAX),
  })
  @ApiPropertyOptional({ example: 34, nullable: true })
  age?: number | null;

  @IsOptional()
  @ValidateIf((dto: UpdateVoiceProfileReqDto) => dto.ethnicity !== null)
  @IsString({ message: VALIDATION_MSG.IS_STRING('ethnicity') })
  @MaxLength(VoiceProfileConstants.VALIDATION.TAG_MAX_LENGTH, {
    message: VALIDATION_MSG.MAX_LENGTH(
      'ethnicity',
      VoiceProfileConstants.VALIDATION.TAG_MAX_LENGTH,
    ),
  })
  @ApiPropertyOptional({ example: 'Not Hispanic or Latino', nullable: true })
  ethnicity?: string | null;

  @IsOptional()
  @ValidateIf((dto: UpdateVoiceProfileReqDto) => dto.emotion !== null)
  @IsString({ message: VALIDATION_MSG.IS_STRING('emotion') })
  @MaxLength(VoiceProfileConstants.VALIDATION.TAG_MAX_LENGTH, {
    message: VALIDATION_MSG.MAX_LENGTH('emotion', VoiceProfileConstants.VALIDATION.TAG_MAX_LENGTH),
  })
  @ApiPropertyOptional({ example: 'calm', nullable: true })
  emotion?: string | null;

  /** `null` clears the gender default; omitted leaves it unchanged. */
  @IsOptional()
  @ValidateIf((dto: UpdateVoiceProfileReqDto) => dto.defaultForGender !== null)
  @IsEnum(VoiceProfileGender, { message: VALIDATION_MSG.IS_ENUM('defaultForGender') })
  @ApiPropertyOptional({
    example: VoiceProfileGender.FEMALE,
    enum: VoiceProfileGender,
    nullable: true,
  })
  defaultForGender?: VoiceProfileGender | null;
}

export class UpdateVoiceProfileResponseDto extends VoiceProfileResponseEnvelopeDto {}
export { VoiceProfileDto as UpdateVoiceProfileResDto };
