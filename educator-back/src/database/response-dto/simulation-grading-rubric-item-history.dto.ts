import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SimulationGradingRubricItemHistory } from '../entities/simulation-grading-rubric-item-history.entity';

export class SimulationGradingRubricItemHistoryResponseDto
  implements SimulationGradingRubricItemHistory
{
  @ApiProperty({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' })
  historyId!: string;

  @ApiProperty({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' })
  rubricItemId!: string;

  @ApiProperty({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' })
  simulationId!: string;

  @ApiProperty({ example: { id: 'assessment_ea_1775638894969', weight: 10 } })
  snapshot!: object;

  @ApiProperty({ example: 'UPDATE', enum: ['UPDATE', 'DELETE'] })
  operation!: string;

  @ApiPropertyOptional({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' })
  changedBy?: string;

  @ApiProperty({ example: '2026-01-01T00:00:00.000Z' })
  changedAt!: Date;
}
