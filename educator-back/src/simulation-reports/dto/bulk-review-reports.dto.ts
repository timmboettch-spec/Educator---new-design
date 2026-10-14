import { ApiProperty } from '@nestjs/swagger';
import { ArrayNotEmpty, IsArray, IsBoolean, IsEnum, IsString } from 'class-validator';
import { ApiResponseDto } from 'src/common/dtos/api-response.dto';
import { SimulationReportSelectorType } from 'src/common/constants/simulation-report.constants';
import { VALIDATION_MSG } from 'src/common/messages/validation.message';

export class BulkReviewReportsReqDto {
  @IsEnum(SimulationReportSelectorType, { message: VALIDATION_MSG.IS_ENUM('type') })
  @ApiProperty({
    example: SimulationReportSelectorType.REPORT,
    enum: SimulationReportSelectorType,
  })
  type!: SimulationReportSelectorType;

  @IsArray({ message: VALIDATION_MSG.IS_ARRAY('ids') })
  @ArrayNotEmpty({ message: VALIDATION_MSG.ARRAY_NOT_EMPTY('ids') })
  @IsString({ each: true, message: VALIDATION_MSG.IS_STRING('ids') })
  @ApiProperty({ example: ['3fa85f64-5717-4562-b3fc-2c963f66afa6'], type: [String] })
  ids!: string[];

  @IsBoolean({ message: VALIDATION_MSG.IS_BOOLEAN('reviewed') })
  @ApiProperty({ example: true })
  reviewed!: boolean;
}

export class BulkReviewReportsResDto {
  @ApiProperty({ example: ['3fa85f64-5717-4562-b3fc-2c963f66afa6'], type: [String] })
  updatedIds!: string[];

  @ApiProperty({ example: ['9b2e1a34-1111-4f2a-8b3c-2c963f66afa6'], type: [String] })
  notAccessibleIds!: string[];
}

export class BulkReviewReportsResponseDto extends ApiResponseDto(BulkReviewReportsResDto) {}
