import { ClassSimulationSortField } from '../constants';

/** `ClassSimulationRepository.findForClassListing()` sort/pagination params and result. */
export interface IClassSimulationListingSort {
  field: ClassSimulationSortField;
  direction: 'ASC' | 'DESC';
}

export interface IClassSimulationListingPagination {
  skip: number;
  take: number;
}

export interface IClassSimulationListingRow {
  classSimulationId: string;
  simId: string;
  simName: string | null;
  isArchived: boolean;
  startDate: string | null;
  dueDate: string | null;
  closeDate: string | null;
  startedCount: number;
  completedCount: number;
  averageScore: number | null;
  avatarEnabled: boolean | null;
  unitId: string | null;
  unitName: string | null;
}

/** Raw `getRawMany()` shape — snake_case SELECT aliases (unquoted aliases are ORDER BY-able);
 * Postgres returns `COUNT`/`ROUND` as strings. */
export interface IClassSimulationListingRawRow {
  class_simulation_id: string;
  sim_id: string;
  sim_name: string | null;
  is_archived: boolean;
  start_date: string | null;
  due_date: string | null;
  close_date: string | null;
  started_count: string;
  completed_count: string;
  average_score: string | null;
  avatar_enabled: boolean | null;
  unit_id: string | null;
  unit_name: string | null;
}

export interface IClassSimulationListingResult {
  rows: IClassSimulationListingRow[];
  total: number;
}
