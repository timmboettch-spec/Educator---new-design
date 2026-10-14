import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { ApiResponseDto } from 'src/common/dtos/api-response.dto';
import { PreviewConstants } from 'src/common/constants';
import { VALIDATION_MSG } from 'src/common/messages/validation.message';

export class PreviewScenarioReqDto {
  @IsString({ message: VALIDATION_MSG.IS_STRING('scenarioId') })
  @IsNotEmpty({ message: VALIDATION_MSG.IS_NOT_EMPTY('scenarioId') })
  @MaxLength(PreviewConstants.VALIDATION.SCENARIO_ID_MAX_LENGTH, {
    message: VALIDATION_MSG.MAX_LENGTH(
      'scenarioId',
      PreviewConstants.VALIDATION.SCENARIO_ID_MAX_LENGTH,
    ),
  })
  @ApiProperty({ example: 'assessment_ea_1775638894969' })
  scenarioId!: string;
}

export class PreviewAllowanceResDto {
  @ApiProperty({ example: 2 })
  remaining!: number;

  @ApiProperty({ example: PreviewConstants.MAX_ALLOWANCE })
  max!: number;
}

export class GetPreviewAllowanceResponseDto extends ApiResponseDto(
  PreviewAllowanceResDto,
  'Preview allowance fetched successfully.',
) {}

export class UsePreviewResponseDto extends ApiResponseDto(
  PreviewAllowanceResDto,
  'Preview started.',
) {}
