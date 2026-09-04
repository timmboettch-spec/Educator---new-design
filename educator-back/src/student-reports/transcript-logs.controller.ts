import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { StudentReportsService } from './student-reports.service';

@ApiTags('Student Transcript Logs')
@Controller('logs')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('JWT-auth')
export class StudentTranscriptLogsController {
  constructor(private readonly service: StudentReportsService) {}

  @Get(':id')
  @ApiOperation({ summary: 'Get transcript log by ID (HS-online shape)' })
  findById(@Param('id') id: string): ReturnType<StudentReportsService['getTranscriptLog']> {
    return this.service.getTranscriptLog(id);
  }
}
