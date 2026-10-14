import { ApiPropertyOptional, PickType } from '@nestjs/swagger';
import { IsOptional } from 'class-validator';
import { ClassSimulationResponseDto } from 'src/database/response-dto';
import { VALIDATION_MSG } from 'src/common/messages/validation.message';
import { ApiResponseDto } from 'src/common/dtos/api-response.dto';
import { IsClassSimulationDate } from 'src/common/validators/is-class-simulation-date.validator';

export class UpdateClassSimulationReqDto {
  @IsOptional()
  @IsClassSimulationDate({ message: VALIDATION_MSG.INVALID('startDate') })
  @ApiPropertyOptional({ example: '2026-01-01' })
  startDate?: string;

  @IsOptional()
  @IsClassSimulationDate({ message: VALIDATION_MSG.INVALID('dueDate') })
  @ApiPropertyOptional({ example: '2026-01-15' })
  dueDate?: string;

  @IsOptional()
  @IsClassSimulationDate({ message: VALIDATION_MSG.INVALID('endDate') })
  @ApiPropertyOptional({ example: '2026-01-31' })
  endDate?: string;
}

export class UpdateClassSimulationResDto extends PickType(ClassSimulationResponseDto, [
  'id',
  'classId',
  'simulationId',
  'startDate',
  'dueDate',
  'endDate',
] as const) {}

export class UpdateClassSimulationResponseDto extends ApiResponseDto(
  UpdateClassSimulationResDto,
  'Class simulation updated successfully',
) {}
