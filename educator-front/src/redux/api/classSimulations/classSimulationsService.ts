import type { SimulationItem } from '../../../types';
import type { SimStats } from '../../../utils/simAssignment';
import type { SortDir } from '../classes/classes.types';
import { compact } from '../classes/classesService';
import type { ClassSimulationsInfiniteArg } from './classSimulationsApi';
import type {
  BulkAssignClassSimulationsReqDto,
  ClassSimulationListItemResDto,
  ClassSimulationSortField,
} from './classSimulations.types';

export { getApiErrorMessage } from '../classes/classesService';

/** Assignments per page; the next page loads as the table scrolls. */
export const CLASS_SIMULATIONS_PAGE_SIZE = 10;

const EMPTY_CELL = '-';

/** Args for one class's assignments; no sort keeps the BE default (simName asc). */
export const buildClassSimulationsInfiniteArg = (
  classId: string,
  sortBy?: ClassSimulationSortField,
  sortDir?: SortDir
): ClassSimulationsInfiniteArg =>
  compact({
    classId,
    pageSize: CLASS_SIMULATIONS_PAGE_SIZE,
    sortBy,
    sortDir: sortBy ? sortDir : undefined,
  });

/**
 * A BE assignment in the legacy `SimulationItem` shape the row, the Reports
 * button and the assignment modals already read. `avatarEnabled` drives the
 * Delete token deduction and the Edit category; the unit is shown in Edit.
 */
export const mapClassSimulationToSimItem = (
  dto: ClassSimulationListItemResDto,
  classId: string
): SimulationItem => ({
  id: dto.classSimulationId,
  simulation_id: dto.simId,
  simulation_title: dto.simName ?? '',
  simulation_lib_name: '',
  unit: dto.unitId ?? '',
  unit_name: dto.unitName ?? '',
  start_date: dto.startDate ?? '',
  due_date: dto.dueDate ?? '',
  end_date: dto.closeDate ?? '',
  class_id: classId,
  class_name: '',
  user_id: '',
  image_url: '',
  created_at: '',
  email: '',
  avatarEnabled: dto.avatarEnabled ?? undefined,
  scenario_status: dto.isArchived ? 'ARCHIVED' : null,
});

/** The BE's started / completed / average counts as the row shows them. */
export const mapClassSimulationStats = (
  dto: ClassSimulationListItemResDto
): SimStats => ({
  started: dto.startedCount,
  completed: dto.completedCount,
  avgScore: dto.averageScore === null ? EMPTY_CELL : `${dto.averageScore}%`,
});

/** The assignment dates a row can edit, by their `SimulationItem` key. */
export type SimDateField = 'start_date' | 'due_date' | 'end_date';

/**
 * The bulk assign body from the assign form: only the fields the BE accepts,
 * since it rejects the request on any unknown field.
 */
export const buildBulkAssignBody = ({
  schoolId,
  classIds,
  simulationIds,
  startDate,
  dueDate,
  endDate,
}: BulkAssignClassSimulationsReqDto): BulkAssignClassSimulationsReqDto => ({
  schoolId,
  classIds,
  simulationIds,
  startDate,
  dueDate,
  endDate,
});
