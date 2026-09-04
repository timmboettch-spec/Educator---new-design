import type { PayloadAction } from '@reduxjs/toolkit';
import { createAsyncThunk, createSelector, createSlice } from '@reduxjs/toolkit';
import config from '../../redux/config';
import type { RootState } from '../../store';
import { FAILED, IDLE, LOADING, SUCCEEDED } from '../../utils/constants';
import api from '../api';

export interface EmailReportPayload {
  subject: string;
  message: string;
  to?: string;
  class_id?: string;
}

export interface EmailReportData {
  sent: number;
  failed: number;
}

export interface EmailReportResponse {
  status: string;
  message: string;
  data: EmailReportData;
}

export interface EmailReportState {
  response: EmailReportResponse | null;
  status: 'idle' | 'loading' | 'succeeded' | 'failed';
  error: string | null;
}

const initialState: EmailReportState = {
  response: null,
  status: IDLE,
  error: null,
};

export const sendEmailReport = createAsyncThunk<
  EmailReportResponse,
  EmailReportPayload,
  { rejectValue: { message: string } }
>('class/sendEmailReport', async (payload, thunkAPI) => {
  try {
    const formData = new FormData();
    formData.append('subject', payload.subject);
    formData.append('message', payload.message);
    if (payload.to) formData.append('to', payload.to);
    if (payload.class_id) formData.append('class_id', payload.class_id);
    const res = await api.post(config.StudentEmailReport, formData,{
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
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
      message: error.response?.data?.message || 'Failed to send email report',
    });
  }
});

const emailReportSlice = createSlice({
  name: 'class/emailReport',
  initialState,
  reducers: {
    clearEmailReportState(state) {
      state.response = null;
      state.status = IDLE;
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(sendEmailReport.pending, (state) => {
        state.status = LOADING;
        state.error = null;
      })
      .addCase(sendEmailReport.fulfilled, (state, action: PayloadAction<EmailReportResponse>) => {
        state.status = SUCCEEDED;
        state.response = action.payload;
      })
      .addCase(sendEmailReport.rejected, (state, action) => {
        state.status = FAILED;
        state.error = action.payload?.message || 'Failed to send email report';
      });
  },
});

export const { clearEmailReportState } = emailReportSlice.actions;
export default emailReportSlice.reducer;

const selectEmailReportState = (state: RootState) => state.EmailReport;

export const selectEmailReportLoading = createSelector(
  selectEmailReportState,
  (s) => s.status === LOADING,
);

export const selectEmailReportSuccess = createSelector(
  selectEmailReportState,
  (s) => s.status === SUCCEEDED,
);

export const selectEmailReportError = createSelector(selectEmailReportState, (s) => s.error);

export const selectEmailReportResponse = createSelector(selectEmailReportState, (s) => s.response);
