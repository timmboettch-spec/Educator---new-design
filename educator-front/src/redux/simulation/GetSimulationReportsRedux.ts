import {
  createAsyncThunk,
  createSelector,
  createSlice,
} from '@reduxjs/toolkit';
import { FAILED, IDLE, LOADING, SUCCEEDED } from '../../utils/constants';
import config from '../config';
import type { RootState } from '../../store';
import api from '../api';

export interface SimulationReportItem {
  id: string;
  key?: string;
  userId?: string;
  studentName: string;
  studentClass?: string;
  scenarioId: string;
  scenarioTitle: string;
  transcriptId?: string;
  scenarioStartTime: string;
  scenarioEndTime: string;
  totalTimeSeconds: number;
  score: number | null;
  performanceLabel: string;
  scoreJson?: {
    overallScore: number | null;
    overallLabel: string;
    [key: string]: unknown;
  };
  summary?: string;
  summaryEntries?: unknown[];
  student_name?: string;
  student_id?: string;
  simulation_name?: string;
  scenario_title?: string;
  status?: string;
  attempt?: number | null;
  time_spent?: string | null;
  created_at?: string;
  createdAt?: string;
  completed_at?: string;
  scenario_id?: string;
  /** True when the report has been generated but never viewed by the educator. */
  isNew?: boolean;
  [key: string]: unknown;
  viewedAt?: string | null;
  reportGeneratedAt?: string;
}

interface SimulationReportsResponse {
  data: SimulationReportItem[];
  message: string;
}

interface State {
  reports: SimulationReportItem[];
  status: 'idle' | 'loading' | 'succeeded' | 'failed';
  error: string | null;
}

const initialState: State = {
  reports: [],
  status: IDLE,
  error: null,
};

export const FetchSimulationReports = createAsyncThunk<
  SimulationReportsResponse,
  void,
  { rejectValue: { message: string } }
>('simulationReports/fetchAll', async (_, thunkAPI) => {
  try {
    const res = await api.get(config.SimulationReportsAPI, {
      headers: {
        'ngrok-skip-browser-warning': 'true',
      },
    });
    return res.data;
  } catch (err) {
    const error = err as {
      response?: { status?: number; data?: { message?: string } };
    };
    return thunkAPI.rejectWithValue({
      message:
        error.response?.data?.message || 'Failed to fetch simulation reports',
    });
  }
});

const slice = createSlice({
  name: 'allSimulationReports',
  initialState,
  reducers: {
    resetSimulationReports: (state) => {
      state.reports = [];
      state.status = IDLE;
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(FetchSimulationReports.pending, (state) => {
        state.status = LOADING;
        state.error = null;
      })
      .addCase(FetchSimulationReports.fulfilled, (state, action) => {
        state.status = SUCCEEDED;
        state.reports = action.payload.data ?? [];
      })
      .addCase(FetchSimulationReports.rejected, (state, action) => {
        state.status = FAILED;
        state.error = action.payload?.message ?? 'Error';
      });
  },
});

export const { resetSimulationReports } = slice.actions;
export default slice.reducer;

const selectState = (state: RootState) => state.allSimulationReports;
export const selectSimulationReports = createSelector(
  selectState,
  (s) => s.reports
);
export const selectSimulationReportsStatus = createSelector(
  selectState,
  (s) => s.status
);
export const selectSimulationReportsError = createSelector(
  selectState,
  (s) => s.error
);
