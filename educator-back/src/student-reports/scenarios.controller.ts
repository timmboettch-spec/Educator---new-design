import { Controller, Get, Param } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { StudentReportsService } from './student-reports.service';
import { RequiredRoles } from 'src/common/decorators/required-roles.decorator';
import { RoleSlug } from 'src/common/constants';

@ApiTags('Student Scenarios')
@Controller('scenarios')
@ApiBearerAuth('JWT-auth')
export class StudentScenariosController {
  constructor(private readonly service: StudentReportsService) { }

  @Get(':id')
  @RequiredRoles(RoleSlug.EDUCATOR, RoleSlug.STUDENT)
  @ApiOperation({ summary: 'Get scenario by ID (HS-online shape)' })
  findById(@Param('id') id: string): ReturnType<StudentReportsService['getScenarioById']> {
    return this.service.getScenarioById(id);
  }
}
