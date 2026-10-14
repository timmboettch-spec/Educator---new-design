import { createElement, type ReactNode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { configureStore } from '@reduxjs/toolkit';
import { Provider } from 'react-redux';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '../../../src/i18n';
import classesUiReducer, {
  setClassListAttentionFilter,
} from '../../../src/redux/api/classes/classesSlice';
import { ClassAttentionMeasure } from '../../../src/redux/api/classes/classes.types';

const { mockFilterOptions } = vi.hoisted(() => ({
  mockFilterOptions: vi.fn(),
}));

vi.mock('../../../src/hooks/useClassFilterOptions', () => ({
  useClassFilterOptions: (params: unknown) => mockFilterOptions(params),
}));

import { useClassFilters } from '../../../src/hooks/useClassFilters';

const buildStore = () =>
  configureStore({ reducer: { classesUi: classesUiReducer } });

const renderFilters = (store = buildStore()) => {
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(Provider, { store, children });
  return { store, ...renderHook(() => useClassFilters(), { wrapper }) };
};

beforeEach(() => {
  mockFilterOptions.mockReset();
  mockFilterOptions.mockReturnValue({
    schoolField: { options: [] },
    classNameField: { options: [] },
    statusField: { options: [] },
    schoolLabels: { 'sch-2': 'Riverside' },
    classLabels: { 'c-1': 'Biology' },
    getStatusLabel: (status: string) =>
      status === 'ARCHIEVED' ? 'Archived' : status,
  });
});

describe('useClassFilters', () => {
  it('keeps search and applied panel filters in the class list query', () => {
    const { result, store } = renderFilters();
    act(() => {
      result.current.setSearchTerm('bio');
      result.current.setAppliedFilter({ statuses: ['ACTIVE'] });
    });

    expect(store.getState().classesUi.classListQuery).toMatchObject({
      search: 'bio',
      panelFilters: { statuses: ['ACTIVE'] },
    });
    expect(result.current.searchTerm).toBe('bio');
    expect(result.current.appliedFilter.statuses).toEqual(['ACTIVE']);
  });

  it('lists classes for the schools picked in the panel, before they are applied', () => {
    const { result } = renderFilters();
    act(() => {
      result.current.setFilterOpen(true);
      result.current.setFilterValues({ schools: ['sch-2'] });
    });
    expect(mockFilterOptions).toHaveBeenLastCalledWith({
      selectedSchoolIds: ['sch-2'],
      panelOpen: true,
    });
  });

  it('shows names (not ids) in the chips from the loaded-option labels', () => {
    const { result } = renderFilters();
    act(() => {
      result.current.setAppliedFilter({
        schools: ['sch-2', 'sch-unknown'],
        classIds: ['c-1'],
        statuses: ['ARCHIEVED'],
      });
    });
    expect(
      result.current.activeFilterChips.map((chip) => [
        chip.key,
        chip.displayValue,
      ])
    ).toEqual([
      ['schools::sch-2', 'Riverside'],
      ['schools::sch-unknown', 'sch-unknown'],
      ['classIds::c-1', 'Biology'],
      ['statuses::ARCHIEVED', 'Archived'],
    ]);
  });

  it('removes a single chip value from both draft and applied filters', () => {
    const { result } = renderFilters();
    act(() => {
      result.current.setFilterValues({ classIds: ['c-1', 'c-2'] });
      result.current.setAppliedFilter({ classIds: ['c-1', 'c-2'] });
    });
    act(() => {
      result.current.handleRemoveFilter('classIds::c-1');
    });
    expect(result.current.appliedFilter.classIds).toEqual(['c-2']);
    expect(result.current.filterValues.classIds).toEqual(['c-2']);
  });

  it('clears only the panel filters, keeping search and the quick filter', () => {
    const { result, store } = renderFilters();
    act(() => {
      result.current.setSearchTerm('bio');
      result.current.setFilterValues({ classIds: ['c-1'] });
      result.current.setAppliedFilter({ classIds: ['c-1'] });
      store.dispatch(
        setClassListAttentionFilter(ClassAttentionMeasure.NO_STUDENTS)
      );
    });

    act(() => {
      result.current.handleClearAllFilters();
    });

    expect(result.current.appliedFilter.classIds).toEqual([]);
    expect(result.current.filterValues.classIds).toEqual([]);
    expect(result.current.activeFilterChips).toHaveLength(0);
    expect(store.getState().classesUi.classListQuery).toMatchObject({
      search: 'bio',
      attentionFilter: 'noStudents',
    });
  });
});
