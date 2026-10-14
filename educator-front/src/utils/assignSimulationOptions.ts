import dayjs from 'dayjs';
import type { MultiSelectOption } from '../components/ui/MultiSelect';
import { getSchoolGroupId } from '../redux/api/classes/classesService';
import type { Simulation } from '../redux/dashboard/simulationlibrary/GetSimulationRedux';
import type { Class } from '../types/Class_types';
import type { AssignContextClass } from '../types/simulationAssignment.types';
import type { AiSeats } from './normalizeAuthUser';
import {
  getSimulationLevel,
  getSimulationModality,
  LEARNER_LEVELS,
  MODALITIES,
} from './libraryFilters';
import { parseSimDate, toIsoSimDate } from './simAssignment';
import { isAISimulation } from './simulationType';

/** A class-table row as the class the assign modal is opened from. */
export const toAssignContextClass = (
  row: Pick<
    Class,
    | 'id'
    | 'class_name'
    | 'start_date'
    | 'end_date'
    | 'school_id'
    | 'school_name'
    | 'studentsCount'
    | 'students'
  >
): AssignContextClass => ({
  id: row.id,
  name: row.class_name,
  startDate: row.start_date ?? '',
  endDate: row.end_date ?? '',
  studentsCount: row.studentsCount ?? row.students?.length ?? 0,
  schoolId: getSchoolGroupId(row.school_id),
  schoolName: row.school_name ?? '',
});

export type LearnerLevel = (typeof LEARNER_LEVELS)[number];
export type SimulationModality = (typeof MODALITIES)[number];

/** The modality and learner level the modal filters by; '' = any. */
export interface SimulationFilterValues {
  modality: SimulationModality | '';
  learnerLevel: LearnerLevel | '';
}

export const EMPTY_SIMULATION_FILTERS: SimulationFilterValues = {
  modality: '',
  learnerLevel: '',
};

export const isSimulationModality = (
  value: string
): value is SimulationModality =>
  MODALITIES.some((modality) => modality === value);

export const isLearnerLevel = (value: string): value is LearnerLevel =>
  LEARNER_LEVELS.some((level) => level === value);

/**
 * Library simulations matching the modality and learner level filters, A–Z.
 * Uses the library page's own bucketing so both screens agree.
 */
export const buildSimulationOptions = (
  simulations: Simulation[],
  { modality, learnerLevel }: SimulationFilterValues = EMPTY_SIMULATION_FILTERS
): MultiSelectOption[] =>
  simulations
    .filter(
      (sim) =>
        !!sim.id &&
        (!modality || getSimulationModality(sim) === modality) &&
        (!learnerLevel || getSimulationLevel(sim) === learnerLevel)
    )
    .map((sim) => ({ value: sim.id, label: sim.title || sim.name || sim.id }))
    .sort((a, b) => a.label.localeCompare(b.label));

export type SeatShortfall =
  | { kind: 'noProduct' }
  | { kind: 'insufficient'; remaining: number; needed: number };

/**
 * Whether the educator's avatar seats can't cover the assignment: each avatar
 * simulation takes one seat per student in every selected class. Unknown
 * seats (`null`, an older session) skip the check; the BE still enforces it.
 */
export const getSeatShortfall = (
  simulations: Pick<Simulation, 'avatarEnabled'>[],
  studentCounts: number[],
  seats: AiSeats | null
): SeatShortfall | null => {
  const avatarCount = simulations.filter((sim) =>
    isAISimulation(sim.avatarEnabled)
  ).length;
  if (!seats || avatarCount === 0 || studentCounts.length === 0) return null;
  if (seats.total === 0) return { kind: 'noProduct' };
  const needed =
    avatarCount * studentCounts.reduce((sum, count) => sum + count, 0);
  return needed > seats.available
    ? { kind: 'insufficient', remaining: seats.available, needed }
    : null;
};

export type AssignmentConflict = 'active' | 'previous';

/**
 * Whether any selected simulation is already assigned to the class:
 * `active` when that assignment hasn't closed yet (it is still open on its
 * end date, as in `getAssignmentTimeStatus`), `previous` otherwise.
 */
export const findAssignmentConflict = (
  classAssignments: { simulation_id: string; end_date?: string }[],
  simulationIds: string[],
  today: dayjs.Dayjs
): AssignmentConflict | null => {
  const matches = classAssignments.filter((assignment) =>
    simulationIds.includes(assignment.simulation_id)
  );
  if (matches.length === 0) return null;
  const isActive = matches.some((assignment) => {
    const end = parseSimDate(assignment.end_date);
    return !!end?.isValid() && !end.isBefore(today, 'day');
  });
  return isActive ? 'active' : 'previous';
};

/** A class's date as YYYY-MM-DD, moved up to today if it has passed. */
export const toAssignableStartDate = (
  raw: string | undefined,
  today: dayjs.Dayjs
): string => {
  const date = toIsoSimDate(raw);
  const todayIso = today.format('YYYY-MM-DD');
  return date && date < todayIso ? todayIso : date;
};
