import type { PayloadAction } from '@reduxjs/toolkit';
import {
  createAsyncThunk,
  createSelector,
  createSlice,
} from '@reduxjs/toolkit';
import config from '../../config';
import type { RootState } from '../../../store';
import { FAILED, IDLE, LOADING, SUCCEEDED } from '../../../utils/constants';
import api from '@/redux/api';

export interface PutStudentPayload {
  id: string;
  student_name: string;
  email?: string;
}

export interface PutStudentResponse {
  status: string;
  message: string;
  data: {
    id: string;
    student_id: string;
    student_name: string;
    email: string | null;
    class_id: string;
    status: string;
  };
}

export interface PutStudentState {
  response: PutStudentResponse | null;
  status: 'idle' | 'loading' | 'succeeded' | 'failed';
  error: string | null;
}

const initialState: PutStudentState = {
  response: null,
  status: IDLE,
  error: null,
};

export const PutStudentRequest = createAsyncThunk(
  'student/put',
  async (payload: PutStudentPayload, thunkAPI) => {
    try {
      const res = await api.put(`${config.StudentAPI}/${payload.id}`, {
        student_name: payload.student_name,
        ...(payload.email && { email: payload.email }),
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
        message: error.response?.data?.message || 'Failed to update student',
      });
    }
  }
);

const putStudentSlice = createSlice({
  name: 'student/put',
  initialState,
  reducers: {
    clearPutStudentState(state) {
      state.response = null;
      state.status = IDLE;
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(PutStudentRequest.pending, (state) => {
        state.status = LOADING;
        state.error = null;
      })
      .addCase(
        PutStudentRequest.fulfilled,
        (state, action: PayloadAction<PutStudentResponse>) => {
          state.status = SUCCEEDED;
          state.response = action.payload;
        }
      )
      .addCase(PutStudentRequest.rejected, (state, action) => {
        state.status = FAILED;
        state.error =
          (action.payload as { message?: string })?.message ||
          'Failed to update student';
      });
  },
});

export const { clearPutStudentState } = putStudentSlice.actions;
export default putStudentSlice.reducer;

const selectPutStudentState = (state: RootState) => state.PatchStudent;

export const selectPutStudentLoading = createSelector(
  selectPutStudentState,
  (s) => s.status === LOADING
);
export const selectPutStudentSuccess = createSelector(
  selectPutStudentState,
  (s) => s.status === SUCCEEDED
);
export const selectPutStudentError = createSelector(
  selectPutStudentState,
  (s) => s.error
);
export const selectPutStudentResponse = createSelector(
  selectPutStudentState,
  (s) => s.response
);
