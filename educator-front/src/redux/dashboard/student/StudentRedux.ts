import {
  createAsyncThunk,
  createSelector,
  createSlice,
} from '@reduxjs/toolkit';
import type { RootState } from '../../../store';
import { FAILED, IDLE, LOADING, SUCCEEDED } from '../../../utils/constants';
import config from '../../config';
import api from '@/redux/api';

export interface FailedRow {
  row: {
    student_id: string;
    student_name: string;
    email: string;
    class_id: string;
    user_id: string;
  };
  error: string;
}

export interface ImportRosterData {
  total: number;
  inserted: number;
  failedCount: number;
  failed: FailedRow[];
}

export interface ImportRosterResponse {
  status: string;
  message: string;
  data: ImportRosterData;
}

export interface StudentState {
  importResult: ImportRosterResponse | null;
  status: 'idle' | 'loading' | 'succeeded' | 'failed';
  error: string | null;
}

const initialState: StudentState = {
  importResult: null,
  status: IDLE,
  error: null,
};

export const ImportStudentRosterRequest = createAsyncThunk<
  ImportRosterResponse,
  { file: File; confirm?: boolean },
  { rejectValue: { message: string } }
>('dashboard/importStudentRoster', async ({ file, confirm }, thunkAPI) => {
  try {
    const formData = new FormData();
    formData.append('file', file);

    if (confirm === true) {
      formData.append('confirm', 'true');
    }
    const res = await api.post(config.StudentAPI, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return res.data;
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
    return thunkAPI.rejectWithValue({
      message: error.response?.data?.message || 'Failed to import roster',
    });
  }
});

const StudentSlice = createSlice({
  name: 'dashboard/student',
  initialState,
  reducers: {
    clearStudentState(state) {
      state.importResult = null;
      state.status = IDLE;
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder.addCase(ImportStudentRosterRequest.pending, (state) => {
      state.status = LOADING;
      state.error = null;
      state.importResult = null;
    });
    builder.addCase(ImportStudentRosterRequest.fulfilled, (state, action) => {
      state.status = SUCCEEDED;
      state.importResult = action.payload;
    });
    builder.addCase(ImportStudentRosterRequest.rejected, (state, action) => {
      state.status = FAILED;
      state.error = action.payload?.message || 'Failed to import roster';
    });
  },
});

export const { clearStudentState } = StudentSlice.actions;
export default StudentSlice.reducer;

const selectState = (state: RootState) => state.Student;

export const selectStudentStatus = createSelector(selectState, (s) => s.status);
export const selectStudentError = createSelector(selectState, (s) => s.error);
export const selectImportResult = createSelector(
  selectState,
  (s) => s.importResult
);
