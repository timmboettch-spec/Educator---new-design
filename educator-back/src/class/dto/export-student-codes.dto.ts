import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { VALIDATION_MSG } from 'src/common/messages/validation.message';
import { StudentCodesExportFormat } from 'src/common/constants';

export class ExportStudentCodesReqDto {
  @IsOptional()
  @IsEnum(StudentCodesExportFormat, { message: VALIDATION_MSG.IS_ENUM('format') })
  @ApiPropertyOptional({
    enum: StudentCodesExportFormat,
    example: StudentCodesExportFormat.PDF,
    default: StudentCodesExportFormat.CSV,
  })
  format?: StudentCodesExportFormat;
}
