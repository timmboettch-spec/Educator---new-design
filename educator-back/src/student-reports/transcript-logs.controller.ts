import { Controller, Get, Param } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { StudentReportsService } from './student-reports.service';
import { RequiredRoles } from 'src/common/decorators/required-roles.decorator';
import { RoleSlug } from 'src/common/constants';

@ApiTags('Student Transcript Logs')
@Controller('logs')
@ApiBearerAuth('JWT-auth')
export class StudentTranscriptLogsController {
  constructor(private readonly service: StudentReportsService) { }

  @Get(':id')
  @RequiredRoles(RoleSlug.STUDENT, RoleSlug.EDUCATOR)
  @ApiOperation({ summary: 'Get transcript log by ID (HS-online shape)' })
  findById(@Param('id') id: string): ReturnType<StudentReportsService['getTranscriptLog']> {
    return this.service.getTranscriptLog(id);
  }
}
