import { useCallback, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { ActiveFilter } from '../components/common/FilterChips';
import {
  LIBRARY_FIXED_FILTER_VALUES,
  MY_LIBRARY_FILTER_MAX_VALUES,
  toFixedFilterValues,
  toFreeTextValues,
  type LibraryFixedFilterField,
} from '../redux/api/myLibrary/myLibraryService';
import type { ViewMode } from '../types/simulation.types';
import {
  EMPTY_LIBRARY_FILTERS,
  LIBRARY_FILTER_FIELDS,
  LIBRARY_SERVER_FILTER_FIELDS,
  countActiveFilters,
  type LibraryFilterField,
  type LibraryFilters,
} from '../utils/libraryFilters';
import { useSimulationValueLabel } from './useSimulationValueLabel';

export interface LibraryFilterOption {
  value: string;
  label: string;
}

/** Filters whose options come from the BE's dropdown routes. */
type DropdownFilterField = 'targetAudience' | 'productName' | 'unit';

/** The BE refuses more values than this in one of these filters. */
const CAPPED_FIELDS: readonly DropdownFilterField[] = [
  'targetAudience',
  'productName',
  'unit',
];

export interface UseLibraryFiltersParams {
  /** Unit id → name, for the units loaded so far. */
  unitNames: Record<string, string>;
}

const VIEW_PARAM = 'view';
const CHIP_SEPARATOR = '::';

const isFilterField = (value: string): value is LibraryFilterField =>
  LIBRARY_SERVER_FILTER_FIELDS.some((field) => field === value);

const isFixedField = (
  field: LibraryFilterField
): field is LibraryFixedFilterField => field in LIBRARY_FIXED_FILTER_VALUES;

// A link is read the way the request is built, so the chips and the filter
// count show exactly what the list API filters by. Values it can't filter by
// are ignored rather than shown as chips that do nothing: Duration (no BE
// filter yet), a fixed filter's value outside its set (e.g. an old
// `?difficulty=Beginner`, read in the BE's casing otherwise), and a free-text
// filter's blank or repeated values or those past the BE's limit of 20.
const readFilters = (params: URLSearchParams): LibraryFilters =>
  LIBRARY_SERVER_FILTER_FIELDS.reduce<LibraryFilters>(
    (acc, field) => {
      const values = params.getAll(field);
      return {
        ...acc,
        [field]: isFixedField(field)
          ? toFixedFilterValues(field, values)
          : toFreeTextValues(values),
      };
    },
    { ...EMPTY_LIBRARY_FILTERS }
  );

/**
 * The Unit filter holds unit ids (the list API filters by `unitId`). Links
 * from before that held the unit's name, so a value that is a known unit's
 * name rather than its id is read as that unit's id.
 */
const toUnitIds = (
  values: string[],
  unitNames: Record<string, string>
): string[] => {
  const units = Object.entries(unitNames);
  const ids = values.map((value) => {
    if (value in unitNames) return value;
    const byName = units.find(([, name]) => sameValue(name, value));
    return byName?.[0] ?? value;
  });
  return [...new Set(ids)];
};

// Applied values may come from a URL in any case ("easy" vs "Easy").
const sameValue = (a: string, b: string) =>
  a.trim().toLowerCase() === b.trim().toLowerCase();

const toggleValue = (values: string[], value: string) =>
  values.some((v) => sameValue(v, value))
    ? values.filter((v) => !sameValue(v, value))
    : [...values, value];

/**
 * The library's filter state. Applied filters and the grid/list view live in
 * the URL so they survive a reload and can be shared; the panel's draft values
 * and open state are local. Quick filters, the panel and the chips all read and
 * write the same applied filters, so they never disagree.
 *
 * The list itself is filtered by the API. Options of the fixed filters are
 * here; Unit, Target Audience and Required Product Name options come from
 * the BE's dropdown routes (`useLibraryFilterOptions`), whose unit names are
 * passed in for the chips and for older unit-name links.
 */
export function useLibraryFilters({ unitNames }: UseLibraryFiltersParams) {
  const { t } = useTranslation('common');
  const [searchParams, setSearchParams] = useSearchParams();
  const valueLabel = useSimulationValueLabel();

  const unitName = useCallback(
    (id: string) => unitNames[id] ?? id,
    [unitNames]
  );

  const applied = useMemo((): LibraryFilters => {
    const filters = readFilters(searchParams);
    return { ...filters, unit: toUnitIds(filters.unit, unitNames) };
  }, [searchParams, unitNames]);
  /**
   * A Unit filter value that isn't a known unit's id yet: an old link's unit
   * name read before the units have loaded, or a unit the library no longer
   * has. The list waits for the units rather than send it as an id.
   */
  const hasUnresolvedUnit = applied.unit.some((value) => !(value in unitNames));
  const viewMode: ViewMode =
    searchParams.get(VIEW_PARAM) === 'list' ? 'list' : 'grid';

  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [pending, setPending] = useState<LibraryFilters>(applied);

  const writeApplied = useCallback(
    (next: LibraryFilters) => {
      setSearchParams(
        (prev) => {
          const params = new URLSearchParams(prev);
          LIBRARY_FILTER_FIELDS.forEach((field) => {
            params.delete(field);
            next[field].forEach((value) => params.append(field, value));
          });
          return params;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  const setViewMode = useCallback(
    (mode: ViewMode) => {
      setSearchParams(
        (prev) => {
          const params = new URLSearchParams(prev);
          if (mode === 'list') params.set(VIEW_PARAM, 'list');
          else params.delete(VIEW_PARAM);
          return params;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  const fieldLabel = useCallback(
    (field: LibraryFilterField) => t(`simulationFilters.fields.${field}`),
    [t]
  );

  const toOptions = useCallback(
    (values: readonly string[]): LibraryFilterOption[] =>
      values.map((value) => ({ value, label: valueLabel(value) })),
    [valueLabel]
  );

  // The BE accepts only these values, so they are the options.
  const fixedOptions = useMemo(
    (): Record<LibraryFixedFilterField, LibraryFilterOption[]> => ({
      learnerLevel: toOptions(LIBRARY_FIXED_FILTER_VALUES.learnerLevel),
      modality: toOptions(LIBRARY_FIXED_FILTER_VALUES.modality),
      difficulty: toOptions(LIBRARY_FIXED_FILTER_VALUES.difficulty),
    }),
    [toOptions]
  );

  /** A panel field with more values chosen than the BE accepts, and why. */
  const pendingErrors = useMemo(
    (): Partial<Record<LibraryFilterField, string>> =>
      Object.fromEntries(
        CAPPED_FIELDS.filter(
          (field) => pending[field].length > MY_LIBRARY_FILTER_MAX_VALUES
        ).map((field) => [
          field,
          t('simulationFilters.panel.tooManyValues', {
            count: MY_LIBRARY_FILTER_MAX_VALUES,
          }),
        ])
      ),
    [pending, t]
  );
  const canApply = Object.keys(pendingErrors).length === 0;

  const isQuickActive = useCallback(
    (field: LibraryFilterField, value: string) =>
      applied[field].some((v) => sameValue(v, value)),
    [applied]
  );

  /** Toggles one value and applies it immediately, keeping the panel draft in step. */
  const toggleQuick = useCallback(
    (field: LibraryFilterField, value: string) => {
      const nextValues = toggleValue(applied[field], value);
      writeApplied({ ...applied, [field]: nextValues });
      setPending((prev) => ({ ...prev, [field]: nextValues }));
    },
    [applied, writeApplied]
  );

  const setPendingField = useCallback(
    (field: LibraryFilterField, values: string[]) =>
      setPending((prev) => ({ ...prev, [field]: values })),
    []
  );

  const togglePanel = useCallback(() => {
    setPending(applied);
    setIsPanelOpen((open) => !open);
  }, [applied]);

  /** Closing discards unapplied draft changes. */
  const closePanel = useCallback(() => {
    setPending(applied);
    setIsPanelOpen(false);
  }, [applied]);

  const applyPanel = useCallback(() => {
    if (!canApply) return;
    writeApplied(pending);
    setIsPanelOpen(false);
  }, [canApply, pending, writeApplied]);

  const resetFilters = useCallback(() => {
    writeApplied(EMPTY_LIBRARY_FILTERS);
    setPending(EMPTY_LIBRARY_FILTERS);
  }, [writeApplied]);

  const chips = useMemo(
    (): ActiveFilter[] =>
      LIBRARY_SERVER_FILTER_FIELDS.flatMap((field) =>
        applied[field].map((value) => ({
          key: `${field}${CHIP_SEPARATOR}${value}`,
          label: fieldLabel(field),
          value,
          displayValue: field === 'unit' ? unitName(value) : valueLabel(value),
        }))
      ),
    [applied, fieldLabel, valueLabel, unitName]
  );

  const removeChip = useCallback(
    (key: string) => {
      const separatorAt = key.indexOf(CHIP_SEPARATOR);
      if (separatorAt === -1) return;
      const field = key.slice(0, separatorAt);
      const value = key.slice(separatorAt + CHIP_SEPARATOR.length);
      if (!isFilterField(field)) return;
      const nextValues = applied[field].filter((v) => v !== value);
      writeApplied({ ...applied, [field]: nextValues });
      setPending((prev) => ({ ...prev, [field]: nextValues }));
    },
    [applied, writeApplied]
  );

  return {
    applied,
    hasUnresolvedUnit,
    pending,
    pendingErrors,
    canApply,
    fixedOptions,
    chips,
    activeCount: countActiveFilters(applied),
    viewMode,
    setViewMode,
    isPanelOpen,
    togglePanel,
    closePanel,
    applyPanel,
    resetFilters,
    setPendingField,
    toggleQuick,
    isQuickActive,
    removeChip,
    fieldLabel,
    valueLabel,
  };
}
