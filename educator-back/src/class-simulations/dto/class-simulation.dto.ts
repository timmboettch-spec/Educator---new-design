import { IsUUID, IsString, IsOptional, IsNotEmpty } from 'class-validator';

export class AssignClassSimulationDto {
  @IsNotEmpty()
  @IsUUID('4')
  class_id!: string;

  @IsNotEmpty()
  @IsString()
  simulation_id!: string;

  @IsOptional()
  start_date?: string;

  @IsOptional()
  due_date?: string;

  @IsOptional()
  end_date?: string;

  @IsOptional()
  reduceToken?: number;
}

export class UpdateClassSimulationDto {
  @IsOptional()
  start_date?: string;

  @IsOptional()
  due_date?: string;

  @IsOptional()
  end_date?: string;
}
