import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { DashboardService } from './dashboard.service';
import { AppStatus } from '../common/utils/messages';
import { ApiResponse } from '../common/types';
import type { JwtRequest } from '../common/types';

@ApiTags('Dashboard')
@UseGuards(AuthGuard('jwt'))
@ApiBearerAuth('JWT-auth')
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('overview')
  @ApiOperation({ summary: 'Get aggregated dashboard overview for the authenticated admin' })
  async getOverview(@Req() req: JwtRequest): Promise<ApiResponse> {
    const data = await this.dashboardService.getOverview(req.user.userId);
    return { status: AppStatus.SUCCESS, message: 'Dashboard overview fetched', data };
  }
}
