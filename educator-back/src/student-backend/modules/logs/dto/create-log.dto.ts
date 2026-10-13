import { IsString, IsOptional } from 'class-validator';

export class CreateLogDto {
  @IsString()
  scenarioId!: string;

  @IsString()
  @IsOptional()
  userId?: string;

  @IsString()
  @IsOptional()
  loginSessionId?: string;

  @IsString()
  @IsOptional()
  studentName?: string;

  @IsString()
  @IsOptional()
  studentKey?: string;

  @IsString()
  @IsOptional()
  studentClass?: string;
}
