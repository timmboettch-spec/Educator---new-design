import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SimulationOrder } from '../entities/simulation-order.entity';

export class SimulationOrderResponseDto implements SimulationOrder {
  @ApiProperty({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' })
  orderId!: string;

  @ApiProperty({ example: 'order_1776670905196' })
  id!: string;

  @ApiProperty({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' })
  simulationId!: string;

  @ApiProperty({ example: 'Complete Blood Count' })
  title!: string;

  @ApiProperty({ example: 'Lab' })
  category!: string;

  @ApiProperty({ example: 'STAT' })
  priority!: string;

  @ApiProperty({ example: 'Pending' })
  orderStatus!: string;

  @ApiPropertyOptional({ example: '1' })
  startDay?: string;

  @ApiPropertyOptional({ example: '08:30' })
  dueTime?: string;

  @ApiPropertyOptional({ example: 'T + 15' })
  expirationOffset?: string;

  @ApiPropertyOptional({ example: '2026-01-02' })
  dueDate?: string;

  @ApiPropertyOptional({
    example: { name: 'Aspirin', dosage: '81mg', route: 'PO', gradingConfig: { enabled: true, gradingType: 'Binary' } },
  })
  medicationConfig?: object;

  @ApiPropertyOptional({ example: '' })
  scenarioId?: string;

  @ApiPropertyOptional({ example: 'Visible at start' })
  systemVisibility?: string;

  @ApiPropertyOptional({ example: 'Transport patient carefully and support injured ankle during imaging.' })
  description?: string;

  @ApiPropertyOptional({ example: 'Apply ice pack to the affected ankle for 15–20 minutes every 2–3 hours.' })
  instructions?: string;

  @ApiPropertyOptional({ example: ['action_1775643850912_7oooc7veu'] })
  linkedActionIds?: string[];

  @ApiPropertyOptional({ example: [{ id: 'action_1775643850912_7oooc7veu', title: 'Immediate Management' }] })
  linkedActionsDetail?: Array<{ id: string; title: string }>;

  @ApiPropertyOptional({ example: [] })
  unlockConditions?: object;

  @ApiProperty({ example: '2026-01-01T00:00:00.000Z' })
  createdAt!: Date;

  @ApiProperty({ example: '2026-01-01T00:00:00.000Z' })
  updatedAt!: Date;
}
