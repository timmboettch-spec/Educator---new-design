import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ClassSimulationResponseDto {
  @ApiProperty({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' })
  id!: string;

  @ApiProperty({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' })
  classId!: string;

  @ApiProperty({ example: 'sim-001' })
  simulationId!: string;

  @ApiPropertyOptional({ example: '2026-01-01' })
  startDate?: string;

  @ApiPropertyOptional({ example: '2026-01-15' })
  dueDate?: string;

  @ApiPropertyOptional({ example: '2026-01-31' })
  endDate?: string;

  @ApiProperty({ example: true })
  isActive!: boolean;

  @ApiProperty({ example: false })
  isAi!: boolean;

  @ApiProperty({ example: '2026-01-01T00:00:00.000Z' })
  createdAt!: Date;

  @ApiProperty({ example: '2026-01-02T00:00:00.000Z' })
  updatedAt!: Date;
}
