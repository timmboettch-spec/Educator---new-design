import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SimulationGradingRubricItem } from '../entities/simulation-grading-rubric-item.entity';

export class SimulationGradingRubricItemResponseDto implements SimulationGradingRubricItem {
  @ApiProperty({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' })
  rubricId!: string;

  @ApiProperty({ example: 'assessment_ea_1775638894969' })
  id!: string;

  @ApiProperty({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' })
  simulationId!: string;

  @ApiProperty({ example: 'Verbalizes chest pain assessment' })
  name!: string;

  @ApiPropertyOptional({ example: 'Communication' })
  categoryType?: string;

  @ApiProperty({ example: 'rubric_actions' })
  subCategory!: string;

  @ApiPropertyOptional({ example: 10 })
  weight?: number;

  @ApiPropertyOptional({ example: 'Graded', enum: ['Graded', 'Binary'] })
  scoringModel?: string;

  @ApiProperty({ example: true })
  required!: boolean;

  @ApiPropertyOptional({ example: 'AI', enum: ['AI', 'System Check'] })
  evaluationSource?: string;

  @ApiPropertyOptional({ example: 'Learner verbalizes findings to preceptor.' })
  description?: string;

  @ApiPropertyOptional({ example: [{ id: 'chk-1', text: 'Checks pulse', status: 'incomplete' }] })
  checklistItems?: object;

  @ApiPropertyOptional({
    example: { aiCheckId: 'assessment_action', aiDescription: 'Evaluate action completion', aiPromptParameter: '' },
  })
  aiMapping?: { aiCheckId?: string; aiDescription?: string; aiPromptParameter?: string };

  @ApiPropertyOptional({
    example: [
      { id: 'comm-crit-1', title: 'Demonstrate empathy', prompt: 'Evaluate empathy', enabled: true, order: 1 },
    ],
  })
  communicationCriteria?: Array<{
    id: string;
    title: string;
    prompt: string;
    enabled?: boolean;
    order?: number;
  }>;

  @ApiPropertyOptional({ example: 'objective_ankle_assessment' })
  learningObjectiveId?: string;

  @ApiPropertyOptional({ example: [] })
  patientDataFields?: object;

  @ApiPropertyOptional({ example: [] })
  vitalsFields?: object;

  @ApiPropertyOptional({ example: { labs: [], imaging: [], physicalExam: [], medications: [] } })
  expectedActions?: object;

  @ApiPropertyOptional({ example: [] })
  medications?: object;

  @ApiPropertyOptional({ example: 'Summarize the communication exchange with the patient.' })
  communicationSummaryPrompt?: string;

  @ApiPropertyOptional({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' })
  createdBy?: string;

  @ApiPropertyOptional({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' })
  updatedBy?: string;

  @ApiProperty({ example: '2026-01-01T00:00:00.000Z' })
  createdAt!: Date;

  @ApiProperty({ example: '2026-01-01T00:00:00.000Z' })
  updatedAt!: Date;
}
