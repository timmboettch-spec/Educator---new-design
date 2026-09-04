import { createAsyncThunk, createSelector, createSlice } from '@reduxjs/toolkit';
import type { RootState } from '../../store';
import { FAILED, IDLE, LOADING, SUCCEEDED } from '../../utils/constants';
import config from '../config';
import { setClassReportCount, setClassNeedsAttention, markReportViewed } from './GetClassRedux';
import { clearReportIsNew } from '../reports/EducatorReportsRedux';
import api from '../api';

export interface ScoreJson {
  communication: number | null;
  communicationLabel: string;
  clinicalJudgment: number | null;
  clinicalJudgmentLabel: string;
  technicalAccuracy: number | null;
  technicalAccuracyLabel: string;
  ethicalCompetence: number | null;
  ethicalCompetenceLabel: string;
  reflection: number | null;
  reflectionLabel: string;
  overallScore: number | null;
  overallLabel: string;
  rubricsTotal: number | null;
}

export interface SummaryEntry {
  id: string;
  category: string;
  title: string;
  details: string;
  timestamp: string;
  timestampValue: number;
  elapsedTime: string;
  elapsedSeconds: number;
  duration?: number;
  [key: string]: unknown;
}

export interface SimulationReport {
  id: string;
  key: string;
  userId: string;
  studentName: string;
  studentClass: string;
  scenarioId: string;
  scenarioTitle: string;
  transcriptId: string;
  scenarioStartTime: string;
  scenarioEndTime: string;
  totalTimeSeconds: number;
  score: number | null;
  performanceLabel: string;
  scoreJson: ScoreJson;
  summary: string;
  feedback?: string;
  strengths?: unknown[];
  improvements?: unknown[];
  summaryEntries: SummaryEntry[];
  summaryByCategory?: Record<string, unknown[]>;
  commonActionTracker?: { actionLog: unknown[] };
  rubricsPayload?: {
    items?: unknown[];
    totalScore?: number;
    totalWeight?: number;
    overallSummary?: string;
    [key: string]: unknown;
  };
  communicationAssessment?: Record<string, unknown>;
  softSkills?: unknown;
  technicalSkills?: unknown;
  sbarStatus?: string;
  userRole?: string;
  rubricsTotal?: number;
  rubricsSummary?: string;
  actionSummary?: Record<string, unknown>;
  mandatoryActions?: {
    title: string;
    type: string;
    isCorrect: boolean;
    attemptsCount: number;
    pointsAwarded: number;
  }[];
  simulation_id?: string;
  simulation_name?: string;
  status?: string;
  attempt?: number | null;
  time_spent?: string | null;
  scenario_title?: string;
  created_at?: string;
  createdAt?: string;
  student_id?: string;
  student_name?: string;
  student_code?: string;
  studentCode?: string;
  completed_at?: string;
  scenario_id?: string;
  mode?: 'practice' | 'assessment' | string;
  due_date?: string;
  isNew?: boolean;
  viewedAt?: string | null;
  reportGeneratedAt?: string;
  // Permissive index for backend field variations
  [key: string]: unknown;
}

export interface StudentReportsResponse {
  data: SimulationReport[];
  message: string;
}

export interface ClassReportsResponse {
  data: SimulationReport[];
  message: string;
}

export interface SimulationReportsState {
  studentReports: SimulationReport[];
  studentReportsStatus: 'idle' | 'loading' | 'succeeded' | 'failed';
  studentReportsError: string | null;
  classReports: SimulationReport[];
  classReportsStatus: 'idle' | 'loading' | 'succeeded' | 'failed';
  classReportsError: string | null;
  simulationReports: SimulationReport[];
  simulationReportsStatus: 'idle' | 'loading' | 'succeeded' | 'failed';
  simulationReportsError: string | null;
  singleReport: SimulationReport | null;
  singleReportStatus: 'idle' | 'loading' | 'succeeded' | 'failed';
  singleReportError: string | null;
  syncStatus: 'idle' | 'loading' | 'succeeded' | 'failed';
  syncError: string | null;
  syncedSimsCompleted: Record<string, number>;
}

function normalizeReportArray(payload: unknown): SimulationReport[] {
  if (Array.isArray(payload)) return payload as SimulationReport[];
  if (payload && typeof payload === 'object') {
    const p = payload as Record<string, unknown>;
    if (Array.isArray(p['data'])) return p['data'] as SimulationReport[];
    if (Array.isArray(p['reports'])) return p['reports'] as SimulationReport[];
    if (Array.isArray(p['results'])) return p['results'] as SimulationReport[];
    if (Array.isArray(p['items'])) return p['items'] as SimulationReport[];
    const inner = p['data'];
    if (inner && typeof inner === 'object' && !Array.isArray(inner)) {
      const i = inner as Record<string, unknown>;
      if (Array.isArray(i['data'])) return i['data'] as SimulationReport[];
      if (Array.isArray(i['reports'])) return i['reports'] as SimulationReport[];
    }
  }
  return [];
}

const initialState: SimulationReportsState = {
  studentReports: [],
  studentReportsStatus: IDLE,
  studentReportsError: null,
  classReports: [],
  classReportsStatus: IDLE,
  classReportsError: null,
  simulationReports: [],
  simulationReportsStatus: IDLE,
  simulationReportsError: null,
  singleReport: null,
  singleReportStatus: IDLE,
  singleReportError: null,
  syncStatus: IDLE,
  syncError: null,
  syncedSimsCompleted: {},
};

export const MarkReportViewed = createAsyncThunk<
  void,
  // reportId can be a single ID or an array (for deduplicated rows that collapse
  // multiple reports behind one table row).
  { reportId: string | string[]; classId: string },
  { rejectValue: { message: string }; state: RootState }
>('simulationReports/markViewed', async ({ reportId, classId }, thunkAPI) => {
  // Dispatch to Redux first — idempotent, handles the unread count decrement.
  thunkAPI.dispatch(markReportViewed({ reportId, classId }));
  // Clear isNew flag in the EducatorReports store so selectNewReportsByUserId
  // reflects the change immediately, removing NEW badges from the student row.
  thunkAPI.dispatch(clearReportIsNew(reportId));
  // Also clear isNew in studentReports / classReports so open modals and
  // sub-tables update their per-row NEW badges without a re-fetch.
  // We dispatch via the slice export below; use a lazy import via getState
  // dispatch pattern to avoid circular refs at module-init time.
  thunkAPI.dispatch({ type: 'simulationReports/clearLocalReportIsNew', payload: reportId });

  // Best-effort API call for each ID — failures are non-fatal.
  // Only send the PATCH when the ID is a valid UUID (the backend endpoint
  // requires a UUID primary key). Legacy IDs like "report-{timestamp}" are
  // skipped so we avoid a guaranteed 400; the local state is already updated
  // above and survives a page reload via localStorage.
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const ids = Array.isArray(reportId) ? reportId : [reportId];
  const uuidIds = ids.filter((id) => UUID_RE.test(id.trim()));
  if (uuidIds.length > 0) {
    await Promise.allSettled(
      uuidIds.map((id) => api.patch(`${config.MarkReportViewedAPI}/${id}/viewed`)),
    );
  }
});

export const GetStudentSimulationReports = createAsyncThunk<
  StudentReportsResponse,
  { studentId: string },
  { rejectValue: { message: string } }
>('simulationReports/getByStudent', async ({ studentId }, thunkAPI) => {
  try {
    const url = `${config.SimsstudentCompletedReport}/${studentId}`;
    const res = await api.get(url);
    return res.data;
  } catch (err) {
    const error = err as {
      response?: {
        status: number;
        data?: {
          status: number;
          message?: string;
        };
      };
    };
    return thunkAPI.rejectWithValue({
      message: error.response?.data?.message || 'Failed to fetch student simulation reports',
    });
  }
});

export const GetClassSimulationReports = createAsyncThunk<
  ClassReportsResponse,
  { classId: string },
  { rejectValue: { message: string }; state: RootState }
>('simulationReports/getByClass', async ({ classId }, thunkAPI) => {
  try {
    const url = `${config.SimsclassCompletedReport}/${classId}`;

    const res = await api.get(url);
    const reports = normalizeReportArray(res.data);
    const reportCount = reports.length;
    thunkAPI.dispatch(setClassReportCount({ classId, reports: reportCount }));

    // Compute the actual unread count by cross-referencing with viewedReportIds.
    // This prevents re-flagging a class when the educator re-opens the reports
    // sub-table after already having viewed all its reports.
    const currentState = thunkAPI.getState();
    const viewedReportIds = currentState.GetClass.viewedReportIds;
    const unreadCount = reports.filter((r) => !viewedReportIds.includes(r.id)).length;

    // Only update the attention state from the API if the locally-tracked
    // unread count is HIGHER than what we just computed. This prevents a
    // stale re-fetch from overwriting a count that was already decremented
    // by markReportViewed before the sub-table was (re-)opened.
    const existingUnread = currentState.GetClass.unreadCountById[classId];
    const finalUnread =
      existingUnread !== undefined
        ? Math.min(existingUnread, unreadCount)
        : unreadCount;

    thunkAPI.dispatch(
      setClassNeedsAttention({
        classId,
        needsAttention: finalUnread > 0,
        unreadCount: finalUnread,
      }),
    );

    return res.data;
  } catch (err) {
    const error = err as { response?: { data?: { message?: string } } };

    return thunkAPI.rejectWithValue({
      message: error.response?.data?.message || 'Failed to fetch class simulation reports',
    });
  }
});

export const FetchClassReportCount = createAsyncThunk<
  void,
  { classId: string },
  { rejectValue: { message: string }; state: RootState }
>('simulationReports/fetchCountOnly', async ({ classId }, thunkAPI) => {
  try {
    const url = `${config.SimsclassCompletedReport}/${classId}`;
    const res = await api.get(url);
    const reports = normalizeReportArray(res.data);
    const count = reports.length;
    thunkAPI.dispatch(setClassReportCount({ classId, reports: count }));

    // Compute the actual unread count by cross-referencing with viewedReportIds.
    const currentState = thunkAPI.getState();
    const viewedReportIds = currentState.GetClass.viewedReportIds;
    const unreadCount = reports.filter((r) => !viewedReportIds.includes(r.id)).length;

    thunkAPI.dispatch(
      setClassNeedsAttention({
        classId,
        needsAttention: unreadCount > 0,
        unreadCount,
      }),
    );
  } catch {
    // best-effort — count failures are non-fatal
  }
});

const simulationReportsSlice = createSlice({
  name: 'simulationReports',
  initialState,
  reducers: {
    resetStudentReports(state) {
      state.studentReports = [];
      state.studentReportsStatus = IDLE;
      state.studentReportsError = null;
    },

    resetClassReports(state) {
      state.classReports = [];
      state.classReportsStatus = IDLE;
      state.classReportsError = null;
    },

    /**
     * Clears the isNew flag on reports in both studentReports and classReports
     * so that NEW badges disappear immediately when a report is viewed, without
     * waiting for a re-fetch. Accepts a single ID or an array.
     */
    clearLocalReportIsNew(
      state,
      action: { payload: string | string[] },
    ) {
      const ids = Array.isArray(action.payload) ? action.payload : [action.payload];
      for (const report of state.studentReports) {
        if (ids.includes(report.id)) report.isNew = false;
      }
      for (const report of state.classReports) {
        if (ids.includes(report.id)) report.isNew = false;
      }
    },

    resetSync(state) {
      state.syncStatus = IDLE;
      state.syncError = null;
    },

    resetSingleReport(state) {
      state.singleReport = null;
      state.singleReportStatus = IDLE;
      state.singleReportError = null;
    },

    resetSimulationReports(state) {
      state.simulationReports = [];
      state.simulationReportsStatus = IDLE;
      state.simulationReportsError = null;
    },
  },

  extraReducers: (builder) => {
    builder
      .addCase(GetStudentSimulationReports.pending, (state) => {
        state.studentReportsStatus = LOADING;
        state.studentReportsError = null;
      })

      .addCase(GetStudentSimulationReports.fulfilled, (state, action) => {
        state.studentReportsStatus = SUCCEEDED;
        state.studentReports = normalizeReportArray(action.payload);
      })

      .addCase(GetStudentSimulationReports.rejected, (state, action) => {
        state.studentReportsStatus = FAILED;
        state.studentReportsError = action.payload?.message ?? 'Error';
      });

    builder
      .addCase(GetClassSimulationReports.pending, (state) => {
        state.classReportsStatus = LOADING;
        state.classReportsError = null;
      })

      .addCase(GetClassSimulationReports.fulfilled, (state, action) => {
        state.classReportsStatus = SUCCEEDED;
        state.classReports = normalizeReportArray(action.payload);
      })

      .addCase(GetClassSimulationReports.rejected, (state, action) => {
        state.classReportsStatus = FAILED;
        state.classReportsError = action.payload?.message ?? 'Error';
      });
  },
});

export const { resetStudentReports, resetClassReports, clearLocalReportIsNew, resetSync, resetSingleReport, resetSimulationReports } = simulationReportsSlice.actions;

export default simulationReportsSlice.reducer;

const selectSimReports = (state: RootState) => state.simsCompletedReports;

export const selectStudentReports = createSelector(selectSimReports, (s) => s.studentReports);

export const selectStudentReportsStatus = createSelector(
  selectSimReports,
  (s) => s.studentReportsStatus,
);

export const selectClassReports = createSelector(selectSimReports, (s) => s.classReports);

export const selectClassReportsStatus = createSelector(
  selectSimReports,
  (s) => s.classReportsStatus,
);

export const selectClassReportsError = createSelector(selectSimReports, (s) => s.classReportsError);

export const selectSyncedSimsCompleted = createSelector(
  selectSimReports,
  (s) => s.syncedSimsCompleted,
);

export const selectSingleReport = createSelector(selectSimReports, (s) => s.singleReport);
export const selectSingleReportStatus = createSelector(
  selectSimReports,
  (s) => s.singleReportStatus,
);
export const selectSingleReportError = createSelector(selectSimReports, (s) => s.singleReportError);

export const selectSimulationReports = createSelector(selectSimReports, (s) => s.simulationReports);
export const selectSimulationReportsStatus = createSelector(selectSimReports, (s) => s.simulationReportsStatus);
export const selectSimulationReportsError = createSelector(selectSimReports, (s) => s.simulationReportsError);
