import { createAsyncThunk, createSelector, createSlice } from '@reduxjs/toolkit';
import axios from 'axios';
import type { RootState } from '../../store';
import { FAILED, IDLE, LOADING, SUCCEEDED } from '../../utils/constants';
import config from '../config';

export interface SignUpPayload {
  email: string;
  password: string;
  full_name: string;
  invite_id?: string;
}

export interface SignUpResponse {
  tokens: {
    accessToken: string;
  };
  user: {
    id: string;
    email: string;
    full_name: string;
    isLicenseActive: boolean;
  };
}

export interface ResponseSignUp {
  data: SignUpResponse;
  message: string;
  status: string;
}

export interface SignUpState {
  responseSignUp: ResponseSignUp | null;
  status: 'idle' | 'loading' | 'succeeded' | 'failed';
  error: string | null;
}

const initialState: SignUpState = {
  responseSignUp: null,
  status: IDLE,
  error: null,
};

export const SignUpRequest = createAsyncThunk<
  ResponseSignUp,
  SignUpPayload,
  { rejectValue: { message: string } }
>('auth/SignUp', async (data, thunkAPI) => {
  try {
    const res = await axios.post(config.SignUpAPI, data, {
      withCredentials: true,
    });
    return res.data;
  } catch (err) {
    const error = err as { response?: { data?: { message?: string } } };
    return thunkAPI.rejectWithValue({
      message: error.response?.data?.message || 'SignUp failed',
    });
  }
});

const SignUpSlice = createSlice({
  name: 'auth/SignUp',
  initialState,
  reducers: {
    logout(state) {
      state.responseSignUp = null;
      state.status = IDLE;
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder.addCase(SignUpRequest.pending, (state) => {
      state.status = LOADING;
      state.error = null;
    });

    builder.addCase(SignUpRequest.fulfilled, (state, action) => {
      state.status = SUCCEEDED;
      state.responseSignUp = action.payload;
    });

    builder.addCase(SignUpRequest.rejected, (state, action) => {
      state.status = FAILED;
      state.error = action.payload?.message || 'SignUp failed';
    });
  },
});

export const { logout } = SignUpSlice.actions;

export default SignUpSlice.reducer;

const selectState = (state: RootState) => state.SignUp;

export const selectSignUpResponse = createSelector(selectState, (state) => state.responseSignUp);

export const selectSignUpStatus = createSelector(selectState, (state) => state.status);

export const selectSignUpError = createSelector(selectState, (state) => state.error);
