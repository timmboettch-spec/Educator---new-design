import { Unit } from 'src/database/entities';

export interface PaginatedUnitsParams {
  page?: number;
  pageSize?: number;
  search?: string;
}

export interface UnitWithScenarioCount extends Unit {
  scenarioCount: number;
}

export interface PaginatedUnitsResult {
  items: UnitWithScenarioCount[];
  total: number;
  page: number;
  pageSize: number;
}

export interface UnitDropdownItem {
  unitId: string;
  id: string;
  name: string;
}

export interface DropdownUnitsResult {
  items: UnitDropdownItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface UnitScopeDropdownItem {
  id: string;
  name: string;
}
