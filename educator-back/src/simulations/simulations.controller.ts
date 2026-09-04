import { Controller, Get, Param, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { SimulationsService } from './simulations.service';
import { SimulationConstants } from './simulations.constant';
import { ApiResponse, BlobScenario } from 'src/common/types';
import { AppStatus, ErrorTypes } from 'src/common/utils/messages';
import { throwAppError } from 'src/common/utils/app-error';
import { Simulation } from './entity/simulation.entity';

@ApiTags(SimulationConstants.SWAGGER.TAG)
@Controller(SimulationConstants.ROUTES.BASE)
@UseGuards(AuthGuard('jwt'))
@ApiBearerAuth('JWT-auth')
export class SimulationsController {
  constructor(private readonly service: SimulationsService) {}

  @Get(SimulationConstants.ROUTES.ALL_DETAILS)
  @ApiOperation({ summary: SimulationConstants.SWAGGER.ALL_DETAILS })
  async findAllWithDetails(): Promise<ApiResponse<BlobScenario[]>> {
    const result = await this.service.findAllWithDetails();
    if (!result.success) throwAppError(result.message!, result.type);
    return {
      status: AppStatus.SUCCESS,
      message: result.message!,
      data: result.data,
    };
  }

  @Get()
  @ApiOperation({ summary: SimulationConstants.SWAGGER.ALL })
  async findAll(): Promise<ApiResponse<Simulation[]>> {
    const result = await this.service.findAll();
    if (!result.success) throwAppError(result.message!, result.type);
    return {
      status: AppStatus.SUCCESS,
      message: result.message!,
      data: result.data,
    };
  }

  @Get(SimulationConstants.ROUTES.BY_UNIT)
  @ApiOperation({ summary: 'Get all simulations for a unit' })
  async findByUnitId(
    @Param('unit_id') unit_id: string,
    @Query('ls') ls: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    if (!unit_id) {
      throwAppError(SimulationConstants.VALIDATION.SIMULATION_ID_REQUIRED, ErrorTypes.BAD_REQUEST);
    }
    const result = await this.service.findByUnitId(unit_id, ls);
    if (!result.success) throwAppError(result.message!, result.type);
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.json({ status: AppStatus.SUCCESS, message: result.message!, data: result.data });
  }

  @Get(SimulationConstants.ROUTES.ID)
  @ApiOperation({ summary: SimulationConstants.SWAGGER.BY_ID })
  async findById(@Param('id') id: string): Promise<ApiResponse<Simulation>> {
    if (!id) {
      throwAppError(SimulationConstants.VALIDATION.SIMULATION_ID_REQUIRED, ErrorTypes.BAD_REQUEST);
    }
    const result = await this.service.findById(id);
    if (!result.success) throwAppError(result.message!, result.type);
    return {
      status: AppStatus.SUCCESS,
      message: result.message!,
      data: result.data,
    };
  }
}
