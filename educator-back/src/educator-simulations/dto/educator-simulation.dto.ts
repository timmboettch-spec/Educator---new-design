import { IsString, IsOptional, IsArray, ArrayNotEmpty } from 'class-validator';

export class AddToLibraryDto {
  @IsOptional()
  @IsString()
  scenario_id?: string;

  @IsOptional()
  @IsString()
  scenarioId?: string;

  @IsOptional()
  @IsString()
  unit_id?: string;

  @IsOptional()
  @IsString()
  unitId?: string;
}

export class BulkAddToLibraryDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  scenario_ids: string[] = [];
}
