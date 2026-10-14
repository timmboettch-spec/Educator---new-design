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

export interface BulkPostStudentPayload {
  class_id: string;
  count: number;
}

export interface BulkStudentData {
  id: string;
  student_id: string;
  class_id: string;
  status: string;
}

export interface BulkPostStudentResponse {
  status: string;
  message: string;
  data: BulkStudentData[];
}

export interface BulkPostStudentState {
  response: BulkPostStudentResponse | null;
  status: 'idle' | 'loading' | 'succeeded' | 'failed';
  error: string | null;
}

const initialState: BulkPostStudentState = {
  response: null,
  status: IDLE,
  error: null,
};

export const BulkPostStudentRequest = createAsyncThunk<
  BulkPostStudentResponse,
  BulkPostStudentPayload,
  { rejectValue: { message: string } }
>('student/bulk-post', async (payload, thunkAPI) => {
  try {
    const res = await api.post(config.StudentBulkAPI, payload);
    return res.data as BulkPostStudentResponse;
  } catch (err: unknown) {
    const error = err as {
      response?: { data?: { message?: string } };
    };
    return thunkAPI.rejectWithValue({
      message:
        error.response?.data?.message || 'Failed to bulk create students',
    });
  }
});

const bulkPostStudentSlice = createSlice({
  name: 'student/bulk-post',
  initialState,
  reducers: {
    clearBulkPostStudentState(state) {
      state.response = null;
      state.status = IDLE;
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(BulkPostStudentRequest.pending, (state) => {
        state.status = LOADING;
        state.error = null;
      })
      .addCase(
        BulkPostStudentRequest.fulfilled,
        (state, action: PayloadAction<BulkPostStudentResponse>) => {
          state.status = SUCCEEDED;
          state.response = action.payload;
        }
      )
      .addCase(BulkPostStudentRequest.rejected, (state, action) => {
        state.status = FAILED;
        state.error =
          action.payload?.message || 'Failed to bulk create students';
      });
  },
});

export const { clearBulkPostStudentState } = bulkPostStudentSlice.actions;
export default bulkPostStudentSlice.reducer;

const selectBulkPostStudentState = (state: RootState) => state.BulkPostStudent;
export const selectBulkPostStudentLoading = createSelector(
  selectBulkPostStudentState,
  (s) => s.status === LOADING
);
