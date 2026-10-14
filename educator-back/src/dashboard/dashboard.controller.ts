import { Controller, Get, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { DashboardService } from './dashboard.service';
import { AppStatus } from '../common/utils/messages';
import { ApiResponse } from '../common/types';
import type { JwtRequest } from '../common/types';
import { RequiredRoles } from '../common/decorators/required-roles.decorator';
import { RoleSlug } from '../common/constants';

@ApiTags('Dashboard')
@ApiBearerAuth('JWT-auth')
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) { }

  @Get('overview')
  @RequiredRoles(RoleSlug.DISTRICT_ADMIN)
  @ApiOperation({ summary: 'Get aggregated dashboard overview for the authenticated admin' })
  async getOverview(@Req() req: JwtRequest): Promise<ApiResponse> {
    const data = await this.dashboardService.getOverview(req.user.userId);
    return { status: AppStatus.SUCCESS, message: 'Dashboard overview fetched', data };
  }
}
