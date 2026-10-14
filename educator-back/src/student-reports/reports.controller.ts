import { Controller, Get, Param } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { StudentReportsService } from './student-reports.service';
import { RequiredRoles } from 'src/common/decorators/required-roles.decorator';
import { RoleSlug } from 'src/common/constants';

@ApiTags('Student Reports')
@Controller('reports')
@ApiBearerAuth('JWT-auth')
export class StudentReportsController {
  constructor(private readonly service: StudentReportsService) { }

  @Get('transcript/:transcriptId')
  @RequiredRoles(RoleSlug.STUDENT, RoleSlug.EDUCATOR)
  @ApiOperation({ summary: 'Get report by transcript ID (HS-online shape)' })
  findByTranscriptId(
    @Param('transcriptId') transcriptId: string,
  ): ReturnType<StudentReportsService['findReportByTranscriptId']> {
    return this.service.findReportByTranscriptId(transcriptId);
  }

  @Get(':id')
  @RequiredRoles(RoleSlug.STUDENT, RoleSlug.EDUCATOR)
  @ApiOperation({ summary: 'Get report by ID with _transcript (HS-online shape)' })
  findById(@Param('id') id: string): ReturnType<StudentReportsService['findReportById']> {
    return this.service.findReportById(id);
  }
}
