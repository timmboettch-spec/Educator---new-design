import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import type { RootState } from '../../../store';
import type { FilterState } from '../../../types/Class_types';
import type { ClassAttentionMeasure } from './classes.types';

/** Empty Filter Classes panel values (nothing picked). */
export const EMPTY_PANEL_FILTERS: FilterState = {
  schools: [],
  classIds: [],
  statuses: [],
  startDate: '',
  endDate: '',
};

/**
 * The class list's query: search, applied panel filters and the attention quick
 * filter, combined (AND) into the list requests. Each field changes on its own.
 * The page number isn't stored: the infinite list queries start at page 1
 * whenever this query changes.
 */
export interface ClassListQueryState {
  search: string;
  panelFilters: FilterState;
  attentionFilter: ClassAttentionMeasure | null;
}

interface ClassesUiState {
  classListQuery: ClassListQueryState;
}

const DEFAULT_CLASS_LIST_QUERY: ClassListQueryState = {
  search: '',
  panelFilters: EMPTY_PANEL_FILTERS,
  attentionFilter: null,
};

const initialState: ClassesUiState = {
  classListQuery: DEFAULT_CLASS_LIST_QUERY,
};

const classesSlice = createSlice({
  name: 'classesUi',
  initialState,
  reducers: {
    setClassListSearch(state, action: PayloadAction<string>) {
      state.classListQuery.search = action.payload;
    },
    setClassListPanelFilters(state, action: PayloadAction<FilterState>) {
      state.classListQuery.panelFilters = action.payload;
    },
    resetClassListPanelFilters(state) {
      state.classListQuery.panelFilters = EMPTY_PANEL_FILTERS;
    },
    setClassListAttentionFilter(
      state,
      action: PayloadAction<ClassAttentionMeasure | null>
    ) {
      state.classListQuery.attentionFilter = action.payload;
    },
    resetClassListQuery(state) {
      state.classListQuery = DEFAULT_CLASS_LIST_QUERY;
    },
  },
});

export const {
  setClassListSearch,
  setClassListPanelFilters,
  resetClassListPanelFilters,
  setClassListAttentionFilter,
  resetClassListQuery,
} = classesSlice.actions;

export const selectClassListQuery = (state: RootState) =>
  state.classesUi.classListQuery;

export default classesSlice.reducer;
