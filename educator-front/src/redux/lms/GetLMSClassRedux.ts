import { createAsyncThunk, createSelector, createSlice } from '@reduxjs/toolkit';
import type { RootState } from '../../store';
import { FAILED, IDLE, LOADING, SUCCEEDED } from '../../utils/constants';
import config from '../config';
import api from '../api';

export interface MoodleMappedStudent {
  user_id?: string;
  name?: string;
  email?: string;
  studentCode?: string;
  studentName?: string;
  lmsUserId?: string | null;
  status?: string;
  is_active?: boolean;
  [key: string]: unknown;
}

export interface MoodleMappedClass {
  classId?: string;
  className?: string;
  lmsCourseId?: string | number;
  nrpsUrl?: string | null;
  students?: MoodleMappedStudent[];
  [key: string]: unknown;
}

export interface MoodleMappedClassesResponse {
  classes: MoodleMappedClass[];
  total?: number;
}

interface MoodleClassState {
  data: MoodleMappedClassesResponse | null;
  status: 'idle' | 'loading' | 'succeeded' | 'failed';
  error: string | null;
}

const initialState: MoodleClassState = {
  data: null,
  status: IDLE,
  error: null,
};

export const fetchLMSClasses = createAsyncThunk<
  MoodleMappedClassesResponse,
  void,
  { rejectValue: { message: string } }
>('moodleClasses/fetch', async (_, thunkAPI) => {
  try {
    const res = await api.get(config.LmsMoodleMappedClassesAPI, {
      headers: { 'ngrok-skip-browser-warning': 'true' },
    });
    const rawClasses: MoodleMappedClass[] = res.data?.data?.classes ?? [];
    const classes: MoodleMappedClass[] = rawClasses.map((cls) => ({
      ...cls,
      students: (cls.students ?? []).map((s): MoodleMappedStudent => ({
        ...s,
        name: (s.studentName as string | undefined) ?? s.name ?? undefined,
        user_id: (s.studentCode as string | undefined) ?? s.user_id ?? undefined,
      })),
    }));
    const total: number = res.data?.data?.total ?? classes.length;
    return { classes, total };
  } catch (err) {
    const error = err as { response?: { data?: { message?: string } } };
    return thunkAPI.rejectWithValue({
      message: error.response?.data?.message ?? 'Failed to fetch Moodle classes',
    });
  }
});

const moodleClassSlice = createSlice({
  name: 'moodleClasses',
  initialState,
  reducers: {
    resetMoodleClassState(state) {
      state.data = null;
      state.status = IDLE;
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchLMSClasses.pending, (state) => {
        state.status = LOADING;
        state.error = null;
      })
      .addCase(fetchLMSClasses.fulfilled, (state, action) => {
        state.status = SUCCEEDED;
        state.data = action.payload;
      })
      .addCase(fetchLMSClasses.rejected, (state, action) => {
        state.status = FAILED;
        state.error = action.payload?.message ?? 'Failed to fetch Moodle classes';
      });
  },
});

export const { resetMoodleClassState } = moodleClassSlice.actions;

const selectMoodleClassState = (state: RootState) => state.moodleClasses;

export const selectMoodleClasses = createSelector(
  selectMoodleClassState,
  (s) => s.data?.classes ?? [],
);

export const selectMoodleClassStatus = createSelector(
  selectMoodleClassState,
  (s) => s.status,
);

export const selectMoodleClassError = createSelector(
  selectMoodleClassState,
  (s) => s.error,
);

export default moodleClassSlice.reducer;
