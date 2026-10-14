import { Controller, Get, Post, Delete, Param, Body, Query, Req, Res } from '@nestjs/common';
import type { Response } from 'express';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiBadRequestResponse,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiQuery,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { EducatorSimulationsService } from './educator-simulations.service';
import { EducatorSimulationsConstants } from './educator-simulations.constants';
import { AppStatus, ErrorTypes } from 'src/common/utils/messages';
import { throwAppError } from 'src/common/utils/app-error';
import type { ApiResponse, JwtRequest } from 'src/common/types';
import {
  AddToLibraryDto,
  BulkAddToLibraryDto,
  RemoveFromLibraryBulkDto,
} from './dto/educator-simulation.dto';
import { resolveActingEducatorId } from 'src/educators/utils/educator-school-access.util';
import { RequiredRoles } from 'src/common/decorators/required-roles.decorator';
import { RoleSlug } from 'src/common/constants';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { ResponseResult } from 'src/common/class/response.class';
import type { ICurrentUser, IPaginationMeta } from 'src/common/interfaces';
import {
  ListMyLibraryReqDto,
  ListMyLibraryResponseDto,
  MyLibraryItemResDto,
  MyLibraryLiteItemResDto,
} from './dto/list-my-library.dto';

@ApiTags(EducatorSimulationsConstants.SWAGGER.TAG)
@Controller(EducatorSimulationsConstants.ROUTES.BASE)
@ApiBearerAuth('JWT-auth')
export class EducatorSimulationsController {
  constructor(private readonly service: EducatorSimulationsService) {}

  @Post(EducatorSimulationsConstants.ROUTES.ADD_TO_LIBRARY)
  @RequiredRoles(RoleSlug.EDUCATOR)
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

    const result = await this.service.addToLibrary(scenarioId, resolveActingEducatorId(req));
    if (!result.success) throwAppError(result.message!, result.type);
    return { status: AppStatus.SUCCESS, message: result.message!, data: result.data };
  }

  @Post(EducatorSimulationsConstants.ROUTES.ADD_TO_LIBRARY_BULK)
  @RequiredRoles(RoleSlug.EDUCATOR)
  async addToLibraryBulk(
    @Body() dto: BulkAddToLibraryDto,
    @Req() req: JwtRequest,
  ): Promise<ApiResponse> {
    const scenarioIds: string[] = dto.scenario_ids;
    const result = await this.service.addToLibraryBulk(scenarioIds, resolveActingEducatorId(req));

    return {
      status: AppStatus.SUCCESS,
      message: result.message!,
      data: result.data,
    };
  }

  @Delete(EducatorSimulationsConstants.ROUTES.REMOVE_FROM_LIBRARY_BULK)
  @RequiredRoles(RoleSlug.EDUCATOR)
  @ApiOperation({ summary: 'Remove multiple simulations from my library (soft delete)' })
  async removeFromLibraryBulk(
    @Body() body: RemoveFromLibraryBulkDto,
    @Req() req: JwtRequest,
  ): Promise<ApiResponse> {
    if (!req.user?.userId) {
      throwAppError(
        EducatorSimulationsConstants.VALIDATION.USER_NOT_AUTHENTICATED,
        ErrorTypes.UNAUTHORIZED,
      );
    }

    const { scenario_ids: scenarioIds } = body;

    if (!scenarioIds || scenarioIds.length === 0) {
      throwAppError(
        EducatorSimulationsConstants.VALIDATION.SCENARIO_ID_REQUIRED,
        ErrorTypes.BAD_REQUEST,
      );
    }

    const result = await this.service.removeFromLibraryBulk(
      scenarioIds,
      resolveActingEducatorId(req),
    );

    if (!result.success) {
      throwAppError(result.message!, result.type);
    }

    return {
      status: AppStatus.SUCCESS,
      message: result.message!,
      data: result.data,
    };
  }

  @Delete(EducatorSimulationsConstants.ROUTES.REMOVE_FROM_LIBRARY)
  @RequiredRoles(RoleSlug.EDUCATOR)
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

    const result = await this.service.removeFromLibrary(scenarioId, resolveActingEducatorId(req));
    if (!result.success) throwAppError(result.message!, result.type);
    return { status: AppStatus.SUCCESS, message: result.message!, data: result.data };
  }

  @Get(EducatorSimulationsConstants.ROUTES.MY_LIBRARY)
  @RequiredRoles(RoleSlug.EDUCATOR)
  @ApiOperation({ summary: 'Get all simulations in my library' })
  async getMyLibrary(@Req() req: JwtRequest, @Res() res: Response): Promise<void> {
    if (!req.user?.userId)
      throwAppError(
        EducatorSimulationsConstants.VALIDATION.USER_NOT_AUTHENTICATED,
        ErrorTypes.UNAUTHORIZED,
      );

    const result = await this.service.getMyLibrary(resolveActingEducatorId(req));
    if (!result.success) throwAppError(result.message!, result.type);
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.json({ status: AppStatus.SUCCESS, message: result.message!, data: result.data });
  }

  @Get(EducatorSimulationsConstants.ROUTES.MY_LIBRARY_LIST)
  @RequiredRoles(RoleSlug.EDUCATOR)
  @ApiBadRequestResponse({ description: 'Invalid page, pageSize, lite or a filter' })
  @ApiUnauthorizedResponse({
    description: 'Missing, invalid or expired token, or a role not yet selected',
  })
  @ApiForbiddenResponse({ description: 'Insufficient role' })
  @ApiQuery({
    name: 'lite',
    required: false,
    type: Boolean,
    example: true,
    description:
      'true returns the card-only item (cheap query, no unit or media), false or omitted returns the full item.',
  })
  @ApiOkResponse({
    type: ListMyLibraryResponseDto,
    description:
      'Full item by default; with `?lite=true` the card-only item (`id` and a light `scenario`).',
  })
  async getMyLibraryList(
    @CurrentUser() currentUser: ICurrentUser,
    @Query() dto: ListMyLibraryReqDto,
  ): Promise<ResponseResult<MyLibraryItemResDto[] | MyLibraryLiteItemResDto[], IPaginationMeta>> {
    return this.service.getMyLibraryList(currentUser, dto);
  }
}
