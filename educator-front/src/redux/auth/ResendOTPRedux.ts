import { createAsyncThunk, createSelector, createSlice } from '@reduxjs/toolkit';
import axios from 'axios';

import type { RootState } from '../../store';
import { FAILED, IDLE, LOADING, SUCCEEDED } from '../../utils/constants';
import config from '../config';

export interface ResendOTPPayload {
  reset_token: string;
}

export interface ResendOTPResponse {
  reset_token: string;
}

export interface ResponseResendOTP {
  data: ResendOTPResponse;
  message: string;
  status: string;
}

export interface ResendOTPState {
  responseResendOTP: ResponseResendOTP | null;
  status: 'idle' | 'loading' | 'succeeded' | 'failed';
  error: string | null;
  rememberedEmail: string;
}
const savedEmail =
  typeof window !== 'undefined' ? localStorage.getItem('remembered_email') || '' : '';

const initialState: ResendOTPState = {
  responseResendOTP: null,
  status: IDLE,
  error: null,
  rememberedEmail: savedEmail,
};

export const ResendOTPRequest = createAsyncThunk<
  ResponseResendOTP,
  ResendOTPPayload,
  { rejectValue: { message: string } }
>('auth/ResendOTP', async (data, thunkAPI) => {
  try {
    const res = await axios.post(config.ResendOTPAPI, data, {
      withCredentials: true,
    });
    return res.data;
  } catch (err) {
    const error = err as { response?: { data?: { message?: string } } };
    return thunkAPI.rejectWithValue({
      message: error.response?.data?.message || 'ResendOTP failed',
    });
  }
});

const ResendOTPSlice = createSlice({
  name: 'auth/ResendOTP',
  initialState,
  reducers: {
    resendOTP(state) {
      state.responseResendOTP = null;
      state.status = IDLE;
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder.addCase(ResendOTPRequest.pending, (state) => {
      state.status = LOADING;
      state.error = null;
    });

    builder.addCase(ResendOTPRequest.fulfilled, (state, action) => {
      state.status = SUCCEEDED;
      state.responseResendOTP = action.payload;
    });

    builder.addCase(ResendOTPRequest.rejected, (state, action) => {
      state.status = FAILED;
      state.error = action.payload?.message || 'ResendOTP failed';
    });
  },
});

export const { resendOTP } = ResendOTPSlice.actions;

export default ResendOTPSlice.reducer;

const selectState = (state: RootState) => state.ResendOTP;

export const selectResendOTPResponse = createSelector(
  selectState,
  (state) => state.responseResendOTP,
);

export const selectResendOTPStatus = createSelector(selectState, (state) => state.status);

export const selectResendOTPError = createSelector(selectState, (state) => state.error);
