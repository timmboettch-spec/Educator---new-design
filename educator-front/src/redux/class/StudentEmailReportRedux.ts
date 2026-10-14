import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import type { RootState } from '../../store';
import config from '../config';
import api from '../api';

export interface SendEmailReportPayload {
  subject: string;
  message: string;
  sendPdf?: boolean;
  student_id?: string;
  class_id?: string;
  email?: string | null;
  student_name?: string | null;
  score?: number | null;
  attempt?: number | null;
  time_spent?: string | null;
  sims_completed?: string | null;
  scenario_title?: string | null;
  report_id?: string;
  report_key?: string;

  report_type?: 'assessment' | 'progress';
  pdf_base64?: string;
}

interface EmailReportState {
  loading: boolean;
  success: boolean;
  error: string | null;
  message?: string;
}

const initialState: EmailReportState = {
  loading: false,
  success: false,
  error: null,
};

export const sendEmailReportRequest = createAsyncThunk<
  void,
  SendEmailReportPayload,
  { rejectValue: string; state: RootState }
>('emailReport/send', async (payload, { rejectWithValue }) => {
  try {
    const body: Record<string, unknown> = {
      subject: payload.subject,
      message: payload.message,
      sendPdf: payload.sendPdf ?? false,
    };
    if (payload.class_id) body.class_id = payload.class_id;
    if (payload.student_id) body.student_id = payload.student_id;
    if (payload.email != null && payload.email !== '')
      body.email = payload.email;
    if (payload.student_name != null && payload.student_name !== '')
      body.student_name = payload.student_name;
    if (payload.score != null) body.score = payload.score;
    if (payload.attempt != null) body.attempt = payload.attempt;
    if (payload.time_spent != null && payload.time_spent !== '')
      body.time_spent = payload.time_spent;
    if (payload.sims_completed != null && payload.sims_completed !== '')
      body.sims_completed = payload.sims_completed;
    if (payload.scenario_title != null && payload.scenario_title !== '')
      body.scenario_title = payload.scenario_title;
    if (payload.report_id) body.report_id = payload.report_id;
    if (payload.report_key) body.report_key = payload.report_key;
    if (payload.report_type) body.report_type = payload.report_type;
    if (payload.pdf_base64) body.pdf_base64 = payload.pdf_base64;
    const res = await api.post(config.StudentEmailReport, body);
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
    return rejectWithValue(
      error.response?.data?.message || 'Something went wrong'
    );
  }
});

const emailReportSlice = createSlice({
  name: 'emailReport',
  initialState,
  reducers: {
    clearEmailReportState(state) {
      state.loading = false;
      state.success = false;
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(sendEmailReportRequest.pending, (state) => {
        state.loading = true;
        state.success = false;
        state.error = null;
      })
      .addCase(sendEmailReportRequest.fulfilled, (state) => {
        state.loading = false;
        state.success = true;
        state.error = null;
      })
      .addCase(sendEmailReportRequest.rejected, (state, action) => {
        state.loading = false;
        state.success = false;
        state.error = action.payload ?? 'Failed to send email report';
      });
  },
});

export const { clearEmailReportState } = emailReportSlice.actions;

export const selectEmailReportLoading = (state: RootState) =>
  state.StudentEmailReport.loading;
export const selectEmailReportSuccess = (state: RootState) =>
  state.StudentEmailReport.success;
export const selectEmailReportError = (state: RootState) =>
  state.StudentEmailReport.error;

export default emailReportSlice.reducer;
