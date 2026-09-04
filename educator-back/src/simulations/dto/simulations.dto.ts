import { IsNotEmpty, IsUUID, Matches, IsOptional, IsString, IsUrl } from 'class-validator';

export class SimulationDto {
  @IsNotEmpty({ message: 'Class id is required' })
  @IsUUID('4', { message: 'Invalid class id' })
  class_id!: string;

  @IsNotEmpty({ message: 'Simulation name is required' })
  @IsString()
  simulation_name!: string;

  @IsOptional()
  @IsString()
  unit?: string;

  @IsNotEmpty()
  @IsString()
  category!: string;

  @IsNotEmpty()
  @Matches(/^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])-\d{4}$/, {
    message: 'start_date must be in MM-DD-YYYY format',
  })
  start_date!: string;

  @IsNotEmpty()
  @Matches(/^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])-\d{4}$/, {
    message: 'due_date must be in MM-DD-YYYY format',
  })
  due_date!: string;

  @IsNotEmpty()
  @Matches(/^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])-\d{4}$/, {
    message: 'end_date must be in MM-DD-YYYY format',
  })
  end_date!: string;

  @IsOptional()
  @IsUUID('4')
  educator_id?: string;

  @IsOptional()
  @IsUrl({}, { message: 'Invalid image URL' })
  image_url?: string;
}
