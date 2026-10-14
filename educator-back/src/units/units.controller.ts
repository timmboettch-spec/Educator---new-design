import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiForbiddenResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { RequiredRoles } from 'src/common/decorators/required-roles.decorator';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import type { ICurrentUser } from 'src/common/interfaces';
import { ResponseResult } from 'src/common/class/response.class';
import { IPaginationMeta } from 'src/common/interfaces/pagination.interface';
import { RoleSlug, UnitConstants } from 'src/common/constants';
import {
  ListUnitsScopeDropdownResponseDto,
  UnitScopeDropdownItemResDto,
} from './dto/scope-dropdown-units.dto';
import { FilterDropdownReqDto } from 'src/common/dtos/simulation.dto';
import { UnitsService } from './units.service';
import { CreateUnitReqDto, CreateUnitResDto, CreateUnitResponseDto } from './dto/create-unit.dto';
import { UpdateUnitReqDto, UpdateUnitResDto, UpdateUnitResponseDto } from './dto/update-unit.dto';
import { GetUnitResDto, GetUnitResponseDto } from './dto/get-unit.dto';
import { ListUnitsReqDto, ListUnitsResponseDto, UnitListItemResDto } from './dto/list-units.dto';
import {
  DropdownUnitsReqDto,
  ListUnitsDropdownResponseDto,
  UnitDropdownItemResDto,
} from './dto/dropdown-units.dto';
import { DeleteUnitResponseDto } from './dto/delete-unit.dto';

@ApiTags(UnitConstants.SWAGGER.TAG)
@Controller(UnitConstants.ROUTES.BASE)
export class UnitsController {
  constructor(private readonly unitsService: UnitsService) {}

  @Get()
  @RequiredRoles(RoleSlug.SCENARIO_ADMIN)
  @ApiOkResponse({ type: ListUnitsResponseDto })
  async findAll(
    @CurrentUser() currentUser: ICurrentUser,
    @Query() dto: ListUnitsReqDto,
  ): Promise<ResponseResult<UnitListItemResDto[], IPaginationMeta>> {
    return this.unitsService.findAll(currentUser, dto);
  }

  @Get(UnitConstants.ROUTES.DROPDOWN)
  @RequiredRoles(RoleSlug.SCENARIO_ADMIN)
  @ApiOkResponse({ type: ListUnitsDropdownResponseDto })
  async findDropdown(
    @CurrentUser() currentUser: ICurrentUser,
    @Query() dto: DropdownUnitsReqDto,
  ): Promise<ResponseResult<UnitDropdownItemResDto[], IPaginationMeta>> {
    return this.unitsService.findForDropdown(currentUser, dto);
  }

  @Get(UnitConstants.ROUTES.MY_LIBRARY_DROPDOWN)
  @RequiredRoles(RoleSlug.EDUCATOR)
  @ApiForbiddenResponse({ description: 'Insufficient role' })
  @ApiOkResponse({ type: ListUnitsScopeDropdownResponseDto })
  async findLibraryDropdown(
    @CurrentUser() currentUser: ICurrentUser,
    @Query() dto: FilterDropdownReqDto,
  ): Promise<ResponseResult<UnitScopeDropdownItemResDto[], IPaginationMeta>> {
    return this.unitsService.findLibraryDropdown(currentUser, dto);
  }

  @Get(UnitConstants.ROUTES.CATALOG_DROPDOWN)
  @RequiredRoles(RoleSlug.EDUCATOR)
  @ApiForbiddenResponse({ description: 'Insufficient role' })
  @ApiOkResponse({ type: ListUnitsScopeDropdownResponseDto })
  async findCatalogueDropdown(
    @CurrentUser() currentUser: ICurrentUser,
    @Query() dto: FilterDropdownReqDto,
  ): Promise<ResponseResult<UnitScopeDropdownItemResDto[], IPaginationMeta>> {
    return this.unitsService.findCatalogueDropdown(currentUser, dto);
  }

  @Get(':unitId')
  @RequiredRoles(RoleSlug.SCENARIO_ADMIN)
  @ApiOkResponse({ type: GetUnitResponseDto })
  async findOne(
    @CurrentUser() currentUser: ICurrentUser,
    @Param('unitId', ParseUUIDPipe) unitId: string,
  ): Promise<ResponseResult<GetUnitResDto>> {
    return this.unitsService.findOne(currentUser, unitId);
  }

  @Post()
  @RequiredRoles(RoleSlug.SCENARIO_ADMIN)
  @ApiOkResponse({ type: CreateUnitResponseDto })
  async create(
    @CurrentUser() currentUser: ICurrentUser,
    @Body() dto: CreateUnitReqDto,
  ): Promise<ResponseResult<CreateUnitResDto>> {
    return this.unitsService.create(currentUser, dto);
  }

  @Patch(':unitId')
  @RequiredRoles(RoleSlug.SCENARIO_ADMIN)
  @ApiOkResponse({ type: UpdateUnitResponseDto })
  async update(
    @CurrentUser() currentUser: ICurrentUser,
    @Param('unitId', ParseUUIDPipe) unitId: string,
    @Body() dto: UpdateUnitReqDto,
  ): Promise<ResponseResult<UpdateUnitResDto>> {
    return this.unitsService.update(currentUser, unitId, dto);
  }

  @Delete(':unitId')
  @RequiredRoles(RoleSlug.SCENARIO_ADMIN)
  @ApiOkResponse({ type: DeleteUnitResponseDto })
  async remove(
    @CurrentUser() currentUser: ICurrentUser,
    @Param('unitId', ParseUUIDPipe) unitId: string,
  ): Promise<ResponseResult<null>> {
    return this.unitsService.remove(currentUser, unitId);
  }
}
