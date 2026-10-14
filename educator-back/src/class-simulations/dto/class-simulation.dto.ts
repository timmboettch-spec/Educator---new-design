import { IsUUID, IsString, IsOptional, IsNotEmpty, Matches } from 'class-validator';

const CLASS_SIMULATION_DATE_FORMAT = /^(?:\d{2}-\d{2}-\d{4}|\d{4}-\d{2}-\d{2}(?:T.*)?)$/;
const DATE_FORMAT_MESSAGE = 'must be a valid date in MM-DD-YYYY or ISO format';

export class AssignClassSimulationDto {
  @IsNotEmpty()
  @IsUUID('4')
  class_id!: string;

  @IsNotEmpty()
  @IsString()
  simulation_id!: string;

  @IsOptional()
  @Matches(CLASS_SIMULATION_DATE_FORMAT, { message: `start_date ${DATE_FORMAT_MESSAGE}` })
  start_date?: string;

  @IsOptional()
  @Matches(CLASS_SIMULATION_DATE_FORMAT, { message: `due_date ${DATE_FORMAT_MESSAGE}` })
  due_date?: string;

  @IsOptional()
  @Matches(CLASS_SIMULATION_DATE_FORMAT, { message: `end_date ${DATE_FORMAT_MESSAGE}` })
  end_date?: string;

  @IsOptional()
  reduceToken?: number;
}
