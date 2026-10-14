import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SimulationAction } from '../entities/simulation-action.entity';

export class SimulationActionResponseDto implements SimulationAction {
  @ApiProperty({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' })
  actionId!: string;

  @ApiProperty({ example: 'assessment_ea_1775638894969' })
  id!: string;

  @ApiProperty({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' })
  simulationId!: string;

  @ApiProperty({ example: 1 })
  order!: number;

  @ApiProperty({ example: 'Check blood pressure' })
  title!: string;

  @ApiProperty({ example: 'single', enum: ['single', 'ordering', 'vital', 'question'] })
  type!: string;

  @ApiPropertyOptional({ example: 'Mandatory', enum: ['Mandatory', 'Optional', 'Distractor'] })
  typeRequirement?: string;

  @ApiProperty({ example: false })
  isDistractor!: boolean;

  @ApiProperty({ example: false })
  isExcluded!: boolean;

  @ApiProperty({ example: false })
  isOptional!: boolean;

  @ApiPropertyOptional({ example: 3 })
  maxAttempts?: number;

  @ApiPropertyOptional({ example: 'What are the properties to apply after the fall?' })
  prompt?: string;

  @ApiPropertyOptional({ example: ['Correct', 'Incorrect'] })
  items?: string[];

  @ApiPropertyOptional({
    example: [{ id: 'concept_1779794061047_x3jrz', description: 'Assesses skin condition', type: 'Mandatory' }],
  })
  concepts?: Array<{ id: string; description: string; type: string }>;

  @ApiPropertyOptional({ example: 'Correct' })
  correct?: string | string[];

  @ApiPropertyOptional({ example: 'cat_labs' })
  categoryId?: string;

  @ApiPropertyOptional({ example: { heartRate: ['76 bpm'] } })
  vitals?: Record<string, string[] | boolean | undefined>;

  @ApiPropertyOptional({ example: { heartRate: 'Mandatory' } })
  vitalRequirements?: Record<string, 'Mandatory' | 'Optional'>;

  @ApiPropertyOptional({ example: { heartRate: ['Mandatory'] } })
  vitalRequirementEntries?: Record<string, Array<'Mandatory' | 'Optional'>>;

  @ApiPropertyOptional({ example: 'text', enum: ['text', 'image', 'pdf', 'mixed'] })
  resultMediaType?: string;

  @ApiPropertyOptional({ example: 'Result' })
  resultName?: string;

  @ApiPropertyOptional({ example: 'Great job identifying the correct intervention.' })
  resultContent?: string;

  @ApiPropertyOptional({ example: 'https://cdn.example.com/results/result.png' })
  resultMediaUrl?: string;

  @ApiPropertyOptional({ example: 'result.png' })
  resultMediaName?: string;

  @ApiPropertyOptional({ example: 'limited', enum: ['unlimited', 'limited'] })
  limitType?: string;

  @ApiPropertyOptional({ example: 'Assess ankle injuries and identify possible ligament tears' })
  description?: string;

  @ApiPropertyOptional({ example: 'Apply ice, provide compression, and immobilize the ankle' })
  idealResponse?: string;

  @ApiPropertyOptional({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' })
  createdBy?: string;

  @ApiPropertyOptional({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' })
  updatedBy?: string;

  @ApiProperty({ example: '2026-01-01T00:00:00.000Z' })
  createdAt!: Date;

  @ApiProperty({ example: '2026-01-01T00:00:00.000Z' })
  updatedAt!: Date;

  @ApiPropertyOptional({ example: null })
  deletedAt?: Date | null;
}
