import { createAsyncThunk, createSelector, createSlice } from '@reduxjs/toolkit';
import axios from 'axios';

import type { RootState } from '../../store';
import { FAILED, IDLE, LOADING, SUCCEEDED } from '../../utils/constants';
import config from '../config';

export interface VerifyOTPPayload {
  otp: string;
  reset_token: string;
}

export interface VerifyOTPResponse {
  verified_token: string;
}

export interface ResponseVerifyOTP {
  data: VerifyOTPResponse;
  message: string;
  status: string;
}

export interface VerifyOTPState {
  responseVerifyOTP: ResponseVerifyOTP | null;
  status: 'idle' | 'loading' | 'succeeded' | 'failed';
  error: string | null;
  rememberedEmail: string;
}
const savedEmail =
  typeof window !== 'undefined' ? localStorage.getItem('remembered_email') || '' : '';

const initialState: VerifyOTPState = {
  responseVerifyOTP: null,
  status: IDLE,
  error: null,
  rememberedEmail: savedEmail,
};

export const VerifyOTPRequest = createAsyncThunk<
  ResponseVerifyOTP,
  VerifyOTPPayload,
  { rejectValue: { message: string } }
>('auth/VerifyOTP', async (data, thunkAPI) => {
  try {
    const res = await axios.post(config.VerifyOTPAPI, data, {
      withCredentials: true,
    });
    return res.data;
  } catch (err) {
    const error = err as { response?: { data?: { message?: string } } };
    return thunkAPI.rejectWithValue({
      message: error.response?.data?.message || 'VerifyOTP failed',
    });
  }
});

const VerifyOTPSlice = createSlice({
  name: 'auth/VerifyOTP',
  initialState,
  reducers: {
    verifyOTP(state) {
      state.responseVerifyOTP = null;
      state.status = IDLE;
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder.addCase(VerifyOTPRequest.pending, (state) => {
      state.status = LOADING;
      state.error = null;
    });

    builder.addCase(VerifyOTPRequest.fulfilled, (state, action) => {
      state.status = SUCCEEDED;
      state.responseVerifyOTP = action.payload;
    });

    builder.addCase(VerifyOTPRequest.rejected, (state, action) => {
      state.status = FAILED;
      state.error = action.payload?.message || 'VerifyOTP failed';
    });
  },
});

export const { verifyOTP } = VerifyOTPSlice.actions;

export default VerifyOTPSlice.reducer;

const selectState = (state: RootState) => state.VerifyOTP;

export const selectVerifyOTPResponse = createSelector(
  selectState,
  (state) => state.responseVerifyOTP,
);

export const selectVerifyOTPStatus = createSelector(selectState, (state) => state.status);

export const selectVerifyOTPError = createSelector(selectState, (state) => state.error);
