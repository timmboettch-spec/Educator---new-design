import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  Req,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { EducatorSimulationsService } from './educator-simulations.service';
import { EducatorSimulationsConstants } from './educator-simulations.constants';
import { AppStatus, ErrorTypes } from 'src/common/utils/messages';
import { throwAppError } from 'src/common/utils/app-error';
import type { ApiResponse, JwtRequest } from 'src/common/types';
import { AddToLibraryDto, BulkAddToLibraryDto } from './dto/educator-simulation.dto';

@ApiTags(EducatorSimulationsConstants.SWAGGER.TAG)
@Controller(EducatorSimulationsConstants.ROUTES.BASE)
@UseGuards(AuthGuard('jwt'))
@ApiBearerAuth('JWT-auth')
export class EducatorSimulationsController {
  constructor(private readonly service: EducatorSimulationsService) {}

  @Post(EducatorSimulationsConstants.ROUTES.ADD_TO_LIBRARY)
  @ApiOperation({ summary: 'Add a simulation to my library' })
  async addToLibrary(@Body() dto: AddToLibraryDto, @Req() req: JwtRequest): Promise<ApiResponse> {
    if (!req.user?.userId)
      throwAppError(
        EducatorSimulationsConstants.VALIDATION.USER_NOT_AUTHENTICATED,
        ErrorTypes.UNAUTHORIZED,
      );

    const scenarioId = dto.scenario_id ?? dto.scenarioId;
    if (!scenarioId)
      throwAppError(
        EducatorSimulationsConstants.VALIDATION.SCENARIO_ID_REQUIRED,
        ErrorTypes.BAD_REQUEST,
      );

    const result = await this.service.addToLibrary(scenarioId, req.user.userId);
    if (!result.success) throwAppError(result.message!, result.type);
    return { status: AppStatus.SUCCESS, message: result.message!, data: result.data };
  }

  @Post(EducatorSimulationsConstants.ROUTES.ADD_TO_LIBRARY_BULK)
  async addToLibraryBulk(
    @Body() dto: BulkAddToLibraryDto,
    @Req() req: JwtRequest,
  ): Promise<ApiResponse> {
    const scenarioIds: string[] = dto.scenario_ids;
    const result = await this.service.addToLibraryBulk(scenarioIds, req.user.userId);

    return {
      status: AppStatus.SUCCESS,
      message: result.message!,
      data: result.data,
    };
  }

  @Delete(EducatorSimulationsConstants.ROUTES.REMOVE_FROM_LIBRARY)
  @ApiOperation({ summary: 'Remove a simulation from my library (soft delete)' })
  async removeFromLibrary(
    @Param('scenario_id') scenarioId: string,
    @Req() req: JwtRequest,
  ): Promise<ApiResponse> {
    if (!req.user?.userId)
      throwAppError(
        EducatorSimulationsConstants.VALIDATION.USER_NOT_AUTHENTICATED,
        ErrorTypes.UNAUTHORIZED,
      );
    if (!scenarioId)
      throwAppError(
        EducatorSimulationsConstants.VALIDATION.SCENARIO_ID_REQUIRED,
        ErrorTypes.BAD_REQUEST,
      );

    const result = await this.service.removeFromLibrary(scenarioId, req.user.userId);
    if (!result.success) throwAppError(result.message!, result.type);
    return { status: AppStatus.SUCCESS, message: result.message!, data: result.data };
  }

  @Get(EducatorSimulationsConstants.ROUTES.MY_LIBRARY)
  @ApiOperation({ summary: 'Get all simulations in my library' })
  async getMyLibrary(
    @Req() req: JwtRequest,
    @Query('ls') ls: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    if (!req.user?.userId)
      throwAppError(
        EducatorSimulationsConstants.VALIDATION.USER_NOT_AUTHENTICATED,
        ErrorTypes.UNAUTHORIZED,
      );

    const result = await this.service.getMyLibrary(req.user.userId, ls);
    if (!result.success) throwAppError(result.message!, result.type);
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.json({ status: AppStatus.SUCCESS, message: result.message!, data: result.data });
  }
}
