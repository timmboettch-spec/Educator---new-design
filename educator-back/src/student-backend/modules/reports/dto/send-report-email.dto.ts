import { IsEmail, IsOptional, IsString } from 'class-validator';

export class SendReportEmailDto {
  @IsOptional()
  @IsEmail()
  to?: string;

  @IsOptional()
  @IsString()
  message?: string;

  @IsOptional()
  @IsString()
  studentName?: string;

  @IsOptional()
  @IsString()
  studentClass?: string;

  @IsOptional()
  @IsString()
  key?: string;
}
