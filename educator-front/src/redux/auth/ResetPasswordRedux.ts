import { createAsyncThunk, createSelector, createSlice } from '@reduxjs/toolkit';
import axios from 'axios';

import type { RootState } from '../../store';
import { FAILED, IDLE, LOADING, SUCCEEDED } from '../../utils/constants';
import config from '../config';

export interface ResetPasswordPayload {
  verified_token: string;
  new_password: string;
}

export interface ResetPasswordResponse {
  reset_token: string;
}

export interface ResponseResetPassword {
  data: ResetPasswordResponse;
  message: string;
  status: string;
}

export interface ResetPasswordState {
  responseResetPassword: ResponseResetPassword | null;
  status: 'idle' | 'loading' | 'succeeded' | 'failed';
  error: string | null;
  rememberedEmail: string;
}
const savedEmail =
  typeof window !== 'undefined' ? localStorage.getItem('remembered_email') || '' : '';

const initialState: ResetPasswordState = {
  responseResetPassword: null,
  status: IDLE,
  error: null,
  rememberedEmail: savedEmail,
};

export const ResetPasswordRequest = createAsyncThunk<
  ResponseResetPassword,
  ResetPasswordPayload,
  { rejectValue: { message: string } }
>('auth/ResetPassword', async (data, thunkAPI) => {
  try {
    const res = await axios.post(config.ResetPasswordAPI, data, {
      withCredentials: true,
    });
    return res.data;
  } catch (err) {
    const error = err as { response?: { data?: { message?: string } } };
    return thunkAPI.rejectWithValue({
      message: error.response?.data?.message || 'ResetPassword failed',
    });
  }
});

const ResetPasswordSlice = createSlice({
  name: 'auth/ResetPassword',
  initialState,
  reducers: {
    resetpassword(state) {
      state.responseResetPassword = null;
      state.status = IDLE;
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder.addCase(ResetPasswordRequest.pending, (state) => {
      state.status = LOADING;
      state.error = null;
    });

    builder.addCase(ResetPasswordRequest.fulfilled, (state, action) => {
      state.status = SUCCEEDED;
      state.responseResetPassword = action.payload;
    });

    builder.addCase(ResetPasswordRequest.rejected, (state, action) => {
      state.status = FAILED;
      state.error = action.payload?.message || 'ResetPassword failed';
    });
  },
});

export const { resetpassword } = ResetPasswordSlice.actions;

export default ResetPasswordSlice.reducer;

const selectState = (state: RootState) => state.ResetPassword;

export const selectResetPasswordResponse = createSelector(
  selectState,
  (state) => state.responseResetPassword,
);

export const selectResetPasswordStatus = createSelector(selectState, (state) => state.status);

export const selectResetPasswordError = createSelector(selectState, (state) => state.error);
