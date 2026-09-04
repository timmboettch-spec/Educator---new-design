import { IsString, IsOptional, IsNumber, IsArray } from 'class-validator';
import { Type, Transform } from 'class-transformer';

export class CreateSimulationCatalogDto {
  @IsString()
  title!: string;

  @IsString()
  unit!: string;

  @IsString()
  category!: string;

  @IsString()
  target_audience!: string;

  @IsOptional()
  @IsString()
  difficulty_level?: string;

  @IsOptional()
  @IsString()
  estimated_duration?: string;

  @IsOptional()
  @IsString()
  language?: string;

  @IsOptional()
  @IsString()
  purpose?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @Transform(({ value }: { value: string | string[] }) =>
    Array.isArray(value) ? value : typeof value === 'string' ? [value] : [],
  )
  @IsArray()
  @IsString({ each: true })
  learning_objectives?: string[];

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  rating?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  total_ratings?: number;

  @IsOptional()
  @IsString()
  usage?: string;

  @IsOptional()
  @IsString()
  rating_breakdown?: string;

  @IsOptional()
  @IsString()
  reviews?: string;

  @IsOptional()
  @IsString()
  whats_new?: string;

  @IsOptional()
  @IsString()
  simulation_privacy?: string;

  @IsOptional()
  @IsString()
  developer?: string;

  @IsOptional()
  @IsString()
  institution?: string;

  @IsOptional()
  @IsString()
  last_update?: string;
}

export class UpdateSimulationCatalogDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  unit?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  target_audience?: string;

  @IsOptional()
  @IsString()
  difficulty_level?: string;

  @IsOptional()
  @IsString()
  estimated_duration?: string;

  @IsOptional()
  @IsString()
  language?: string;

  @IsOptional()
  @IsString()
  purpose?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @Transform(({ value }: { value: string | string[] }) =>
    Array.isArray(value) ? value : typeof value === 'string' ? [value] : [],
  )
  @IsArray()
  @IsString({ each: true })
  learning_objectives?: string[];

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  rating?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  total_ratings?: number;

  @IsOptional()
  @IsString()
  usage?: string;

  @IsOptional()
  @IsString()
  rating_breakdown?: string;

  @IsOptional()
  @IsString()
  reviews?: string;

  @IsOptional()
  @IsString()
  whats_new?: string;

  @IsOptional()
  @IsString()
  simulation_privacy?: string;

  @IsOptional()
  @IsString()
  developer?: string;

  @IsOptional()
  @IsString()
  institution?: string;

  @IsOptional()
  @IsString()
  last_update?: string;
}
