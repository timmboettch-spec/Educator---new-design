import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import type { RootState } from '../../store';
import config from '../config';
import api from '../api';

interface EmailAccessCodeState {
  loading: boolean;
  success: boolean;
  error: string | null;
  count: number | null;
}

const initialState: EmailAccessCodeState = {
  loading: false,
  success: false,
  error: null,
  count: null,
};

interface SingleEmailPayload {
  subject: string;
  message: string;
  accessCode: true;
  class_id: string;
  student_id: string;
  email?: string | null;
}

interface BulkEmailPayload {
  subject: string;
  message: string;
  accessCode: true;
  class_id: string;
  student_id?: never;
}

export const sendEmailAccessCodeRequest = createAsyncThunk<
  { status: string; message: string; count?: number },
  SingleEmailPayload | BulkEmailPayload,
  { rejectValue: string }
>('studentEmailAccessCode/send', async (payload, { rejectWithValue }) => {
  try {
    const res = await api.post(config.AccessCodeApi, payload);
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
    return rejectWithValue(error.response?.data?.message || 'Failed to send email');
  }
});
const studentEmailAccessCodeSlice = createSlice({
  name: 'studentEmailAccessCode',
  initialState,
  reducers: {
    clearEmailAccessCodeState: (state) => {
      state.loading = false;
      state.success = false;
      state.error = null;
      state.count = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(sendEmailAccessCodeRequest.pending, (state) => {
        state.loading = true;
        state.success = false;
        state.error = null;
      })
      .addCase(sendEmailAccessCodeRequest.fulfilled, (state, action) => {
        state.loading = false;
        state.success = true;
        state.count = action.payload?.count ?? null;
      })
      .addCase(sendEmailAccessCodeRequest.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload || 'Failed to send email';
      });
  },
});

export const { clearEmailAccessCodeState } = studentEmailAccessCodeSlice.actions;
export default studentEmailAccessCodeSlice.reducer;
export const selectEmailAccessCodeLoading = (state: RootState) => state.studentEmailAccess.loading;
export const selectEmailAccessCodeSuccess = (state: RootState) => state.studentEmailAccess.success;
export const selectEmailAccessCodeError = (state: RootState) => state.studentEmailAccess.error;
export const selectEmailAccessCodeCount = (state: RootState) => state.studentEmailAccess.count;
