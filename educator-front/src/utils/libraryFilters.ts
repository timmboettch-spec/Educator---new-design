import type { Simulation } from '@/types/simulation.types';

/** Fields the library can be filtered on, in panel order. */
export const LIBRARY_FILTER_FIELDS = [
  'learnerLevel',
  'targetAudience',
  'modality',
  'productName',
  'difficulty',
  'unit',
  'duration',
] as const;

export type LibraryFilterField = (typeof LIBRARY_FILTER_FIELDS)[number];

/**
 * The fields My Library filters on, in panel order: the ones the paged list
 * API can filter by. Duration waits for the BE to support it.
 */
export const LIBRARY_SERVER_FILTER_FIELDS = LIBRARY_FILTER_FIELDS.filter(
  (field): field is Exclude<LibraryFilterField, 'duration'> =>
    field !== 'duration'
);

export type LibraryFilters = Record<LibraryFilterField, string[]>;

export const EMPTY_LIBRARY_FILTERS: LibraryFilters = {
  learnerLevel: [],
  targetAudience: [],
  modality: [],
  productName: [],
  difficulty: [],
  unit: [],
  duration: [],
};

export const LEARNER_LEVELS = ['Secondary', 'Post-Secondary'] as const;
export const MODALITIES = ['Avatar', 'Workstation'] as const;
export const DEFAULT_DIFFICULTIES = ['Easy', 'Medium', 'Hard'] as const;
export const DURATION_RANGES = [
  '<15 min',
  '15–30 min',
  '30–60 min',
  '60+ min',
] as const;

export type LibrarySortField =
  | 'title'
  | 'learnerLevel'
  | 'targetAudience'
  | 'modality'
  | 'productName'
  | 'difficulty'
  | 'duration';

export type SortDirection = 'asc' | 'desc' | null;

/**
 * Buckets learner level / target audience text into Secondary or
 * Post-Secondary. Any text that doesn't read as secondary is treated as
 * post-secondary; no text at all has no level.
 */
export const toLearnerLevel = (...texts: (string | undefined)[]): string => {
  const hay = texts
    .map((text) => text ?? '')
    .join(' ')
    .trim()
    .toLowerCase();
  if (!hay) return '';
  if (/post[-\s]?secondary/.test(hay)) return 'Post-Secondary';
  if (/secondary|high school/.test(hay)) return 'Secondary';
  return 'Post-Secondary';
};

/** Avatar when the simulation runs on an AI avatar, otherwise Workstation. */
export const toModality = (avatarEnabled: boolean | undefined): string =>
  avatarEnabled ? 'Avatar' : 'Workstation';

/**
 * Buckets a simulation into Secondary / Post-Secondary from its learner level
 * and target audience text, matching the catalogue.
 */
export const getSimulationLevel = (sim: Simulation): string =>
  toLearnerLevel(sim.learnerLevel, sim.targetAudience);

export const getSimulationModality = (sim: Simulation): string =>
  toModality(sim.avatarEnabled);

export const getSimulationProduct = (sim: Simulation): string =>
  (sim.productName ?? '').trim();

export const getSimulationUnit = (sim: Simulation): string =>
  (sim.unit_name || sim.unit || '').trim();

/**
 * The audience shown in the Target Audience column: the raw target audience,
 * falling back to the learner level (as in the design). Filtering, sorting and
 * the filter options all use this so they agree with what's displayed.
 */
export const getSimulationAudience = (sim: Simulation): string =>
  (sim.targetAudience || sim.learnerLevel || '').trim();

/** Comparison key: BE values vary in case and stray whitespace. */
const normalize = (value: string | undefined) =>
  (value ?? '').trim().toLowerCase();

/** True when nothing is selected, or any candidate matches a selected value. */
export const matchesAny = (
  selected: string[],
  ...candidates: (string | undefined)[]
) =>
  selected.length === 0 ||
  selected.some((value) =>
    candidates.some((candidate) => normalize(candidate) === normalize(value))
  );

/**
 * Distinct, trimmed, sorted values for building filter options. Values that
 * differ only in case ("Easy" / "easy") collapse to the first one seen, since
 * filtering treats them as the same.
 */
export const uniqueSorted = (values: (string | undefined)[]): string[] => {
  const byKey = new Map<string, string>();
  values.forEach((value) => {
    const trimmed = (value ?? '').trim();
    if (trimmed && !byKey.has(trimmed.toLowerCase())) {
      byKey.set(trimmed.toLowerCase(), trimmed);
    }
  });
  return Array.from(byKey.values()).sort();
};

export const countActiveFilters = (filters: LibraryFilters): number =>
  LIBRARY_FILTER_FIELDS.reduce((n, field) => n + filters[field].length, 0);
