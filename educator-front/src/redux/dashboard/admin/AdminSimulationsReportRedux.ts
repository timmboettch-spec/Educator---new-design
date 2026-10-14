import {
  createAsyncThunk,
  createSlice,
  createSelector,
} from '@reduxjs/toolkit';
import config from '../../config';
import api from '../../api';
import type { RootState } from '../../../store';
import { getParsedUser } from '../../../utils/storage';

export interface AdminSimReport {
  id: string;
  student_id?: string;
  userId?: string;
  created_at?: string;
  completed_at?: string;
  createdAt?: string;
  scenarioEndTime?: string;
  status?: string;
}

export const AdminSimulationsReportRequest = createAsyncThunk<
  AdminSimReport[],
  void,
  { rejectValue: string }
>('dashboard/adminSimulationsReport', async (_, thunkAPI) => {
  try {
    const adminId = getParsedUser()?.id;
    const res = await api.get(
      `${config.SimulationAdminReportsAPI}/${adminId}`,
      {
        headers: { 'ngrok-skip-browser-warning': 'true' },
      }
    );
    const payload = res.data?.data ?? res.data;
    return Array.isArray(payload) ? (payload as AdminSimReport[]) : [];
  } catch (err: unknown) {
    const error = err as { response?: { status?: number } };
    if (error?.response?.status === 404) return [];
    return thunkAPI.rejectWithValue('Failed to fetch simulation reports');
  }
});

const initialState: {
  data: AdminSimReport[];
  status: 'idle' | 'loading' | 'succeeded' | 'failed';
  error: string | null;
} = { data: [], status: 'idle', error: null };

const slice = createSlice({
  name: 'adminSimulationsReport',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(AdminSimulationsReportRequest.pending, (state) => {
        state.status = 'loading';
      })
      .addCase(AdminSimulationsReportRequest.fulfilled, (state, action) => {
        state.status = 'succeeded';
        state.data = action.payload;
      })
      .addCase(AdminSimulationsReportRequest.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.payload as string;
      });
  },
});

export default slice.reducer;

const selectState = (state: RootState) =>
  (state as RootState & { adminSimulationsReport?: typeof initialState })
    .adminSimulationsReport ?? initialState;
export const selectAdminSimReports = createSelector(selectState, (s) => s.data);
export const selectAdminSimReportsStatus = createSelector(
  selectState,
  (s) => s.status
);
export const selectAdminSimReportsError = createSelector(
  selectState,
  (s) => s.error
);
