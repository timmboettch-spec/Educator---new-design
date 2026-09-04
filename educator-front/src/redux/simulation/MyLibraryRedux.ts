import { createAsyncThunk, createSelector, createSlice } from '@reduxjs/toolkit';
import type { PayloadAction } from '@reduxjs/toolkit';
import config from '../config';
import type { RootState } from '../../store';
import api from '../api';

export interface LibrarySimulation {
  id: string;
  simulation_id?: string | null;
  scenario_id: string | null;
  title: string | null;
  unit_id: string;
  difficulty: string | null;
  learnerLevel: string | null;
  description: string | null;
  isRemovable: boolean;
  avatarEnabled?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface LibraryUnit {
  id: string;
  unit_id: string;
  name: string;
  imageURL: string;
  category: string;
  simulations: LibrarySimulation[];
}
const normalizeLibraryUnits = (payload: unknown): LibraryUnit[] => {
  const raw = Array.isArray(payload) ? payload : [];
  if (raw.length > 0 && 'educator_id' in (raw[0] as object)) {
    const grouped = new Map<string, LibraryUnit>();
    for (const row of raw as Record<string, unknown>[]) {
      const scenario = (row.scenario ?? row.simulation ?? {}) as Record<string, unknown>;
      const scenarioStatusRaw = String(scenario.status ?? scenario.Status ?? '').toLowerCase().trim();
      if (scenarioStatusRaw === 'draft' || scenarioStatusRaw === 'archived') continue;

      const unitId = String(row.unit_id ?? '');
      if (!grouped.has(unitId)) {
        const u = (row.unit ?? {}) as Record<string, unknown>;
        grouped.set(unitId, {
          id: String(row.unit_id ?? ''),
          unit_id: unitId,
          name: String(u.name ?? row.unit_name ?? ''),
          imageURL: String(u.imageURL ?? u.imageUrl ?? ''),
          category: String(u.category ?? u.unit_category ?? u.categoryName ?? ''),
          simulations: [],
        });
      }
      
      const sim = (row.scenario ?? row.simulation ?? {}) as Record<string, unknown>;
      const isRemovable = (() => {
        const v = row.isRemovable ?? row.is_removable ?? row.isDefaultLibraryItem ?? row.is_default_library_item ?? row.removable ?? row.can_remove;
        if (v === undefined || v === null) return true;
        if (typeof v === 'boolean') return v;
        if (
          ('isDefaultLibraryItem' in row || 'is_default_library_item' in row) &&
          v !== undefined
        ) {
          return !v;
        }
        return Boolean(v);
      })();
      grouped.get(unitId)!.simulations.push({
        id: String(row.scenario_id ?? row.id ?? ''),
        simulation_id: row.scenario_id != null ? String(row.scenario_id) : null,
        scenario_id: row.scenario_id != null ? String(row.scenario_id) : null,
        title: row.scenario_id != null ? String(sim.title ?? sim.name ?? '') : null,
        unit_id: unitId,
        difficulty: row.scenario_id != null ? String(sim.difficulty ?? '') : null,
        learnerLevel:
          row.scenario_id != null ? String(sim.learnerLevel ?? sim.learner_level ?? '') : null,
        description: row.scenario_id != null ? String(sim.description ?? '') : null,
        isRemovable,
        avatarEnabled: typeof sim.avatarEnabled === 'boolean' ? sim.avatarEnabled : undefined,
        created_at: row.created_at != null ? String(row.created_at) : undefined,
        updated_at: row.updated_at != null ? String(row.updated_at) : undefined,
      });
    }
    return Array.from(grouped.values());
  }

  return raw.map((unit) => {
    const u = unit as Partial<LibraryUnit> & Record<string, unknown>;
    const simulations = Array.isArray(u.simulations)
      ? (u.simulations as unknown as Record<string, unknown>[])
          .filter((s) => {
            const simScenario = (s.scenario ?? {}) as Record<string, unknown>;
            const simStatus = String(s.status ?? simScenario.status ?? simScenario.Status ?? '').toLowerCase().trim();
            return simStatus !== 'draft' && simStatus !== 'archived';
          })
          .map((s) => {
            const isRemovable = (() => {
              const v = s.isRemovable ?? s.is_removable ?? s.isDefaultLibraryItem ?? s.is_default_library_item ?? s.removable ?? s.can_remove;
              if (v === undefined || v === null) return true;
              if (typeof v === 'boolean') return v;
              if ('isDefaultLibraryItem' in s || 'is_default_library_item' in s) return !v;
              return Boolean(v);
            })();
            return {
              id: String(s.id ?? s.scenario_id ?? ''),
              simulation_id: s.scenario_id != null ? String(s.scenario_id) : null,
              scenario_id: s.scenario_id != null ? String(s.scenario_id) : null,
              title: s.scenario_id != null ? String(s.title ?? s.name ?? '') : null,
              unit_id: String(s.unit_id ?? u.unit_id ?? ''),
              difficulty: s.scenario_id != null ? String(s.difficulty ?? '') : null,
              learnerLevel:
                s.scenario_id != null ? String(s.learnerLevel ?? s.learner_level ?? '') : null,
              description: s.scenario_id != null ? String(s.description ?? '') : null,
              isRemovable,
              avatarEnabled: typeof s.avatarEnabled === 'boolean' ? s.avatarEnabled : undefined,
              created_at: s.created_at != null ? String(s.created_at) : undefined,
              updated_at: s.updated_at != null ? String(s.updated_at) : undefined,
            };
          })
      : [];
    return {
      id: String(u.id ?? ''),
      unit_id: String(u.unit_id ?? ''),
      name: String(u.name ?? ''),
      imageURL: String(u.imageURL ?? u.imageUrl ?? ''),
      category: String(u.category ?? u.unit_category ?? u.categoryName ?? ''),
      simulations,
    };
  });
};

interface MyLibraryState {
  units: LibraryUnit[];
  purchasedIds: string[];
  pendingAddIds: string[];
  pendingRemoveIds: string[];
  loading: boolean;
  adding: boolean;
  removing: boolean;
  error: string | null;
  /** True once fetchMyLibrary has successfully completed at least once in this session. */
  loaded: boolean;
}

const initialState: MyLibraryState = {
  units: [],
  purchasedIds: [],
  pendingAddIds: [],
  pendingRemoveIds: [],
  loading: false,
  adding: false,
  removing: false,
  error: null,
  loaded: false,
};

export const fetchMyLibrary = createAsyncThunk<
  { units: LibraryUnit[]; purchasedIds: string[] },
  void,
  { rejectValue: string }
>(
  'myLibrary/fetch',
  async (_, { rejectWithValue }) => {
    try {
      const res = await api.get(config.MyLibraryAPI, {});
      if (res.data?.status === 'FAILED') {
        return rejectWithValue(res.data?.message ?? 'Failed to fetch library');
      }
      const units = normalizeLibraryUnits(res.data?.data ?? res.data);
      const purchasedIds: string[] = [];

      return { units, purchasedIds };
    } catch (err: unknown) {
      const error = err as { response?: { status: number } };
      return rejectWithValue(error instanceof Error ? error.message : 'Unknown error');
    }
  },
);

export const fetchMyLibraryUnits = createAsyncThunk<
  LibraryUnit[],
  void,
  { rejectValue: string }
>(
  'myLibrary/fetchUnits',
  async (_, { rejectWithValue }) => {
    try {
      const res = await api.get(config.MyLibraryAPI, {});
      if (res.data?.status === 'FAILED') {
        return rejectWithValue(res.data?.message ?? 'Failed to fetch library');
      }
      return normalizeLibraryUnits(res.data?.data ?? res.data);
    } catch (err: unknown) {
      return rejectWithValue(err instanceof Error ? err.message : 'Unknown error');
    }
  },
);

const myLibrarySlice = createSlice({
  name: 'myLibrary',
  initialState,
  reducers: {
    addPendingLibraryId: (state, action: PayloadAction<string>) => {
      if (!state.pendingAddIds.includes(action.payload)) {
        state.pendingAddIds.push(action.payload);
      }
      state.pendingRemoveIds = state.pendingRemoveIds.filter((id) => id !== action.payload);
    },
    removePendingLibraryId: (state, action: PayloadAction<string>) => {
      state.pendingAddIds = state.pendingAddIds.filter((id) => id !== action.payload);
    },
    addPendingRemoveId: (state, action: PayloadAction<string>) => {
      if (!state.pendingRemoveIds.includes(action.payload)) {
        state.pendingRemoveIds.push(action.payload);
      }
      state.pendingAddIds = state.pendingAddIds.filter((id) => id !== action.payload);
    },
    removePendingRemoveId: (state, action: PayloadAction<string>) => {
      state.pendingRemoveIds = state.pendingRemoveIds.filter((id) => id !== action.payload);
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchMyLibrary.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchMyLibrary.fulfilled, (state, action) => {
        state.loading = false;
        state.loaded = true;
        state.units = action.payload.units;
        state.purchasedIds = action.payload.purchasedIds;
        if (state.pendingAddIds.length > 0) {
          const confirmedIds = new Set([
            ...action.payload.units.flatMap((u) =>
              u.simulations.flatMap((s) =>
                [s.id, s.simulation_id, s.scenario_id]
                  .filter((v) => v != null && String(v).trim() !== '')
                  .map(String),
              ),
            ),
            ...action.payload.purchasedIds,
          ]);
          state.pendingAddIds = state.pendingAddIds.filter((id) => !confirmedIds.has(id));
        }
        state.pendingRemoveIds = [];
      })
      .addCase(fetchMyLibrary.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload ?? 'Failed to fetch library';
      })
     
      .addCase(fetchMyLibraryUnits.fulfilled, (state, action) => {
        state.units = action.payload;
      })
      .addMatcher(
        (action): action is { type: string; meta: { arg: { scenario_id: string } } } =>
          action.type === 'myLibrary/remove/fulfilled',
        (state, action) => {
          const key = action.meta?.arg?.scenario_id;
          if (key) {
            state.pendingAddIds = state.pendingAddIds.filter((id) => id !== key);
            if (!state.pendingRemoveIds.includes(key)) state.pendingRemoveIds.push(key);
          }
        },
      )
      .addMatcher(
        (action): action is { type: string; meta: { arg: { scenario_id: string } } } =>
          action.type === 'myLibrary/add/fulfilled',
        (state, action) => {
          const key = action.meta?.arg?.scenario_id;
          if (key) {
            state.pendingRemoveIds = state.pendingRemoveIds.filter((id) => id !== key);
          }
        },
      )
  },
});

export const {
  addPendingLibraryId,
  removePendingLibraryId,
  addPendingRemoveId,
  removePendingRemoveId,
} = myLibrarySlice.actions;

export default myLibrarySlice.reducer;

const selectMyLibrary = (state: RootState) => state.myLibrary;

export const selectLibraryUnits = createSelector(selectMyLibrary, (s) => s.units);
export const selectLibraryLoading = createSelector(selectMyLibrary, (s) => s.loading);
export const selectLibraryLoaded = createSelector(selectMyLibrary, (s) => s.loaded);
export const selectPurchasedIds = createSelector(selectMyLibrary, (s) => s.purchasedIds);
export const selectPendingAddIds = createSelector(selectMyLibrary, (s) => s.pendingAddIds);
export const selectPendingRemoveIds = createSelector(selectMyLibrary, (s) => s.pendingRemoveIds);
export const selectNonRemovableIds = createSelector(selectLibraryUnits, (units) =>
  new Set(
    units.flatMap((u) =>
      u.simulations
        .filter((s) => s.isRemovable === false)
        .flatMap((s) =>
          [s.id, s.simulation_id, s.scenario_id]
            .filter((v): v is string => v != null && String(v).trim() !== ''),
        ),
    ),
  ),
);

export const selectLibrarySimulationIds = createSelector(
  selectLibraryUnits,
  selectPurchasedIds,
  selectPendingAddIds,
  selectPendingRemoveIds,
  (units, purchasedIds, pendingAddIds, pendingRemoveIds) => {
    const removeSet = new Set(pendingRemoveIds);
    return new Set(
      [
        ...units.flatMap((u) =>
          u.simulations.flatMap((s) =>
            [s.id, s.simulation_id, s.scenario_id]
              .filter((value) => value != null && String(value).trim() !== '')
              .map(String),
          ),
        ),
        ...purchasedIds,
        ...pendingAddIds,
      ].filter((id) => !removeSet.has(id)),
    );
  },
);
