import { createAsyncThunk, createSelector, createSlice } from '@reduxjs/toolkit';
import type { RootState } from '../../store';
import { FAILED, IDLE, LOADING, SUCCEEDED } from '../../utils/constants';
import config from '../config';
import { type UnitScenario, type SimulationDetail, type SectionItem } from '../../types/index';
import { normalizeToSimulationDetail } from '../../utils/normalizeSectionItem';
import api from '../api';

export interface UnitDataState {
  simulationDetail: SimulationDetail | null;
  status: 'idle' | 'loading' | 'succeeded' | 'failed';
  error: string | null;
}

export const fetchUnitDataRequest = createAsyncThunk<
  SimulationDetail,
  {
    unitId: string;
    simulationId: string | number;
    resolvedScenarioId?: string;
    title?: string;
    fallback: SectionItem;
    ls?: string;
  },
  { rejectValue: { message: string } }
>(
  'simulationDetail/fetchUnitData',
  async ({ unitId, simulationId, resolvedScenarioId, title, fallback, ls }, thunkAPI) => {
    try {
       const res = await api.get(`${config.SimulationByUnitApi}/${unitId}`, {
         headers: {
          'ngrok-skip-browser-warning': 'true',
        },
        params: ls ? { ls } : {},
       });
      const data = res.data?.data ?? res.data ?? [];
      const arr: UnitScenario[] = Array.isArray(data) ? data : [data];

      const match =
        arr.find(
          (s) =>
            (resolvedScenarioId &&
              (String(s.id) === resolvedScenarioId ||
                String(s.scenario_id) === resolvedScenarioId)) ||
            String(s.id) === String(simulationId) ||
            (title && s.title?.toLowerCase() === title.toLowerCase()),
        ) ?? arr[0];

      return normalizeToSimulationDetail(match ?? {}, simulationId, fallback);
    } catch (err) {
      const error = err as { response?: { data?: { message?: string } } };
      return thunkAPI.rejectWithValue({
        message: error.response?.data?.message || 'Failed to fetch unit data',
      });
    }
  },
);

const initialState: UnitDataState = {
  simulationDetail: null,
  status: IDLE,
  error: null,
};

const unitDataSlice = createSlice({
  name: 'simulationDetail',
  initialState,
  reducers: {
    clearSimulationDetail(state) {
      state.simulationDetail = null;
      state.status = IDLE;
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder.addCase(fetchUnitDataRequest.pending, (state) => {
      state.status = LOADING;
      state.error = null;
    });
    builder.addCase(fetchUnitDataRequest.fulfilled, (state, action) => {
      state.status = SUCCEEDED;
      state.simulationDetail = action.payload;
    });
    builder.addCase(fetchUnitDataRequest.rejected, (state, action) => {
      state.status = FAILED;
      state.error = action.payload?.message ?? 'Failed to fetch unit data';
    });
  },
});

export const { clearSimulationDetail } = unitDataSlice.actions;

export default unitDataSlice.reducer;

const selectState = (state: RootState) => state.simulationDetail;

export const selectSimulationDetail = createSelector(selectState, (s) => s.simulationDetail);
