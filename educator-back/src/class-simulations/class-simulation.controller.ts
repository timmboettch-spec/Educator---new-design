import {
  Controller,
  Post,
  Get,
  Put,
  Delete,
  Param,
  Body,
  Query,
  Req,
  ForbiddenException,
  NotFoundException,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiBadRequestResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { ClassSimulationService } from './class-simulation.service';
import { AssignClassSimulationDto } from './dto/class-simulation.dto';
import {
  ClassSimulationListItemResDto,
  ListClassSimulationsReqDto,
  ListClassSimulationsResponseDto,
} from './dto/list-class-simulations.dto';
import {
  BulkAssignClassSimulationsReqDto,
  BulkAssignClassSimulationsResDto,
  BulkAssignClassSimulationsResponseDto,
} from './dto/bulk-assign-class-simulations.dto';
import {
  UpdateClassSimulationReqDto,
  UpdateClassSimulationResDto,
  UpdateClassSimulationResponseDto,
} from './dto/update-class-simulation.dto';
import { ApiResponse } from 'src/common/types';
import { AppStatus, ErrorTypes, Messages } from 'src/common/utils/messages';
import { throwAppError } from 'src/common/utils/app-error';

import { ClassSimulationConstants } from './class-simulation.constant';
import * as types from 'src/common/types';
import { EducatorsService } from 'src/educators/educators.service';
import { ClassSimulation } from 'src/database/entities';
import { ClassSimulationAssignmentConstants, RoleSlug } from 'src/common/constants';
import { resolveActingEducatorId } from 'src/educators/utils/educator-school-access.util';
import { RequiredRoles } from 'src/common/decorators/required-roles.decorator';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import type { ICurrentUser, IPaginationMeta } from 'src/common/interfaces';
import { ResponseResult } from 'src/common/class/response.class';

@ApiTags(ClassSimulationConstants.SWAGGER.TAG)
@Controller(ClassSimulationConstants.ROUTES.BASE)
@ApiBearerAuth('JWT-auth')
export class ClassSimulationController {
  constructor(
    private readonly service: ClassSimulationService,
    private readonly educatorService: EducatorsService,
  ) {}

  @Get()
  @RequiredRoles(RoleSlug.EDUCATOR)
  @ApiBadRequestResponse({
    description: 'Missing/invalid classId, or an invalid page, pageSize, sortBy or sortDir',
  })
  @ApiUnauthorizedResponse({
    description: 'Missing, invalid or expired token, or a role not yet selected',
  })
  @ApiForbiddenResponse({ description: 'Insufficient role' })
  @ApiNotFoundResponse({ description: 'Class not found or not accessible' })
  @ApiOkResponse({ type: ListClassSimulationsResponseDto })
  async findForClassListing(
    @CurrentUser() currentUser: ICurrentUser,
    @Query() dto: ListClassSimulationsReqDto,
  ): Promise<ResponseResult<ClassSimulationListItemResDto[], IPaginationMeta>> {
    return this.service.findClassSimulations(currentUser, dto);
  }

  @Post(ClassSimulationAssignmentConstants.BULK.ROUTE)
  @RequiredRoles(RoleSlug.EDUCATOR)
  @ApiBadRequestResponse({
    description:
      'Invalid body (ids, dates, array sizes, unknown fields such as reduceToken), dates out of order, or insufficient seats',
  })
  @ApiUnauthorizedResponse({
    description: 'Missing, invalid or expired token, or a role not yet selected',
  })
  @ApiForbiddenResponse({
    description: 'Insufficient role, or the educator is not assigned to the school',
  })
  @ApiNotFoundResponse({ description: 'Educator not found or inactive' })
  @ApiUnprocessableEntityResponse({
    description:
      'One or more class/simulation pairs failed; nothing was assigned. `error` = { total, failed, results[] }',
  })
  @ApiCreatedResponse({ type: BulkAssignClassSimulationsResponseDto })
  async bulkAssign(
    @CurrentUser() currentUser: ICurrentUser,
    @Body() dto: BulkAssignClassSimulationsReqDto,
  ): Promise<ResponseResult<BulkAssignClassSimulationsResDto>> {
    return this.service.bulkAssign(currentUser, dto);
  }

  @Post()
  @RequiredRoles(RoleSlug.EDUCATOR)
  @ApiOperation({ summary: ClassSimulationConstants.SWAGGER.ASSIGN })
  async assign(
    @Body() dto: AssignClassSimulationDto,
    @Req() req: types.JwtRequest,
  ): Promise<ApiResponse<ClassSimulation>> {
    const educatorTokens = await this.educatorService.availableTokens(resolveActingEducatorId(req));
    if (educatorTokens === null) {
      throw new ForbiddenException(Messages.NO_TOKENS);
    }

    const educatorResponse = await this.educatorService.findById(resolveActingEducatorId(req));

    if (!educatorResponse.data) {
      throw new NotFoundException(Messages.EDUCATOR_NOT_FOUND);
    }

    const result = await this.service.assign(dto, educatorResponse.data);

    if (!result.success) throwAppError(result.message!, result.type);
    return { status: AppStatus.SUCCESS, message: result.message!, data: result.data };
  }

  @Get(ClassSimulationConstants.ROUTES.BY_CLASS)
  @RequiredRoles(RoleSlug.EDUCATOR)
  @ApiOperation({ summary: ClassSimulationConstants.SWAGGER.BY_CLASS })
  async findByClass(@Param('class_id') class_id: string): Promise<ApiResponse> {
    if (!class_id)
      throwAppError(ClassSimulationConstants.VALIDATION.CLASS_ID_REQUIRED, ErrorTypes.BAD_REQUEST);
    const result = await this.service.findByClass(class_id);
    return { status: AppStatus.SUCCESS, message: result.message!, data: result.data };
  }

  @Get(ClassSimulationConstants.ROUTES.BY_SIMULATION)
  @RequiredRoles(RoleSlug.EDUCATOR)
  @ApiOperation({ summary: ClassSimulationConstants.SWAGGER.BY_SIMULATION })
  async findBySimulation(@Param('simulation_id') simulation_id: string): Promise<ApiResponse> {
    if (!simulation_id)
      throwAppError(
        ClassSimulationConstants.VALIDATION.SIMULATION_ID_REQUIRED,
        ErrorTypes.BAD_REQUEST,
      );
    const result = await this.service.findBySimulation(simulation_id);
    return { status: AppStatus.SUCCESS, message: result.message!, data: result.data };
  }

  @Put(ClassSimulationConstants.ROUTES.ID)
  @RequiredRoles(RoleSlug.EDUCATOR)
  @ApiForbiddenResponse({ description: 'Insufficient role' })
  @ApiOkResponse({ type: UpdateClassSimulationResponseDto })
  async update(
    @CurrentUser() currentUser: ICurrentUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateClassSimulationReqDto,
  ): Promise<ResponseResult<UpdateClassSimulationResDto>> {
    return this.service.update(currentUser, id, dto);
  }

  @Delete(ClassSimulationConstants.ROUTES.ID)
  @RequiredRoles(RoleSlug.EDUCATOR)
  @ApiOperation({ summary: ClassSimulationConstants.SWAGGER.REMOVE })
  async remove(@Param('id') id: string, @Req() req: types.JwtRequest): Promise<ApiResponse<null>> {
    const userId = resolveActingEducatorId(req);
    const result = await this.service.remove(id, userId);
    if (!result.success) throwAppError(result.message!, result.type);
    return { status: AppStatus.SUCCESS, message: result.message!, data: null };
  }
}
