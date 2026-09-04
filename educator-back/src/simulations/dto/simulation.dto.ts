import { IsNotEmpty, IsString, IsOptional } from 'class-validator';

export class ImportSimulationDto {
  @IsNotEmpty()
  @IsString()
  id!: string;

  @IsNotEmpty()
  @IsString()
  unitId!: string;

  @IsNotEmpty()
  @IsString()
  title!: string;

  @IsOptional()
  @IsString()
  difficulty?: string;

  @IsOptional()
  @IsString()
  avatarId?: string;

  @IsOptional()
  @IsString()
  contextId?: string;

  @IsOptional()
  @IsString()
  learnerLevel?: string;

  @IsOptional()
  @IsString()
  department?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  learningObjective?: string;

  @IsOptional()
  @IsString()
  class?: string;

  @IsOptional()
  disabled?: boolean;

  @IsOptional()
  actions?: object[];

  @IsOptional()
  patientData?: object;

  @IsOptional()
  expectedActions?: object;

  @IsOptional()
  historyPrompts?: object[];

  @IsOptional()
  assessmentGuidance?: object;

  @IsOptional()
  @IsString()
  assessmentNarrativeExpected?: string;

  @IsOptional()
  @IsString()
  learningObjectiveCard?: string;

  @IsOptional()
  phases?: object[];

  @IsOptional()
  availableMedications?: object[];

  @IsOptional()
  grading?: object;

  @IsOptional()
  requiresProductSetup?: boolean;

  @IsOptional()
  productSetup?: object;

  @IsOptional()
  aiPatientData?: object;

  @IsOptional()
  @IsString()
  preBriefPdf?: string;

  @IsOptional()
  enableStudentBriefing?: boolean;

  @IsOptional()
  studentBriefing?: object;

  @IsOptional()
  sbar?: object;

  @IsOptional()
  orders?: object[];

  @IsOptional()
  actionCategories?: object[];

  @IsOptional()
  @IsString()
  language?: string;

  @IsOptional()
  @IsString()
  voice?: string;

  @IsOptional()
  @IsString()
  ethnicity?: string;

  @IsOptional()
  @IsString()
  age?: string;

  @IsOptional()
  @IsString()
  actionGroupName?: string;

  @IsOptional()
  @IsString()
  actionGroupDescription?: string;

  @IsOptional()
  timeline?: object;
}
