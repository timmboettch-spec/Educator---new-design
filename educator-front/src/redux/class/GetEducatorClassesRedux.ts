import {
  createAsyncThunk,
  createSlice,
  createSelector,
} from '@reduxjs/toolkit';
import axios from 'axios';
import type { RootState } from '../../store';
import config from '../config';
import api from '../api';
import type { ClassWithStudents } from '../../types/Class_types';

// ── Types ──────────────────────────────────────────────────────────────────

interface GetEducatorClassesResponse {
  status: string;
  message: string;
  data: ClassWithStudents[];
}

interface GetEducatorClassesState {
  status: 'idle' | 'loading' | 'succeeded' | 'failed';
  error: string | null;
  classes: ClassWithStudents[];
  educatorId: string | null;
}

// ── Initial state ──────────────────────────────────────────────────────────

const initialState: GetEducatorClassesState = {
  status: 'idle',
  error: null,
  classes: [],
  educatorId: null,
};

// ── Thunk ──────────────────────────────────────────────────────────────────

export const GetEducatorClassesRequest = createAsyncThunk<
  GetEducatorClassesResponse & { educatorId: string },
  string,
  { rejectValue: string }
>(
  'classTransfer/getEducatorClasses',
  async (educatorId, { rejectWithValue }) => {
    try {
      const res = await api.get<GetEducatorClassesResponse>(
        `${config.ClassTransferAPI}/educator/${educatorId}/classes`,
        { headers: { 'ngrok-skip-browser-warning': 'true' } }
      );
      return { ...res.data, educatorId };
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        const msg =
          (err.response?.data as { message?: string })?.message ||
          'Failed to fetch educator classes';
        return rejectWithValue(msg);
      }
      return rejectWithValue('Failed to fetch educator classes');
    }
  }
);

// ── Slice ──────────────────────────────────────────────────────────────────

const GetEducatorClassesSlice = createSlice({
  name: 'getEducatorClasses',
  initialState,
  reducers: {
    clearEducatorClasses: (state) => {
      state.status = 'idle';
      state.error = null;
      state.classes = [];
      state.educatorId = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(GetEducatorClassesRequest.pending, (state) => {
        state.status = 'loading';
        state.error = null;
        state.classes = [];
      })
      .addCase(GetEducatorClassesRequest.fulfilled, (state, action) => {
        state.status = 'succeeded';
        state.classes = action.payload.data ?? [];
        state.educatorId = action.payload.educatorId;
      })
      .addCase(GetEducatorClassesRequest.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.payload ?? 'Failed to fetch educator classes';
      });
  },
});

export const { clearEducatorClasses } = GetEducatorClassesSlice.actions;

const selectEducatorClassesState = (state: RootState) =>
  (
    state as RootState & {
      GetEducatorClassesForTransfer?: GetEducatorClassesState;
    }
  ).GetEducatorClassesForTransfer;

export const selectEducatorClassesForTransfer = createSelector(
  selectEducatorClassesState,
  (state) => state?.classes ?? []
);

export const selectEducatorClassesStatus = createSelector(
  selectEducatorClassesState,
  (state) => state?.status ?? 'idle'
);

export default GetEducatorClassesSlice.reducer;
