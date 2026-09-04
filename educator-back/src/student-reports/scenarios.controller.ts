import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { StudentReportsService } from './student-reports.service';

@ApiTags('Student Scenarios')
@Controller('scenarios')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('JWT-auth')
export class StudentScenariosController {
  constructor(private readonly service: StudentReportsService) {}

  @Get(':id')
  @ApiOperation({ summary: 'Get scenario by ID (HS-online shape)' })
  findById(
    @Param('id') id: string,
    @Query('ls') ls?: string,
  ): ReturnType<StudentReportsService['getScenarioById']> {
    return this.service.getScenarioById(id, ls);
  }
}
