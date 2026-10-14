import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ActiveFilter } from '../components/common/FilterChips';
import {
  setAppliedFilters,
  type CatalogFilters,
  type FilterField,
  type SectionItem,
} from '../redux/simulation/FetchSimulationCatalogRedux';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { getCatalogItemProduct } from '../utils/catalogFilters';
import {
  DEFAULT_DIFFICULTIES,
  DURATION_RANGES,
  EMPTY_LIBRARY_FILTERS,
  LEARNER_LEVELS,
  LIBRARY_FILTER_FIELDS,
  MODALITIES,
  countActiveFilters,
  uniqueSorted,
  type LibraryFilterField,
} from '../utils/libraryFilters';
import type { LibraryFilterOption } from './useLibraryFilters';
import {
  useSimulationDurationLabel,
  useSimulationValueLabel,
} from './useSimulationValueLabel';

const CHIP_SEPARATOR = '::';
const NO_API_FIELDS: FilterField[] = [];

const isFilterField = (value: string): value is LibraryFilterField =>
  LIBRARY_FILTER_FIELDS.some((field) => field === value);

const sameValue = (a: string, b: string) =>
  a.trim().toLowerCase() === b.trim().toLowerCase();

const toggleValue = (values: string[], value: string) =>
  values.some((v) => sameValue(v, value))
    ? values.filter((v) => !sameValue(v, value))
    : [...values, value];

/**
 * Catalogue filter controls, whatever stores the applied filters. Uses the
 * same fields and quick filters as the library; the panel's draft values and
 * open state are local. Quick filters, the panel and the chips all read and
 * write the same applied filters, so they never disagree.
 *
 * `apiFields` are the filter options the catalogue API returns; fields it
 * doesn't cover are derived from the items or fixed lists. Unit options are
 * the units' display names from `resolveUnitName`, never raw unit ids.
 */
function useCatalogFilterControls(
  items: SectionItem[],
  apiFields: FilterField[],
  resolveUnitName: (item: SectionItem) => string,
  applied: CatalogFilters,
  writeApplied: (next: CatalogFilters) => void
) {
  const { t } = useTranslation('common');
  const valueLabel = useSimulationValueLabel();
  const durationLabel = useSimulationDurationLabel();

  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [pending, setPending] = useState<CatalogFilters>(applied);

  const fieldLabel = useCallback(
    (field: LibraryFilterField) => t(`simulationFilters.fields.${field}`),
    [t]
  );

  const options = useMemo((): Record<
    LibraryFilterField,
    LibraryFilterOption[]
  > => {
    const toOptions = (values: readonly string[]) =>
      values.map((value) => ({ value, label: valueLabel(value) }));
    // The API's options for a field, else the values found on the items.
    const optionsFor = (key: string, fromItems: (string | undefined)[]) => {
      const fromApi = uniqueSorted(
        apiFields.find((f) => f.key === key)?.options ?? []
      );
      return fromApi.length ? fromApi : uniqueSorted(fromItems);
    };
    const difficulties = optionsFor(
      'difficulty',
      items.map((item) => item.difficulty)
    );
    return {
      learnerLevel: toOptions(LEARNER_LEVELS),
      targetAudience: toOptions(
        optionsFor(
          'targetAudience',
          items.flatMap((item) => item.targetAudience ?? [])
        )
      ),
      modality: toOptions(MODALITIES),
      productName: toOptions(uniqueSorted(items.map(getCatalogItemProduct))),
      difficulty: toOptions(
        difficulties.length ? difficulties : DEFAULT_DIFFICULTIES
      ),
      unit: toOptions(uniqueSorted(items.map(resolveUnitName))),
      duration: DURATION_RANGES.map((value) => ({
        value,
        label: durationLabel(value),
      })),
    };
  }, [items, apiFields, resolveUnitName, valueLabel, durationLabel]);

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
    writeApplied(pending);
    setIsPanelOpen(false);
  }, [pending, writeApplied]);

  const resetFilters = useCallback(() => {
    writeApplied(EMPTY_LIBRARY_FILTERS);
    setPending(EMPTY_LIBRARY_FILTERS);
  }, [writeApplied]);

  const chips = useMemo(
    (): ActiveFilter[] =>
      LIBRARY_FILTER_FIELDS.flatMap((field) =>
        applied[field].map((value) => ({
          key: `${field}${CHIP_SEPARATOR}${value}`,
          label: fieldLabel(field),
          value,
          displayValue:
            field === 'duration' ? durationLabel(value) : valueLabel(value),
        }))
      ),
    [applied, fieldLabel, valueLabel, durationLabel]
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
    pending,
    options,
    chips,
    activeCount: countActiveFilters(applied),
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

/** What the catalogue's filter controls (buttons, panel, chips) work with. */
export type CatalogFilterControls = ReturnType<typeof useCatalogFilterControls>;

/**
 * The catalogue page's filters. Applied filters live in Redux so they survive
 * a trip to a simulation's details page and back.
 */
export function useCatalogFilters(
  items: SectionItem[],
  apiFields: FilterField[],
  resolveUnitName: (item: SectionItem) => string
) {
  const dispatch = useAppDispatch();
  const applied = useAppSelector(
    (state) => state.simulationCatalog.appliedFilters
  );
  const writeApplied = useCallback(
    (next: CatalogFilters) => dispatch(setAppliedFilters(next)),
    [dispatch]
  );
  return useCatalogFilterControls(
    items,
    apiFields,
    resolveUnitName,
    applied,
    writeApplied
  );
}

/**
 * Filters local to one screen, e.g. an opened simulation pack or unit: they
 * start empty and are forgotten when the screen closes. Options come from the
 * screen's own items.
 */
export function useLocalCatalogFilters(
  items: SectionItem[],
  resolveUnitName: (item: SectionItem) => string
) {
  const [applied, setApplied] = useState<CatalogFilters>(EMPTY_LIBRARY_FILTERS);
  return useCatalogFilterControls(
    items,
    NO_API_FIELDS,
    resolveUnitName,
    applied,
    setApplied
  );
}
