import {
  createAsyncThunk,
  createSelector,
  createSlice,
} from '@reduxjs/toolkit';
import axios from 'axios';
import type { RootState } from '../../store';
import { FAILED, IDLE, LOADING, SUCCEEDED } from '../../utils/constants';
import { normalizeAuthUser } from '../../utils/normalizeAuthUser';
import config from '../config';
import type { LoginResponse } from './LoginRedux';

export interface SignUpPayload {
  email: string;
  password: string;
  fullName?: string;
  phoneNumber?: string;
}

/** Signup auto-authenticates and returns the same shape as login. */
export type SignUpResponse = LoginResponse;

export interface ResponseSignUp {
  data: SignUpResponse;
  message: string;
  /** Dropped by the new response envelope; still sent by the old one. */
  status?: string;
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
    // Signup returns the login shape; flatten userRoles[] so the consumers of
    // responseSignUp (AppRouter, RedeemHeader) keep reading role/full_name.
    const body = res.data as ResponseSignUp;
    return {
      ...body,
      data: {
        ...body.data,
        user: (normalizeAuthUser(body.data?.user) ??
          body.data?.user) as SignUpResponse['user'],
      },
    };
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

export const selectSignUpResponse = createSelector(
  selectState,
  (state) => state.responseSignUp
);

export const selectSignUpStatus = createSelector(
  selectState,
  (state) => state.status
);

export const selectSignUpError = createSelector(
  selectState,
  (state) => state.error
);
