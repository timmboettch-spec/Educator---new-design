import type { Simulation } from '@/types/simulation.types';
import type { LibraryFilters } from '@/utils/libraryFilters';
import { sanitizeCategory } from '@/utils/normalizeSectionItem';
import { sanitizeDuration } from '@/utils/sanitizeDuration';
import { compact } from '../classes/classesService';
import {
  LibraryDifficulty,
  LibraryLearnerLevel,
  LibraryModality,
  type FilterDropdownReqDto,
  type ListMyLibraryReqDto,
  type MyLibraryItemResDto,
} from './myLibrary.types';

export { getApiErrorMessage } from '../classes/classesService';

/** The BE refuses a longer search with a 400 (the list and the dropdowns). */
export const MY_LIBRARY_SEARCH_MAX_LENGTH = 100;

/** Target Audience, Required Product Name and Unit each take at most this many values (more is a 400). */
export const MY_LIBRARY_FILTER_MAX_VALUES = 20;

/** Dropdown options per page (the BE allows up to 500). */
export const FILTER_DROPDOWN_PAGE_SIZE = 100;

/**
 * Units per page: the BE's maximum, so one page holds every unit of a real
 * library. An older link's unit name is only matched against units loaded so
 * far, and the list stops waiting once the first page answers.
 */
export const UNIT_DROPDOWN_PAGE_SIZE = 500;

const toSearchParam = (search: string) =>
  search.trim().replace(/\s+/g, ' ').slice(0, MY_LIBRARY_SEARCH_MAX_LENGTH);

/** The only values the list API accepts for these filters (any other is a 400). */
export const LIBRARY_FIXED_FILTER_VALUES = {
  learnerLevel: Object.values(LibraryLearnerLevel),
  modality: Object.values(LibraryModality),
  difficulty: Object.values(LibraryDifficulty),
};

export type LibraryFixedFilterField = keyof typeof LIBRARY_FIXED_FILTER_VALUES;

/**
 * Maps values (e.g. from a URL) onto a fixed BE set, ignoring case. Values
 * outside it are dropped: the BE answers them with a 400, and an old or
 * hand-edited URL should not break the page.
 */
const toEnumValues = <T extends string>(
  allowed: readonly T[],
  values: string[]
): T[] => {
  const byKey = new Map(allowed.map((v) => [v.toLowerCase(), v]));
  const result = values
    .map((value) => byKey.get(value.trim().toLowerCase()))
    .filter((value): value is T => value !== undefined);
  return [...new Set(result)];
};

/** A fixed filter's values in the BE's casing, without any it doesn't accept. */
export const toFixedFilterValues = (
  field: LibraryFixedFilterField,
  values: string[]
): string[] => toEnumValues<string>(LIBRARY_FIXED_FILTER_VALUES[field], values);

/**
 * A free-text filter's values, trimmed, without blanks or repeats, and capped
 * at the BE's limit: a hand-edited URL with more would otherwise get a 400.
 * (The filter panel stops the educator from applying more.)
 */
export const toFreeTextValues = (values: string[]) =>
  [...new Set(values.map((value) => value.trim()).filter(Boolean))].slice(
    0,
    MY_LIBRARY_FILTER_MAX_VALUES
  );

/**
 * Query params for the My Library list from the page's applied filters and
 * search. Empty filters are left out, `unit` (a unit id) is sent as `unitId`,
 * and Duration is not sent: the BE has no duration filter yet.
 */
export const buildListMyLibraryParams = (
  filters: LibraryFilters,
  search: string
): Omit<ListMyLibraryReqDto, 'page'> =>
  compact({
    search: toSearchParam(search),
    learnerLevel: toEnumValues(
      LIBRARY_FIXED_FILTER_VALUES.learnerLevel,
      filters.learnerLevel
    ),
    targetAudience: toFreeTextValues(filters.targetAudience),
    modality: toEnumValues(
      LIBRARY_FIXED_FILTER_VALUES.modality,
      filters.modality
    ),
    productName: toFreeTextValues(filters.productName),
    difficulty: toEnumValues(
      LIBRARY_FIXED_FILTER_VALUES.difficulty,
      filters.difficulty
    ),
    unitId: toFreeTextValues(filters.unit),
  });

/** Args for one filter dropdown's options, searched on the server. */
export const buildFilterDropdownArg = (
  search: string,
  pageSize = FILTER_DROPDOWN_PAGE_SIZE
): Omit<FilterDropdownReqDto, 'page'> =>
  compact({
    pageSize,
    search: toSearchParam(search),
  });

/**
 * One library entry in the shape the grid and cards already render. The id is
 * the simulation's (what details, assign and remove use), not the entry's.
 */
export const toLibrarySimulation = (item: MyLibraryItemResDto): Simulation => {
  const { scenario, unit } = item;
  const audience = (scenario.learnerLevel ?? '').trim();
  return {
    id: scenario.id,
    simulation_id: scenario.id,
    scenario_id: scenario.id,
    title: scenario.title ?? '',
    unit: item.unitId,
    unit_name: unit?.name ?? '',
    // The BE sends the two separately. An estimate with no usable duration in
    // it (e.g. "Varies by learner pacing") also falls back to the allotment.
    duration:
      sanitizeDuration(scenario.estimatedDuration) ||
      sanitizeDuration(scenario.timeAllotment),
    image: scenario.scenarioImage || unit?.imageUrl || '',
    description: scenario.description ?? '',
    assigned: false,
    rating: 0,
    difficulty: scenario.difficulty ?? '',
    learnerLevel: audience,
    targetAudience: audience,
    learningObjectives: scenario.learningObjectives ?? [],
    productName: (scenario.productName ?? '').trim(),
    clinicalSetting: sanitizeCategory(scenario.clinicalSetting),
    avatarEnabled: scenario.avatarEnabled,
  };
};
