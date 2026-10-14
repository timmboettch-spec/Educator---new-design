import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Unit } from 'src/database/entities';
import { SimulationV2Repository, UnitRepository } from 'src/database/repositories';
import { SIMULATION_V2_REPOSITORY, UNIT_REPOSITORY } from 'src/database/tokens';
import { ResponseResult } from 'src/common/class/response.class';
import {
  FilterDropdownPage,
  FilterDropdownParams,
  ICurrentUser,
  UnitScopeDropdownItem,
} from 'src/common/interfaces';
import { IPaginationMeta } from 'src/common/interfaces/pagination.interface';
import { ERROR_MSG } from 'src/common/messages/error.message';
import { SUCCESS_MSG } from 'src/common/messages/success.message';
import { assertEducator } from 'src/common/utils/current-user.util';
import { buildPaginationMeta } from 'src/common/utils/pagination.util';
import { readFilterDropdownPage } from 'src/common/utils/simulation.util';
import { handleError } from 'src/common/utils/common.util';
import { CreateUnitReqDto, CreateUnitResDto } from './dto/create-unit.dto';
import { UpdateUnitReqDto, UpdateUnitResDto } from './dto/update-unit.dto';
import { GetUnitResDto } from './dto/get-unit.dto';
import { ListUnitsReqDto, UnitListItemResDto } from './dto/list-units.dto';
import { DropdownUnitsReqDto, UnitDropdownItemResDto } from './dto/dropdown-units.dto';
import { UnitScopeDropdownItemResDto } from './dto/scope-dropdown-units.dto';
import { FilterDropdownReqDto } from 'src/common/dtos/simulation.dto';

@Injectable()
export class UnitsService {
  constructor(
    @Inject(UNIT_REPOSITORY) private readonly unitRepository: UnitRepository,
    @Inject(SIMULATION_V2_REPOSITORY)
    private readonly simulationV2Repository: SimulationV2Repository,
  ) {}

  private toGetUnitResDto(unit: Unit): GetUnitResDto {
    return { unitId: unit.unitId, id: unit.id, name: unit.name, imageUrl: unit.imageUrl };
  }

  async findAll(
    _currentUser: ICurrentUser,
    dto: ListUnitsReqDto,
  ): Promise<ResponseResult<UnitListItemResDto[], IPaginationMeta>> {
    try {
      const { items, total, page, pageSize } = await this.unitRepository.findAndCountPaginated({
        page: dto.page,
        pageSize: dto.pageSize,
        search: dto.search,
      });

      return new ResponseResult({
        message: SUCCESS_MSG.COMMON.FETCHED('Units'),
        data: items,
        meta: buildPaginationMeta(total, page, pageSize),
      });
    } catch (error) {
      return handleError(error);
    }
  }

  async findForDropdown(
    _currentUser: ICurrentUser,
    dto: DropdownUnitsReqDto,
  ): Promise<ResponseResult<UnitDropdownItemResDto[], IPaginationMeta>> {
    try {
      const { items, total, page, pageSize } = await this.unitRepository.findForDropdown({
        page: dto.page,
        pageSize: dto.pageSize,
        search: dto.search,
      });

      return new ResponseResult({
        message: SUCCESS_MSG.COMMON.FETCHED('Units'),
        data: items,
        meta: buildPaginationMeta(total, page, pageSize),
      });
    } catch (error) {
      return handleError(error);
    }
  }

  /** The Units the Unit filter offers for My Library (the Educator's own saved Simulations). */
  async findLibraryDropdown(
    currentUser: ICurrentUser,
    dto: FilterDropdownReqDto,
  ): Promise<ResponseResult<UnitScopeDropdownItemResDto[], IPaginationMeta>> {
    return this.findScopeDropdown(currentUser, dto, (params) =>
      this.unitRepository.findLibraryDropdownPage(params),
    );
  }

  /** The Units the Unit filter offers for the Catalogue (every visible Simulation). */
  async findCatalogueDropdown(
    currentUser: ICurrentUser,
    dto: FilterDropdownReqDto,
  ): Promise<ResponseResult<UnitScopeDropdownItemResDto[], IPaginationMeta>> {
    return this.findScopeDropdown(currentUser, dto, (params) =>
      this.unitRepository.findCatalogueDropdownPage(params),
    );
  }

  private async findScopeDropdown(
    currentUser: ICurrentUser,
    dto: FilterDropdownReqDto,
    read: (params: FilterDropdownParams) => Promise<FilterDropdownPage<UnitScopeDropdownItem>>,
  ): Promise<ResponseResult<UnitScopeDropdownItemResDto[], IPaginationMeta>> {
    try {
      assertEducator(currentUser);

      const { items, meta } = await readFilterDropdownPage(currentUser.educatorId, dto, read);

      return new ResponseResult({
        message: SUCCESS_MSG.COMMON.FETCHED('Units'),
        data: items,
        meta,
      });
    } catch (error) {
      return handleError(error);
    }
  }

  async findOne(
    _currentUser: ICurrentUser,
    unitId: string,
  ): Promise<ResponseResult<GetUnitResDto>> {
    try {
      const unit = await this.unitRepository.findByIdWithSelect(unitId, {
        unitId: true,
        id: true,
        name: true,
        imageUrl: true,
      });
      if (!unit) {
        throw new NotFoundException(ERROR_MSG.DB.NOT_FOUND('Unit'));
      }

      return new ResponseResult({
        message: SUCCESS_MSG.COMMON.FETCHED('Unit'),
        data: this.toGetUnitResDto(unit),
      });
    } catch (error) {
      return handleError(error);
    }
  }

  async create(
    _currentUser: ICurrentUser,
    dto: CreateUnitReqDto,
  ): Promise<ResponseResult<CreateUnitResDto>> {
    try {
      const existingById = await this.unitRepository.findByBusinessId(dto.id);
      if (existingById) {
        throw new BadRequestException(ERROR_MSG.DB.DUPLICATE_ENTRY('Unit id'));
      }

      const existingByName = await this.unitRepository.findUniqueByName(dto.name);
      if (existingByName) {
        throw new BadRequestException(ERROR_MSG.DB.DUPLICATE_ENTRY('Unit name'));
      }

      const unit = await this.unitRepository.create(dto);

      return new ResponseResult({
        message: SUCCESS_MSG.COMMON.CREATED('Unit'),
        data: this.toGetUnitResDto(unit),
      });
    } catch (error) {
      return handleError(error);
    }
  }

  async update(
    _currentUser: ICurrentUser,
    unitId: string,
    dto: UpdateUnitReqDto,
  ): Promise<ResponseResult<UpdateUnitResDto>> {
    try {
      const existing = await this.unitRepository.findById(unitId);
      if (!existing) {
        throw new NotFoundException(ERROR_MSG.DB.NOT_FOUND('Unit'));
      }

      if (dto.name !== undefined) {
        const existingByName = await this.unitRepository.findUniqueByName(dto.name);
        if (existingByName && existingByName.unitId !== unitId) {
          throw new BadRequestException(ERROR_MSG.DB.DUPLICATE_ENTRY('Unit name'));
        }
      }

      const updated = await this.unitRepository.updateById(unitId, dto);
      if (!updated) {
        throw new NotFoundException(ERROR_MSG.DB.NOT_FOUND('Unit'));
      }

      return new ResponseResult({
        message: SUCCESS_MSG.COMMON.UPDATED('Unit'),
        data: this.toGetUnitResDto(updated),
      });
    } catch (error) {
      return handleError(error);
    }
  }

  async remove(_currentUser: ICurrentUser, unitId: string): Promise<ResponseResult<null>> {
    try {
      const existing = await this.unitRepository.findById(unitId);
      if (!existing) {
        throw new NotFoundException(ERROR_MSG.DB.NOT_FOUND('Unit'));
      }

      const scenarioCount = await this.simulationV2Repository.countSimulationByUnitId(existing.id);
      if (scenarioCount > 0) {
        throw new BadRequestException(ERROR_MSG.COMMON.BAD_REQUEST);
      }

      await this.unitRepository.softDelete(unitId);

      return new ResponseResult({ message: SUCCESS_MSG.COMMON.DELETED('Unit'), data: null });
    } catch (error) {
      return handleError(error);
    }
  }
}
