import type { PayloadAction } from '@reduxjs/toolkit';
import { createAsyncThunk, createSelector, createSlice } from '@reduxjs/toolkit';
import type { RootState } from '../../../store';
import { FAILED, IDLE, LOADING, SUCCEEDED } from '../../../utils/constants';
import config from '../../config';
import api from '@/redux/api';
import { matchDurationFilter } from '@/utils/helpers/matchDurationFilter';
import { parseAvatarEnabled } from '../../../utils/simulationType';

export type FilterType = 'All' | 'Recently Used' | 'Recently Added';
export type ViewMode = 'grid' | 'list';

type GroupedUnit = {
  id: string;
  unit_id: string;
  name: string;
  imageURL: string;
  category: string;
  simulations: Array<Record<string, unknown>>;
};

export interface FilterValues {
  product: string;
  topic: string;
  unit: string;
  learnerLevel: string;
  difficulty: string;
  duration: string;
}

export interface Simulation {
  simulation_id: string;
  id: string;
  name: string;
  title: string;
  unit: string;
  unit_name: string;
  duration: string;
  image: string;
  description: string;
  assigned: boolean;
  rating: number;
  difficulty: string;
  learnerLevel: string;
  /** Simulation type flag — true = AI Only, false = Manikin, undefined = unknown */
  avatarEnabled?: boolean;
}

export interface ResponseSimulationLibrary {
  data: Simulation[];
  message: string;
  status: string;
}

export interface SimulationLibraryState {
  responseSimulationLibrary: ResponseSimulationLibrary | null;
  status: 'idle' | 'loading' | 'succeeded' | 'failed';
  error: string | null;
  viewMode: ViewMode;
  activeFilter: FilterType;
  panelFilteredSimulations: Simulation[] | null;
}

const initialState: SimulationLibraryState = {
  responseSimulationLibrary: null,
  status: IDLE,
  error: null,
  viewMode: 'list',
  activeFilter: 'All',
  panelFilteredSimulations: null,
};

export const fetchMyLibrarySimulations = createAsyncThunk<
  ResponseSimulationLibrary,
  void,
  { rejectValue: { message: string } }
>('dashboard/fetchMyLibrarySimulations', async (_, thunkAPI) => {
  try {
    const res = await api.get(config.MyLibraryAPI, {
      headers: { 'ngrok-skip-browser-warning': 'true' },
    });
    const rawData = res.data?.data ?? res.data ?? [];
    const raw: Record<string, unknown>[] = Array.isArray(rawData) ? rawData : [];

    let flat: Simulation[] = [];

    if (raw.length > 0 && 'educator_id' in (raw[0] as object)) {
      const grouped = new Map<
        string,
        { unit: Record<string, unknown>; sims: Record<string, unknown>[] }
      >();
      for (const row of raw) {
        const unitId = String(row.unit_id ?? '');
        if (!grouped.has(unitId)) {
          grouped.set(unitId, { unit: (row.unit ?? {}) as Record<string, unknown>, sims: [] });
        }
        grouped.get(unitId)!.sims.push(row);
      }
      flat = Array.from(grouped.entries()).flatMap(([unitId, { unit, sims }]) =>
        sims
          .filter((row) => row.scenario_id != null)
          .map((row) => {
            const sim = (row.scenario ?? row.simulation ?? {}) as Record<string, unknown>;
            const title = String(sim.title ?? sim.name ?? row.title ?? row.name ?? '');
            const difficulty = String(sim.difficulty ?? row.difficulty ?? '');
            const learnerLevel = String(
              sim.learnerLevel ?? sim.learner_level ?? row.learnerLevel ?? row.learner_level ?? '',
            );
            const description = String(sim.description ?? row.description ?? '');
            return {
              id: String(row.scenario_id ?? row.id ?? ''),
              simulation_id: String(row.scenario_id ?? row.id ?? ''),
              name: title,
              title,
              unit: unitId,
              unit_name: String(unit.name ?? unit.title ?? unit.unitName ?? unit.unit_name ?? (row as Record<string, unknown>).unit_name ?? ''),
              duration: '',
              image: String(
                unit.imageUrl ?? unit.imageURL ?? unit.image_url ?? unit.image ??
                sim.imageUrl ?? sim.imageURL ?? sim.image_url ?? sim.image ??
                row.imageUrl ?? row.imageURL ?? row.image_url ?? row.image ??
                row.cover_image ?? row.coverImage ?? row.thumbnail ?? row.blob_url ?? ''
              ),
              description,
              assigned: false,
              rating: 0,
              difficulty,
              learnerLevel,
              avatarEnabled: parseAvatarEnabled(sim.avatarEnabled),
            };
          }),
      );
    } else {
      flat = (raw as unknown as GroupedUnit[]).flatMap((unit) =>
        (unit.simulations ?? [])
          .filter((sim) => sim.scenario_id != null && (sim.title ?? sim.name) != null)
          .map((sim) => ({
            id: String(sim.id ?? sim.scenario_id ?? ''),
            simulation_id: String(sim.id ?? sim.scenario_id ?? ''),
            name: String(sim.title ?? sim.name ?? ''),
            title: String(sim.title ?? sim.name ?? ''),
            unit: unit.unit_id ?? '',
            unit_name: unit.name ?? '',
            duration: '',
            image: String((unit as unknown as Record<string, unknown>).imageUrl ?? unit.imageURL ?? (unit as unknown as Record<string, unknown>).image_url ?? (unit as unknown as Record<string, unknown>).image ?? ''),
            description: String(sim.description ?? ''),
            assigned: false,
            rating: 0,
            difficulty: String(sim.difficulty ?? ''),
            learnerLevel: String(sim.learnerLevel ?? sim.learner_level ?? ''),
            avatarEnabled: parseAvatarEnabled(sim.avatarEnabled),
          })),
      );
    }

    const simsNeedingImage = flat.filter((s) => !s.image);
    if (simsNeedingImage.length > 0) {
      const missingUnits = [...new Set(simsNeedingImage.map((s) => s.unit).filter(Boolean))];
      const unitScenarioMap = new Map<string, Record<string, unknown>[]>();
      await Promise.allSettled(
        missingUnits.map(async (unitId) => {
          try {
            const r = await api.get(`${config.SimulationByUnitApi}/${unitId}`,);
            const scenarios = (r.data?.data ?? r.data ?? []) as Record<string, unknown>[];
            unitScenarioMap.set(unitId, scenarios);
          } catch (err: unknown) {
            const error = err as { response?: { status: number; data?: { message?: string } } };
            return thunkAPI.rejectWithValue({
              message: error.response?.data?.message || 'Failed to fetch library',
            });
          }
        }),
      );

      const scenarioImageMap = new Map<string, string>();
      for (const [, scenarios] of unitScenarioMap) {
        for (const s of scenarios) {
          const sid = String(s.id ?? s.scenario_id ?? '');
          const img = String(s.imageUrl ?? s.imageURL ?? s.image_url ?? s.image ?? s.cover_image ?? s.thumbnail ?? '');
          if (sid && img) scenarioImageMap.set(sid, img);
        }
      }
      flat = flat.map((sim) => {
        if (sim.image) return sim;
        const img = scenarioImageMap.get(sim.id) ?? '';
        return img ? { ...sim, image: img } : sim;
      });
    }

    return { status: 'SUCCESS', message: '', data: flat };
  } catch (err: unknown) {
    const error = err as { response?: { status: number; data?: { message?: string } } };
    return thunkAPI.rejectWithValue({
      message: error.response?.data?.message || 'Failed to fetch library',
    });
  }
});

const SimulationLibrarySlice = createSlice({
  name: 'dashboard/simulationLibrary',
  initialState,
  reducers: {
    setViewMode(state, action: PayloadAction<ViewMode>) {
      state.viewMode = action.payload;
    },
    setActiveFilter(state, action: PayloadAction<FilterType>) {
      state.activeFilter = action.payload;
    },
    clearSimulationLibraryState(state) {
      state.responseSimulationLibrary = null;
      state.status = IDLE;
      state.error = null;
      state.panelFilteredSimulations = null;
    },

    applyPanelFilter(state, action: PayloadAction<FilterValues>) {
      const { product, topic, unit, learnerLevel, difficulty, duration } = action.payload;
      const allSimulations = state.responseSimulationLibrary?.data ?? [];

      const hasFilter = product || topic || unit || learnerLevel || difficulty || duration;
      if (!hasFilter) {
        state.panelFilteredSimulations = null;
        return;
      }

      state.panelFilteredSimulations = allSimulations.filter((sim) => {
        // Product filter removed - category no longer sourced from units
        const matchTopic = topic ? sim.title === topic : true;
        const matchUnit = unit ? sim.unit === unit : true;
        const matchLearnerLevel = learnerLevel ? sim.learnerLevel === learnerLevel : true;
        const matchDifficulty = difficulty ? sim.difficulty === difficulty : true;
        const matchDuration = duration ? matchDurationFilter(sim.duration, duration) : true;
        return (
          matchTopic &&
          matchUnit &&
          matchLearnerLevel &&
          matchDifficulty &&
          matchDuration
        );
      });
    },

    clearPanelFilter(state) {
      state.panelFilteredSimulations = null;
    },
  },

  extraReducers: (builder) => {
    builder.addCase(fetchMyLibrarySimulations.pending, (state) => {
      state.status = LOADING;
      state.error = null;
    });
    builder.addCase(fetchMyLibrarySimulations.fulfilled, (state, action) => {
      state.status = SUCCEEDED;
      state.responseSimulationLibrary = action.payload;
    });
    builder.addCase(fetchMyLibrarySimulations.rejected, (state, action) => {
      state.status = FAILED;
      state.error = action.payload?.message || 'Failed to fetch library';
    });
  },
});

export const {
  setViewMode,
  setActiveFilter,
  clearSimulationLibraryState,
  applyPanelFilter,
  clearPanelFilter,
} = SimulationLibrarySlice.actions;

export default SimulationLibrarySlice.reducer;

const selectState = (state: RootState) => state.SimulationLibrary;

export const selectSimulationLibraryData = createSelector(
  selectState,
  (state) => state.responseSimulationLibrary?.data ?? [],
);

export const selectSimulationLoading = createSelector(
  selectState,
  (state) => state.status === LOADING,
);

export const selectSimulationError = createSelector(selectState, (state) => state.error);

export const selectViewMode = createSelector(selectState, (state) => state.viewMode);

export const selectActiveFilter = createSelector(selectState, (state) => state.activeFilter);

export const selectFilteredSimulations = createSelector(
  [
    selectSimulationLibraryData,
    selectActiveFilter,
    (state: RootState) => state.SimulationLibrary.panelFilteredSimulations,
  ],
  (simulations, filter, panelFiltered) => {
    if (panelFiltered !== null) return panelFiltered;
    if (!simulations) return [];
    switch (filter) {
      case 'Recently Used':
        return simulations.slice(0, 5);
      case 'Recently Added':
        return [...simulations].reverse();
      default:
        return simulations;
    }
  },
);
