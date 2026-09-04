import { createAsyncThunk, createSlice, createSelector } from '@reduxjs/toolkit';
import type { RootState } from '../../../store';
import config from '../../config';
import type { DashboardApiData, DashboardOverview } from '../../../types/dashboard';
import api from '@/redux/api';

export const getDashboardOverview = createAsyncThunk('dashboard/overview', async (_, thunkAPI) => {
  try {
    const res = await api.get(config.DashboardOverviewAPI, {
        headers: {
          'ngrok-skip-browser-warning': 'true',
        },
      });

    const d: DashboardApiData = res.data.data;
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay());
    weekStart.setHours(0, 0, 0, 0);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    weekEnd.setHours(23, 59, 59, 999);

    const activeClasses = (d.classes?.data ?? []).filter((c) => c.status === 'ACTIVE');

    const activeClassIds = new Set(activeClasses.map((c) => c.id));

    const simsThisWeek: Set<string> = new Set(
      (d.classSimulations?.data ?? [])
        .filter((sim) => {
          if (!activeClassIds.has(sim.class_id)) return false;
          const start = new Date(sim.start_date);
          return start >= weekStart && start <= weekEnd;
        })
        .map((sim) => sim.class_id),
    );

    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(now.getDate() - 30);

    // Active schools that have at least one associated educator (real
    // school_id / schools[] association).
    const activeSchoolList = d.schools?.data?.filter((s) => s.status === 'ACTIVE') ?? [];
    const educatorList = d.educators?.data ?? [];
    const schoolsWithEducators = activeSchoolList.filter((s) => {
      const sid = (s as { id?: string }).id;
      return educatorList.some((e) => {
        const eObj = e as { school_id?: string; schools?: { id?: string }[] };
        return (
          eObj.school_id === sid ||
          (eObj.schools ?? []).some((sc) => sc?.id === sid)
        );
      });
    }).length;

    return {
      totalSchools: d.schools?.total ?? 0,
      activeSchools: d.schools?.data?.filter((s) => s.status === 'ACTIVE').length ?? 0,
      totalClasses: d.classes?.total ?? 0,
      activeClasses: activeClasses.length,
      classesWithSimsThisWeek: simsThisWeek.size,
      // Simulation assignments that belong to an active class (across all
      // schools, educators, and classes).
      activeSimulationAssignments: (d.classSimulations?.data ?? []).filter((sim) =>
        activeClassIds.has(sim.class_id),
      ).length,
      totalStudents: d.students?.total ?? 0,
      studentsActive: d.students?.data?.filter((s) => s.status === 'ACTIVE').length ?? 0,
      studentsActiveLast30Days: d.students?.data?.filter((s) => s.status === 'ACTIVE').length ?? 0,
      totalEducators: d.educators?.total ?? 0,
      activeEducators: d.educators?.data?.filter((e) => e.status === 'ACTIVE').length ?? 0,
      inactiveSchools: d.schools?.data?.filter((s) => s.status === 'INACTIVE').length ?? 0,
      pendingEducators: d.educators?.data?.filter((e) => e.status === 'PENDING').length ?? 0,
      inactiveEducators: d.educators?.data?.filter((e) => e.status === 'INACTIVE').length ?? 0,
      schoolsWithEducators,

      studentIds: (d.students?.data ?? [])
        .map((s) => s.id)
        .filter((id): id is string => !!id),
    };
  } catch (err: unknown) {
    const error = err as {
      response?: {
        status: number;
        data?: {
          status: number;
          message?: string;
        };
      };
    };
    return thunkAPI.rejectWithValue(
      error?.response?.data?.message || 'Failed to fetch dashboard overview',
    );
  }
});

const initialState: {
  data: DashboardOverview | null;
  status: 'idle' | 'loading' | 'succeeded' | 'failed';
  error: string | null;
} = { data: null, status: 'idle', error: null };

const slice = createSlice({
  name: 'dashboardOverview',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(getDashboardOverview.pending, (state) => {
        state.status = 'loading';
      })
      .addCase(getDashboardOverview.fulfilled, (state, action) => {
        state.status = 'succeeded';
        state.data = action.payload;
      })
      .addCase(getDashboardOverview.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.payload as string;
      });
  },
});

export default slice.reducer;

const selectState = (state: RootState) => state.dashboardOverview;

export const selectDashboardOverview = createSelector(selectState, (state) => state.data);
export const selectDashboardOverviewStatus = createSelector(selectState, (state) => state.status);
export const selectDashboardOverviewError = createSelector(selectState, (state) => state.error);
