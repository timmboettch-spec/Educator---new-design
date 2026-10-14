import {
  createAsyncThunk,
  createSlice,
  createSelector,
} from '@reduxjs/toolkit';
import { FAILED, IDLE, LOADING, SUCCEEDED } from '../../utils/constants';
import config from '../config';
import type { RootState } from '../../store';
import api from '../api';
import type { SimulationReportItem } from '../simulation/GetSimulationReportsRedux';
import { setClassNeedsAttention, isReportNew } from '../class/GetClassRedux';

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

export const GetEducatorSimulationReports = createAsyncThunk<
  SimulationReportItem[],
  { educatorId: string },
  { rejectValue: { message: string }; state: RootState }
>('educatorReports/fetch', async ({ educatorId }, thunkAPI) => {
  try {
    const res = await api.get(
      `${config.SimulationEducatorReportsAPI}/${educatorId}`,
      {
        headers: {
          'ngrok-skip-browser-warning': 'true',
          'Cache-Control': 'no-cache',
          Pragma: 'no-cache',
        },
      }
    );
    const reports = (res.data?.data ?? res.data) as SimulationReportItem[];
    const state = thunkAPI.getState();
    const viewedReportIds = state.GetClass.viewedReportIds;
    const classes = state.GetClass.responseClass?.data?.classes ?? [];
    const userToClass = new Map<string, string>();
    for (const cls of classes) {
      for (const student of cls.students ?? []) {
        if (student.user_id) userToClass.set(student.user_id, String(cls.id));
        if (student.student_id)
          userToClass.set(student.student_id, String(cls.id));
      }
    }

    // Tally unread reports per class
    const unreadByClass: Record<string, number> = {};
    for (const r of reports) {
      if (!r.userId) continue;
      if (!isReportNew(r.id, r.isNew, viewedReportIds)) continue;
      const classId = userToClass.get(r.userId);
      if (!classId) continue;
      unreadByClass[classId] = (unreadByClass[classId] ?? 0) + 1;
    }

    for (const cls of classes) {
      const id = String(cls.id);
      const unreadCount = unreadByClass[id] ?? 0;
      thunkAPI.dispatch(
        setClassNeedsAttention({
          classId: id,
          needsAttention: unreadCount > 0,
          unreadCount,
        })
      );
    }

    return reports;
  } catch (err) {
    const error = err as { response?: { data?: { message?: string } } };
    return thunkAPI.rejectWithValue({
      message:
        error.response?.data?.message ?? 'Failed to fetch educator reports',
    });
  }
});

const slice = createSlice({
  name: 'educatorReports',
  initialState,
  reducers: {
    resetEducatorReports: (state) => {
      state.reports = [];
      state.status = IDLE;
      state.error = null;
    },
    clearReportIsNew: (state, action: { payload: string | string[] }) => {
      const ids = Array.isArray(action.payload)
        ? action.payload
        : [action.payload];
      for (const report of state.reports) {
        if (ids.includes(report.id)) {
          report.isNew = false;
        }
      }
    },
    // Reverse of clearReportIsNew, for bulk "mark unreviewed".
    setReportIsNew: (state, action: { payload: string | string[] }) => {
      const ids = Array.isArray(action.payload)
        ? action.payload
        : [action.payload];
      for (const report of state.reports) {
        if (ids.includes(report.id)) {
          report.isNew = true;
        }
      }
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(GetEducatorSimulationReports.pending, (state) => {
        state.status = LOADING;
        state.error = null;
      })
      .addCase(GetEducatorSimulationReports.fulfilled, (state, action) => {
        state.status = SUCCEEDED;
        state.reports = action.payload;
      })
      .addCase(GetEducatorSimulationReports.rejected, (state, action) => {
        state.status = FAILED;
        state.error = action.payload?.message ?? 'Unknown error';
      });
  },
});

export const { resetEducatorReports, clearReportIsNew, setReportIsNew } =
  slice.actions;

const selectEducatorReportsState = (state: RootState) => state.EducatorReports;

export const selectEducatorReports = createSelector(
  selectEducatorReportsState,
  (state) => state.reports
);

export const selectEducatorReportsStatus = createSelector(
  selectEducatorReportsState,
  (state) => state.status
);

export default slice.reducer;
