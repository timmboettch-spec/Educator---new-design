import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiForbiddenResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequiredRoles } from 'src/common/decorators/required-roles.decorator';
import { Public } from 'src/common/decorators/public.decorator';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import type { ICurrentUser } from 'src/common/interfaces';
import { ResponseResult } from 'src/common/class/response.class';
import { RoleSlug, SimulationConstants } from 'src/common/constants';
import { FilterDropdownReqDto } from 'src/common/dtos/simulation.dto';
import type { IPaginationMeta } from 'src/common/interfaces/pagination.interface';
import { SimulationService } from './simulation.service';
import { ListProductNamesDropdownResponseDto } from './dto/product-name-dropdown.dto';
import { ListTargetAudiencesDropdownResponseDto } from './dto/target-audience-dropdown.dto';
import { ListSimulationsResponseDto, SimulationListItemResDto } from './dto/list-simulations.dto';
import {
  EducatorSimulationResDto,
  GetEducatorSimulationsResponseDto,
} from './dto/get-educator-simulations.dto';
import {
  GetPublicSimulationReqDto,
  GetPublicSimulationResponseDto,
  PublicSimulationResDto,
} from './dto/get-public-simulation.dto';
import {
  CombinedSimulationsResDto,
  GetCombinedSimulationsResponseDto,
} from './dto/get-combined-simulations.dto';
import {
  GetSimulationsByUnitResponseDto,
  SimulationByUnitResDto,
} from './dto/get-simulations-by-unit.dto';

/**
 * Every `/api/simulations/*` route. The base path, auth and the new-module
 * pipeline are declared once at the class level, per `controller-rules.md`.
 *
 * Only the scenario share link carries `@Public()`, because logged-out visitors
 * open it. The list root requires a token and also admits students, who load
 * the simulation picker from it after logging in.
 */
@ApiTags(SimulationConstants.SWAGGER.TAG)
@RequiredRoles(RoleSlug.EDUCATOR, RoleSlug.DISTRICT_ADMIN)
@Controller(SimulationConstants.ROUTES.BASE)
export class SimulationController {
  constructor(private readonly simulationService: SimulationService) {}

  @Get(SimulationConstants.ROUTES.GET_ALL)
  @RequiredRoles(RoleSlug.EDUCATOR, RoleSlug.DISTRICT_ADMIN, RoleSlug.STUDENT)
  @ApiForbiddenResponse({ description: 'Insufficient role' })
  @ApiOkResponse({ type: ListSimulationsResponseDto })
  async getSimulations(): Promise<ResponseResult<SimulationListItemResDto[]>> {
    return this.simulationService.getSimulations();
  }

  @Get(SimulationConstants.ROUTES.GET_ALL_SIMULATION_FOR_EDUCATOR)
  @RequiredRoles(RoleSlug.EDUCATOR, RoleSlug.DISTRICT_ADMIN)
  @ApiForbiddenResponse({ description: 'Insufficient role' })
  @ApiOkResponse({ type: GetEducatorSimulationsResponseDto })
  async getAllScenarios(
    @CurrentUser() currentUser: ICurrentUser,
  ): Promise<ResponseResult<EducatorSimulationResDto[]>> {
    return this.simulationService.getAllScenarios(currentUser);
  }

  @Get(SimulationConstants.ROUTES.GET_PUBLIC_SIMULATION)
  @Public()
  @ApiOperation({
    description:
      'Public share link. Does not return voiceProfile or voiceProfileId; the voice is only on authenticated scenario reads.',
  })
  @ApiForbiddenResponse({ description: 'Insufficient role' })
  @ApiOkResponse({ type: GetPublicSimulationResponseDto })
  async getPublicBlobScenario(
    @Param('scenarioId') scenarioId: string,
    @Query() dto: GetPublicSimulationReqDto,
  ): Promise<ResponseResult<PublicSimulationResDto>> {
    return this.simulationService.getPublicBlobScenario(scenarioId, dto);
  }

  @Get(SimulationConstants.ROUTES.GET_COMBINED_SIMULATION)
  @RequiredRoles(RoleSlug.EDUCATOR, RoleSlug.DISTRICT_ADMIN)
  @ApiForbiddenResponse({ description: 'Insufficient role' })
  @ApiOkResponse({ type: GetCombinedSimulationsResponseDto })
  async getCombined(
    @CurrentUser() currentUser: ICurrentUser,
  ): Promise<ResponseResult<CombinedSimulationsResDto>> {
    return this.simulationService.getCombinedSimulations(currentUser);
  }

  @Get(SimulationConstants.ROUTES.TARGET_AUDIENCES_MY_LIBRARY_DROPDOWN)
  @RequiredRoles(RoleSlug.EDUCATOR)
  @ApiForbiddenResponse({ description: 'Insufficient role' })
  @ApiOkResponse({ type: ListTargetAudiencesDropdownResponseDto })
  async findLibraryTargetAudienceDropdown(
    @CurrentUser() currentUser: ICurrentUser,
    @Query() dto: FilterDropdownReqDto,
  ): Promise<ResponseResult<string[], IPaginationMeta>> {
    return this.simulationService.findLibraryTargetAudienceDropdown(currentUser, dto);
  }

  @Get(SimulationConstants.ROUTES.TARGET_AUDIENCES_CATALOG_DROPDOWN)
  @RequiredRoles(RoleSlug.EDUCATOR)
  @ApiForbiddenResponse({ description: 'Insufficient role' })
  @ApiOkResponse({ type: ListTargetAudiencesDropdownResponseDto })
  async findCatalogueTargetAudienceDropdown(
    @CurrentUser() currentUser: ICurrentUser,
    @Query() dto: FilterDropdownReqDto,
  ): Promise<ResponseResult<string[], IPaginationMeta>> {
    return this.simulationService.findCatalogueTargetAudienceDropdown(currentUser, dto);
  }

  @Get(SimulationConstants.ROUTES.PRODUCT_NAMES_MY_LIBRARY_DROPDOWN)
  @RequiredRoles(RoleSlug.EDUCATOR)
  @ApiForbiddenResponse({ description: 'Insufficient role' })
  @ApiOkResponse({ type: ListProductNamesDropdownResponseDto })
  async findLibraryProductNameDropdown(
    @CurrentUser() currentUser: ICurrentUser,
    @Query() dto: FilterDropdownReqDto,
  ): Promise<ResponseResult<string[], IPaginationMeta>> {
    return this.simulationService.findLibraryProductNameDropdown(currentUser, dto);
  }

  @Get(SimulationConstants.ROUTES.PRODUCT_NAMES_CATALOG_DROPDOWN)
  @RequiredRoles(RoleSlug.EDUCATOR)
  @ApiForbiddenResponse({ description: 'Insufficient role' })
  @ApiOkResponse({ type: ListProductNamesDropdownResponseDto })
  async findCatalogueProductNameDropdown(
    @CurrentUser() currentUser: ICurrentUser,
    @Query() dto: FilterDropdownReqDto,
  ): Promise<ResponseResult<string[], IPaginationMeta>> {
    return this.simulationService.findCatalogueProductNameDropdown(currentUser, dto);
  }

  @Get(SimulationConstants.ROUTES.SIMULATIONS_BY_UNIT)
  @RequiredRoles(RoleSlug.EDUCATOR, RoleSlug.DISTRICT_ADMIN)
  @ApiForbiddenResponse({ description: 'Insufficient role' })
  @ApiOkResponse({ type: GetSimulationsByUnitResponseDto })
  async findByUnitId(
    @CurrentUser() currentUser: ICurrentUser,
    @Param('id') id: string,
  ): Promise<ResponseResult<SimulationByUnitResDto[]>> {
    return this.simulationService.findByUnitId(currentUser, id);
  }
}
