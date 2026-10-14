import {
  createAsyncThunk,
  createSelector,
  createSlice,
} from '@reduxjs/toolkit';
import type { RootState } from '../../store';
import { FAILED, IDLE, LOADING, SUCCEEDED } from '../../utils/constants';
import config from '../config';
import api from '../api';

export interface ResolvedScenario {
  id?: string | number;
  scenario_id?: string | number;
  scenarioId?: string | number;
  title?: string;
  [key: string]: unknown;
}

export interface SimulationResolveState {
  resolvedScenarioId: string | undefined;
  resolveStatus: 'idle' | 'loading' | 'succeeded' | 'failed';
  resolveError: string | null;
}

export const fetchSimulationRequest = createAsyncThunk<
  string,
  { title: string; ls?: string },
  { rejectValue: { message: string } }
>(
  'simulationResolve/resolveScenarioByTitle',
  async ({ title, ls }, thunkAPI) => {
    try {
      const res = await api.get(config.SimulationCatalogScenariosAPI, {
        headers: {
          'ngrok-skip-browser-warning': 'true',
        },
        params: ls ? { ls } : {},
      });
      const raw = res.data?.data ?? res.data ?? [];
      const arr: ResolvedScenario[] = Array.isArray(raw) ? raw : [];

      // Filter out only 'draft' scenarios — show everything else
      const activeScenarios = arr.filter((s) => {
        const status = String(s.status ?? '')
          .toLowerCase()
          .trim();
        return status !== 'draft' && status !== 'archived';
      });

      const match = activeScenarios.find(
        (s) =>
          typeof s.title === 'string' &&
          s.title.trim().toLowerCase() === title.trim().toLowerCase()
      );

      if (!match) {
        return thunkAPI.rejectWithValue({
          message: 'No matching scenario found for title',
        });
      }

      const sid = String(
        match.id ?? match.scenario_id ?? match.scenarioId ?? ''
      );

      if (!sid || sid === '0') {
        return thunkAPI.rejectWithValue({
          message: 'Matched scenario has no valid ID',
        });
      }

      return sid;
    } catch (err) {
      const error = err as { response?: { data?: { message?: string } } };
      return thunkAPI.rejectWithValue({
        message:
          error.response?.data?.message ||
          'Failed to resolve scenario by title',
      });
    }
  }
);

const initialState: SimulationResolveState = {
  resolvedScenarioId: undefined,
  resolveStatus: IDLE,
  resolveError: null,
};

const simulationResolveSlice = createSlice({
  name: 'simulationResolve',
  initialState,
  reducers: {
    setResolvedScenarioId(state, action: { payload: string | undefined }) {
      state.resolvedScenarioId = action.payload;
    },
    clearResolvedScenario(state) {
      state.resolvedScenarioId = undefined;
      state.resolveStatus = IDLE;
      state.resolveError = null;
    },
  },
  extraReducers: (builder) => {
    builder.addCase(fetchSimulationRequest.pending, (state) => {
      state.resolveStatus = LOADING;
      state.resolveError = null;
    });
    builder.addCase(fetchSimulationRequest.fulfilled, (state, action) => {
      state.resolveStatus = SUCCEEDED;
      state.resolvedScenarioId = action.payload;
    });
    builder.addCase(fetchSimulationRequest.rejected, (state, action) => {
      state.resolveStatus = FAILED;
      state.resolveError =
        action.payload?.message ?? 'Failed to resolve scenario';
    });
  },
});

export const { setResolvedScenarioId, clearResolvedScenario } =
  simulationResolveSlice.actions;

export default simulationResolveSlice.reducer;

const selectState = (state: RootState) => state.simulationResolve;

export const selectResolvedScenarioId = createSelector(
  selectState,
  (s) => s.resolvedScenarioId
);
export const selectResolveStatus = createSelector(
  selectState,
  (s) => s.resolveStatus
);
export const selectResolveLoading = createSelector(
  selectState,
  (s) => s.resolveStatus === LOADING
);
export const selectResolveError = createSelector(
  selectState,
  (s) => s.resolveError
);

export const selectEffectiveScenarioId = (simulationId: string | number) =>
  createSelector(selectResolvedScenarioId, (resolved) => {
    if (resolved && resolved !== '0') return resolved;
    const sid = String(simulationId);
    return sid !== '0' ? sid : undefined;
  });
