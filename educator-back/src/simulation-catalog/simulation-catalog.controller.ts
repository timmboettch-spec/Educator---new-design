import {
  Controller,
  Get,
  Delete,
  Param,
  Query,
  ParseIntPipe,
  UseGuards,
  Req,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { SimulationCatalogService } from './simulation-catalog.service';
import { AppStatus, ErrorTypes } from 'src/common/utils/messages';
import { throwAppError } from 'src/common/utils/app-error';
import type { ApiResponse, JwtRequest } from 'src/common/types';
import { SimulationCatalogConstants } from './simulation-catalog.constants';

@ApiTags(SimulationCatalogConstants.SWAGGER.TAG)
@Controller(SimulationCatalogConstants.ROUTES.BASE)
export class SimulationCatalogController {
  constructor(private readonly service: SimulationCatalogService) {}

  @Get(SimulationCatalogConstants.ROUTES.GET_ALL)
  async getCatalog(@Query('ls') ls?: string): Promise<ApiResponse> {
    const result = await this.service.getCatalog(ls);
    return { status: AppStatus.SUCCESS, message: result.message!, data: result.data };
  }

  @Get(SimulationCatalogConstants.ROUTES.DASHBOARD)
  async getDashboard(@Query('ls') ls?: string): Promise<ApiResponse> {
    const result = await this.service.getCatalogFromBlob(ls);
    return {
      status: AppStatus.SUCCESS,
      message: SimulationCatalogConstants.MESSAGES.DASHBOARD_FETCHED,
      data: result.data,
    };
  }

  @Get(SimulationCatalogConstants.ROUTES.DASHBOARD_DETAIL)
  async getDashboardDetail(
    @Param('id') id: string,
    @Query('ls') ls?: string,
  ): Promise<ApiResponse> {
    const result = await this.service.getByScenarioId(id, ls);
    if (!result.success) throwAppError(result.message!, result.type);
    return {
      status: AppStatus.SUCCESS,
      message: SimulationCatalogConstants.MESSAGES.DASHBOARD_DETAIL_FETCHED,
      data: result.data,
    };
  }

  @Get(SimulationCatalogConstants.ROUTES.ADMIN_REPORT)
  async getAdminReport(@Param('id') id: string): Promise<ApiResponse> {
    const result = await this.service.getAdminReport(id);
    if (!result.success) throwAppError(result.message!, result.type);
    return {
      status: AppStatus.SUCCESS,
      message: SimulationCatalogConstants.MESSAGES.ADMIN_REPORT_FETCHED,
      data: result.data,
    };
  }

  @Get(SimulationCatalogConstants.ROUTES.GET_ALL_SCENARIOS)
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth('JWT-auth')
  async getAllScenarios(@Req() req: JwtRequest, @Query('ls') ls?: string): Promise<ApiResponse> {
    if (!req.user?.userId) throwAppError('User not authenticated', ErrorTypes.UNAUTHORIZED);
    const result = await this.service.getAllScenarios(req.user.userId, ls);
    if (!result.success) throwAppError(result.message!, result.type);
    return { status: AppStatus.SUCCESS, message: result.message!, data: result.data };
  }

  @Get(SimulationCatalogConstants.ROUTES.STATUS_SUMMARY)
  async getStatusSummary(@Query('ls') ls?: string): Promise<ApiResponse> {
    const result = await this.service.getStatusSummary(ls);
    return { status: AppStatus.SUCCESS, message: result.message!, data: result.data };
  }

  @Get(SimulationCatalogConstants.ROUTES.GET_BY_UNIT)
  async getSimulationsByUnitId(
    @Param('unit_id') unit_id: string,
    @Res() res: Response,
    @Query('ls') ls?: string,
  ): Promise<void> {
    const result = await this.service.getSimulationsByUnitId(unit_id, ls);
    if (!result.success) throwAppError(result.message!, result.type);
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.json({ status: AppStatus.SUCCESS, message: result.message!, data: result.data });
  }

  @Get(SimulationCatalogConstants.ROUTES.GET_PUBLIC_SCENARIO)
  async getPublicBlobScenario(
    @Param('scenarioId') scenarioId: string,
    @Res() res: Response,
    @Query('title') title?: string,
    @Query('ls') ls?: string,
  ): Promise<void> {
    const result = await this.service.getPublicBlobScenario(scenarioId, title, ls);
    if (!result.success) throwAppError(result.message!, result.type);
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.json({ status: AppStatus.SUCCESS, message: result.message!, data: result.data });
  }

  @Get(SimulationCatalogConstants.ROUTES.GET_BY_SCENARIO_ID)
  async getByScenarioId(
    @Param('scenarioId') scenarioId: string,
    @Query('ls') ls?: string,
  ): Promise<ApiResponse> {
    const result = await this.service.getByScenarioId(scenarioId, ls);
    if (!result.success) throwAppError(result.message!, result.type);
    return { status: AppStatus.SUCCESS, message: result.message!, data: result.data };
  }

  @Get(SimulationCatalogConstants.ROUTES.GET_COMBINED_SCENARIO)
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth('JWT-auth')
  async getCombined(@Req() req: JwtRequest, @Query('ls') ls?: string): Promise<ApiResponse> {
    const result = await this.service.getCombinedCatalog(req.user.userId, ls);

    return {
      status: AppStatus.SUCCESS,
      message: 'Catalog fetched successfully',
      data: result.data,
    };
  }

  @Delete(SimulationCatalogConstants.ROUTES.DELETE)
  async remove(@Param('id', ParseIntPipe) id: number): Promise<ApiResponse> {
    const result = await this.service.remove(id);
    if (!result.success) throwAppError(result.message!, result.type);
    return { status: AppStatus.SUCCESS, message: result.message!, data: result.data };
  }
}
