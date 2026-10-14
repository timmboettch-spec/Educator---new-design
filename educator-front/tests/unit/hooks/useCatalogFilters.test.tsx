import { configureStore } from '@reduxjs/toolkit';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { I18nextProvider } from 'react-i18next';
import { Provider } from 'react-redux';
import { describe, expect, it } from 'vitest';
import i18n from '../../../src/i18n';
import simulationCatalogReducer, {
  setAppliedFilters,
  type FilterField,
  type SectionItem,
} from '../../../src/redux/simulation/FetchSimulationCatalogRedux';
import {
  useCatalogFilters,
  useLocalCatalogFilters,
} from '../../../src/hooks/useCatalogFilters';
import { EMPTY_LIBRARY_FILTERS } from '../../../src/utils/libraryFilters';

const ITEMS: SectionItem[] = [
  {
    id: 1,
    title: 'Airway',
    image: '',
    cta: 'View',
    productName: 'Baby',
    unit: 'unit-2-id',
  },
  { id: 2, title: 'Burns', image: '', cta: 'View', unit: 'unit-1-id' },
];

const UNIT_NAMES: Record<string, string> = {
  'unit-1-id': 'Unit One',
  'unit-2-id': 'Unit Two',
};
const resolveUnitName = (item: SectionItem) =>
  UNIT_NAMES[item.unit ?? ''] ?? '';

const API_FIELDS: FilterField[] = [
  { key: 'unit', label: 'Unit', options: ['unit-2-id', 'unit-1-id'] },
  { key: 'targetAudience', label: 'Target Audience', options: [] },
];

const buildStore = () =>
  configureStore({ reducer: { simulationCatalog: simulationCatalogReducer } });

const renderFilters = (store = buildStore()) => {
  const view = renderHook(
    () => useCatalogFilters(ITEMS, API_FIELDS, resolveUnitName),
    {
      wrapper: ({ children }: { children: ReactNode }) => (
        <Provider store={store}>
          <I18nextProvider i18n={i18n}>{children}</I18nextProvider>
        </Provider>
      ),
    }
  );
  return { ...view, store };
};

const appliedIn = (store: ReturnType<typeof buildStore>) =>
  store.getState().simulationCatalog.appliedFilters;

describe('useCatalogFilters', () => {
  it('applies a quick filter straight away and shows it as a chip', () => {
    const { result, store } = renderFilters();

    act(() => result.current.toggleQuick('modality', 'Avatar'));

    expect(appliedIn(store).modality).toEqual(['Avatar']);
    expect(result.current.isQuickActive('modality', 'Avatar')).toBe(true);
    expect(result.current.activeCount).toBe(1);
    expect(result.current.chips).toEqual([
      expect.objectContaining({ key: 'modality::Avatar', value: 'Avatar' }),
    ]);
  });

  it('clears a quick filter when it is toggled again', () => {
    const { result, store } = renderFilters();

    act(() => result.current.toggleQuick('difficulty', 'Easy'));
    act(() => result.current.toggleQuick('difficulty', 'Easy'));

    expect(appliedIn(store).difficulty).toEqual([]);
    expect(result.current.isQuickActive('difficulty', 'Easy')).toBe(false);
  });

  it('keeps the panel draft in step with quick filters', () => {
    const { result } = renderFilters();

    act(() => result.current.togglePanel());
    act(() => result.current.toggleQuick('learnerLevel', 'Secondary'));

    expect(result.current.pending.learnerLevel).toEqual(['Secondary']);
  });

  it('only applies panel changes on Apply, and lights the quick filter', () => {
    const { result, store } = renderFilters();

    act(() => result.current.togglePanel());
    act(() => result.current.setPendingField('difficulty', ['Hard']));
    expect(appliedIn(store).difficulty).toEqual([]);

    act(() => result.current.applyPanel());

    expect(appliedIn(store).difficulty).toEqual(['Hard']);
    expect(result.current.isQuickActive('difficulty', 'Hard')).toBe(true);
    expect(result.current.isPanelOpen).toBe(false);
  });

  it('discards the panel draft when the panel is closed', () => {
    const { result, store } = renderFilters();

    act(() => result.current.togglePanel());
    act(() => result.current.setPendingField('unit', ['Unit One']));
    act(() => result.current.closePanel());

    expect(appliedIn(store).unit).toEqual([]);
    expect(result.current.pending.unit).toEqual([]);
  });

  it('removing a chip clears the value from the quick filters and panel', () => {
    const { result, store } = renderFilters();

    act(() => result.current.toggleQuick('modality', 'Avatar'));
    act(() => result.current.toggleQuick('modality', 'Workstation'));
    act(() => result.current.removeChip('modality::Avatar'));

    expect(appliedIn(store).modality).toEqual(['Workstation']);
    expect(result.current.pending.modality).toEqual(['Workstation']);
    expect(result.current.isQuickActive('modality', 'Avatar')).toBe(false);
  });

  it('resets every filter', () => {
    const { result, store } = renderFilters();

    act(() => result.current.toggleQuick('modality', 'Avatar'));
    act(() => result.current.resetFilters());

    expect(appliedIn(store)).toEqual(EMPTY_LIBRARY_FILTERS);
    expect(result.current.activeCount).toBe(0);
  });

  it('starts from filters already applied, e.g. after returning to the page', () => {
    const store = buildStore();
    store.dispatch(
      setAppliedFilters({ ...EMPTY_LIBRARY_FILTERS, difficulty: ['Easy'] })
    );

    const { result } = renderFilters(store);
    act(() => result.current.togglePanel());

    expect(result.current.isQuickActive('difficulty', 'Easy')).toBe(true);
    expect(result.current.pending.difficulty).toEqual(['Easy']);
  });

  it('builds options from the API, items and fixed lists', () => {
    const { result } = renderFilters();
    const values = (field: keyof typeof result.current.options) =>
      result.current.options[field].map((option) => option.value);

    expect(values('learnerLevel')).toEqual(['Secondary', 'Post-Secondary']);
    expect(values('modality')).toEqual(['Avatar', 'Workstation']);
    // Unit options are display names, never the raw unit ids.
    expect(values('unit')).toEqual(['Unit One', 'Unit Two']);
    expect(values('productName')).toEqual(['Baby']);
    expect(values('difficulty')).toEqual(['Easy', 'Medium', 'Hard']);
  });

  it('falls back to the items for options the API does not give', () => {
    const store = buildStore();
    const items: SectionItem[] = [
      { ...ITEMS[0]!, targetAudience: ['CNA'], difficulty: 'Hard' },
      { ...ITEMS[1]!, targetAudience: ['BSN'] },
    ];
    const { result } = renderHook(
      () => useCatalogFilters(items, [], resolveUnitName),
      {
        wrapper: ({ children }: { children: ReactNode }) => (
          <Provider store={store}>
            <I18nextProvider i18n={i18n}>{children}</I18nextProvider>
          </Provider>
        ),
      }
    );

    expect(
      result.current.options.targetAudience.map((option) => option.value)
    ).toEqual(['BSN', 'CNA']);
    expect(
      result.current.options.difficulty.map((option) => option.value)
    ).toEqual(['Hard']);
  });
});

describe('useLocalCatalogFilters', () => {
  const renderLocal = (store = buildStore()) => {
    const view = renderHook(
      () => useLocalCatalogFilters(ITEMS, resolveUnitName),
      {
        wrapper: ({ children }: { children: ReactNode }) => (
          <Provider store={store}>
            <I18nextProvider i18n={i18n}>{children}</I18nextProvider>
          </Provider>
        ),
      }
    );
    return { ...view, store };
  };

  it('starts empty, even when the catalogue has filters applied', () => {
    const store = buildStore();
    store.dispatch(
      setAppliedFilters({ ...EMPTY_LIBRARY_FILTERS, difficulty: ['Easy'] })
    );

    const { result } = renderLocal(store);

    expect(result.current.activeCount).toBe(0);
  });

  it("keeps its filters to itself, leaving the catalogue's untouched", () => {
    const { result, store } = renderLocal();

    act(() => result.current.toggleQuick('modality', 'Avatar'));

    expect(result.current.isQuickActive('modality', 'Avatar')).toBe(true);
    expect(appliedIn(store)).toEqual(EMPTY_LIBRARY_FILTERS);
  });
});
