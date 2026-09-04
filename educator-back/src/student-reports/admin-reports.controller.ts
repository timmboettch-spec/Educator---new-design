import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { StudentReportsService } from './student-reports.service';

@ApiTags('Student Admin Reports')
@Controller('admin')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('JWT-auth')
export class StudentAdminReportsController {
  constructor(private readonly service: StudentReportsService) {}

  @Get('reports/:id')
  @ApiOperation({ summary: 'Get raw report blob by ID (HS-online shape)' })
  getReportById(@Param('id') id: string): ReturnType<StudentReportsService['getAdminReportById']> {
    return this.service.getAdminReportById(id);
  }
}
