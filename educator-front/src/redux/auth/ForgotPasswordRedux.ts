import { createAsyncThunk, createSelector, createSlice } from '@reduxjs/toolkit';
import axios from 'axios';

import type { RootState } from '../../store';
import { FAILED, IDLE, LOADING, SUCCEEDED } from '../../utils/constants';
import config from '../config';
import { incrementApiRequest, decrementApiRequest } from '../loader/loaderSlice';

export interface ForgotPasswordPayload {
  email: string;
  role?: string;
}

export interface ForgotPasswordResponse {
  reset_token?: string;
  roles?: string[];
}

export interface ResponseForgotPassword {
  data: ForgotPasswordResponse;
  message: string;
  status: string;
}

export interface ForgotPasswordState {
  responseForgotPassword: ResponseForgotPassword | null;
  status: 'idle' | 'loading' | 'succeeded' | 'failed';
  error: string | null;
  rememberedEmail: string;
}
const savedEmail =
  typeof window !== 'undefined' ? localStorage.getItem('remembered_email') || '' : '';

const initialState: ForgotPasswordState = {
  responseForgotPassword: null,
  status: IDLE,
  error: null,
  rememberedEmail: savedEmail,
};

export const ForgotPasswordRequest = createAsyncThunk<
  ResponseForgotPassword,
  ForgotPasswordPayload,
  { rejectValue: { message: string } }
>('auth/ForgotPassword', async (data, thunkAPI) => {
  thunkAPI.dispatch(incrementApiRequest());
  try {
    const res = await axios.post(config.ForgotPasswordAPI, data, {
      withCredentials: true,
    });
    thunkAPI.dispatch(decrementApiRequest());
    return res.data;
  } catch (err) {
    thunkAPI.dispatch(decrementApiRequest());
    const error = err as { response?: { data?: { message?: string } } };
    return thunkAPI.rejectWithValue({
      message: error.response?.data?.message || 'ForgotPassword failed',
    });
  }
});

const ForgotPasswordSlice = createSlice({
  name: 'auth/ForgotPassword',
  initialState,
  reducers: {
    logout(state) {
      state.responseForgotPassword = null;
      state.status = IDLE;
      state.error = null;
    },
    resetError(state) {
      state.error = null;
      state.status = IDLE;
    },
    setRememberedEmail(state, action) {
      state.rememberedEmail = action.payload;
      if (action.payload) {
        localStorage.setItem('remembered_email', action.payload);
      } else {
        localStorage.removeItem('remembered_email');
      }
    },
  },
  extraReducers: (builder) => {
    builder.addCase(ForgotPasswordRequest.pending, (state) => {
      state.status = LOADING;
      state.error = null;
    });

    builder.addCase(ForgotPasswordRequest.fulfilled, (state, action) => {
      state.status = SUCCEEDED;
      state.responseForgotPassword = action.payload;
    });

    builder.addCase(ForgotPasswordRequest.rejected, (state, action) => {
      state.status = FAILED;
      state.error = action.payload?.message || 'ForgotPassword failed';
    });
  },
});

export const { logout, setRememberedEmail, resetError } = ForgotPasswordSlice.actions;

export default ForgotPasswordSlice.reducer;

const selectState = (state: RootState) => state.ForgotPassword;

export const selectForgotPasswordResponse = createSelector(
  selectState,
  (state) => state.responseForgotPassword,
);

export const selectForgotPasswordStatus = createSelector(selectState, (state) => state.status);

export const selectForgotPasswordError = createSelector(selectState, (state) => state.error);
