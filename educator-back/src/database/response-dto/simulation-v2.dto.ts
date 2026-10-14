import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SimulationV2 } from '../entities/simulation-v2.entity';
import type { ActionCategory, ISimulationPhase, ISimulationGrading } from 'src/common/interfaces';

export class SimulationV2ResponseDto implements SimulationV2 {
  @ApiProperty({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' })
  simulationId!: string;

  @ApiProperty({ example: 'AIT_001' })
  id!: string;

  @ApiPropertyOptional({ example: 'cardiac-care' })
  unitId?: string | null;

  @ApiProperty({ example: 'Chest Pain Assessment' })
  title!: string;

  @ApiPropertyOptional({ example: 'Intermediate' })
  difficulty?: string;

  @ApiPropertyOptional({ example: 'Emergency Medicine' })
  department?: string;

  @ApiPropertyOptional({ example: 'Nursing' })
  class?: string;

  @ApiPropertyOptional({ example: 'Novice' })
  learnerLevel?: string;

  @ApiPropertyOptional({ example: 'A 58-year-old patient presents with chest pain.' })
  description?: string;

  @ApiPropertyOptional({ example: 'Assess and manage acute chest pain.' })
  learningObjective?: string;

  @ApiPropertyOptional({ example: 'Recognize early signs of cardiac distress.' })
  learningObjectiveCard?: string;

  @ApiPropertyOptional({ example: 'published' })
  status?: string;

  @ApiPropertyOptional({ example: 'AIT_000' })
  parentScenarioId?: string | null;

  @ApiPropertyOptional({ example: 3 })
  versionNumber?: number;

  @ApiPropertyOptional({ example: true })
  avatarEnabled?: boolean;

  @ApiPropertyOptional({ example: 'avatar-female-01' })
  avatarId?: string | null;

  @ApiPropertyOptional({ example: 'ctx-chest-pain' })
  contextId?: string;

  @ApiPropertyOptional({ example: 'en-US' })
  language?: string;

  @ApiPropertyOptional({ example: 'female-1' })
  voice?: string;

  @ApiPropertyOptional({ example: '5b0f8a3c-2d4e-4a7b-9c1d-3e6f7a8b9c0d', nullable: true })
  voiceProfileId?: string | null;

  @ApiPropertyOptional({ example: 'Cardiac Assessment' })
  actionGroupName?: string;

  @ApiPropertyOptional({ example: 'Actions available while assessing a cardiac patient.' })
  actionGroupDescription?: string;

  @ApiPropertyOptional({ example: false })
  requiresProductSetup?: boolean;

  @ApiPropertyOptional({ example: 'https://cdn.example.com/scenarios/AIT_001.png' })
  scenarioImage?: string;

  @ApiPropertyOptional({ example: 'standard' })
  patientChartMode?: string;

  @ApiPropertyOptional({ example: true })
  enableStudentBriefing?: boolean;

  @ApiPropertyOptional({ example: '08:00' })
  simulationStartTime?: string;

  @ApiPropertyOptional({ example: '30 minutes' })
  estimatedDuration?: string;

  @ApiPropertyOptional({ example: 'Stethoscope, blood pressure cuff' })
  additionalEquipment?: string;

  @ApiPropertyOptional({ example: 'ECG monitor' })
  optionalEquipment?: string;

  @ApiPropertyOptional({ example: 'Ensure manikin is set to tachycardic rhythm before start.' })
  setupNotes?: string;

  @ApiPropertyOptional({ example: 'Chest pain, cardiac assessment' })
  topicsAddressed?: string;

  @ApiPropertyOptional({ example: 'https://cdn.example.com/pdfs/prebrief-script.pdf' })
  prebriefScriptPdf?: string;

  @ApiPropertyOptional({ example: 'https://cdn.example.com/pdfs/debrief-points.pdf' })
  debriefPointsPdf?: string;

  @ApiPropertyOptional({ example: 'https://cdn.example.com/pdfs/setup-notes.pdf' })
  setupNotesPdf?: string;

  @ApiPropertyOptional({ example: 'https://cdn.example.com/pdfs/facilitation-notes.pdf' })
  facilitationNotesPdf?: string;

  @ApiPropertyOptional({ example: 'https://cdn.example.com/pdfs/printable-sbar.pdf' })
  printableSbarPdf?: string;

  @ApiPropertyOptional({ example: 'https://cdn.example.com/pdfs/printable-patient-chart.pdf' })
  printablePatientChartPdf?: string;

  @ApiPropertyOptional({ example: 'strict' })
  sequenceGroupsOrderMode?: string;

  @ApiPropertyOptional({ example: {} })
  conversationResponses?: object;

  @ApiPropertyOptional({ example: {} })
  patientData?: object;

  @ApiPropertyOptional({ example: {} })
  aiPatientData?: object;

  @ApiPropertyOptional({ example: {} })
  expectedActions?: object;

  @ApiPropertyOptional({ example: [{ id: 'cat_assessments', name: 'ASSESSMENTS' }] })
  actionCategories?: ActionCategory[];

  @ApiPropertyOptional({ example: [] })
  phases?: ISimulationPhase[];

  @ApiPropertyOptional({ example: [] })
  availableMedications?: object;

  @ApiPropertyOptional({ example: {} })
  studentBriefing?: object;

  @ApiPropertyOptional({ example: {} })
  sbar?: object;

  @ApiPropertyOptional({ example: {} })
  grading?: ISimulationGrading;

  @ApiPropertyOptional({ example: {} })
  metadata?: object;

  @ApiPropertyOptional({ example: { title: 'Product Setup' } })
  productSetup?: object;

  @ApiPropertyOptional({ example: {} })
  orthopedicWorksheet?: object;

  @ApiPropertyOptional({ example: {} })
  timeline?: object;

  @ApiPropertyOptional({ example: [] })
  sequences?: object;

  @ApiPropertyOptional({ example: [] })
  sequenceGroups?: object;

  @ApiPropertyOptional({ example: {} })
  teamCommunication?: object;

  @ApiProperty({ example: '2026-01-01T00:00:00.000Z' })
  createdAt!: Date;

  @ApiProperty({ example: '2026-01-01T00:00:00.000Z' })
  updatedAt!: Date;

  @ApiPropertyOptional({ example: null })
  deletedAt?: Date | null;
}
