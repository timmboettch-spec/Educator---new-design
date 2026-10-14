import { Controller, Get, Param } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { StudentReportsService } from './student-reports.service';
import { RequiredRoles } from 'src/common/decorators/required-roles.decorator';
import { RoleSlug } from 'src/common/constants';

@ApiTags('Student Admin Reports')
@Controller('admin')
@ApiBearerAuth('JWT-auth')
export class StudentAdminReportsController {
  constructor(private readonly service: StudentReportsService) { }

  @Get('reports/:id')
  @RequiredRoles(RoleSlug.EDUCATOR, RoleSlug.DISTRICT_ADMIN, RoleSlug.STUDENT)
  @ApiOperation({ summary: 'Get raw report blob by ID (HS-online shape)' })
  getReportById(@Param('id') id: string): ReturnType<StudentReportsService['getAdminReportById']> {
    return this.service.getAdminReportById(id);
  }
}
