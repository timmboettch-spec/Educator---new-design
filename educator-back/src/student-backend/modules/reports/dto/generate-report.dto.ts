import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';

export class GenerateReportDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  logId!: string;
}
