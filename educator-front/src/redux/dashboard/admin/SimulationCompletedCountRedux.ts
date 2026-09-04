import { clearAuthData } from '../../../utils/storage';
import { createAsyncThunk, createSlice, createSelector } from '@reduxjs/toolkit';
import type { RootState } from '../../../store';
import axiosInstance from '../../axiosInstance';
import config from '../../config';

export type SimRange = '3' | '6';

export interface SimulationCountItem {
  label: string;
  value: number;
}

export interface SimulationCountData {
  period: string;
  total: number;
  months: SimulationCountItem[];
}

interface SimulationCountState {
  data: SimulationCountData | null;
  status: 'idle' | 'loading' | 'succeeded' | 'failed';
  error: string | null;
}

const initialState: SimulationCountState = {
  data: null,
  status: 'idle',
  error: null,
};

export const getSimulationCompletedCount = createAsyncThunk(
  'simulationCompletedCount/fetch',
  async (period: SimRange, thunkAPI) => {
    try {
      const res = await axiosInstance.get(`${config.SimulationCompletedCountAPI}/${period}`, {
        headers: { 'ngrok-skip-browser-warning': 'true' },
      });

      const rawArray = res.data?.data as { month: string; year: number; count: number }[];

      const months: SimulationCountItem[] = (rawArray ?? []).map((item) => ({
        label: `${item.month} ${item.year}`,
        value: Number(item.count ?? 0),
      }));
      const total = months.reduce((sum, m) => sum + m.value, 0);

      return { period, total, months } as SimulationCountData;
    } catch (err: unknown) {
      const error = err as { response?: { data?: { status: number; message?: string } } };
      if (error.response?.data?.status === 401) {
        clearAuthData();
        window.location.href = '/login';
        return thunkAPI.rejectWithValue({ message: 'Session expired' });
      }
      return thunkAPI.rejectWithValue(
        error.response?.data?.message || 'Failed to fetch simulation count',
      );
    }
  },
);

const slice = createSlice({
  name: 'simulationCompletedCount',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(getSimulationCompletedCount.pending, (state) => {
        state.status = 'loading';
      })
      .addCase(getSimulationCompletedCount.fulfilled, (state, action) => {
        state.status = 'succeeded';
        state.data = action.payload as SimulationCountData;
      })
      .addCase(getSimulationCompletedCount.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.payload as string;
      });
  },
});

export default slice.reducer;

const selectState = (state: RootState) => state.simulationCompletedCount;

export const selectSimulationCompletedCount = createSelector(selectState, (s) => s.data);
export const selectSimulationCountTotal = createSelector(selectState, (s) => s.data?.total ?? 0);
export const selectSimulationCountStatus = createSelector(selectState, (s) => s.status);
