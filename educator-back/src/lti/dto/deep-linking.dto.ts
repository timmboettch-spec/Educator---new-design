import { IsString, IsArray, ValidateNested, IsOptional, IsNumber } from 'class-validator';
import { Type } from 'class-transformer';

export class DeepLinkingExchangeDto {
  @IsString()
  code!: string;
}

export class SelectedSimulationDto {
  @IsString()
  simulationId!: string;

  @IsString()
  title!: string;

  @IsOptional()
  @IsNumber()
  scoreMaximum?: number;
}

export class DeepLinkingSubmitDto {
  @IsString()
  code!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SelectedSimulationDto)
  selections!: SelectedSimulationDto[];
}
