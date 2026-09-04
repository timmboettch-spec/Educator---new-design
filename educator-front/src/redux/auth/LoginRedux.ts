import { createAsyncThunk, createSelector, createSlice } from '@reduxjs/toolkit';

import type { RootState } from '../../store';
import { FAILED, IDLE, LOADING, SUCCEEDED } from '../../utils/constants';
import config from '../config';
import api from '../api';

export interface LoginPayload {
  email: string;
  password: string;
}

export interface EducatorUser {
  id: string;
  email: string;
  full_name: string | null;
  status: string;
  phone_number?: string | null;
  total_tokens?: number;
  tokens?: number;
  profile_picture?: string | null;
  role: string;
  lms_enabled?: boolean;
  school?: { id: string; school_name: string; lms_enabled?: boolean } | null;
}

export interface LoginResponse {
  tokens: {
    accessToken: string;
    csrfToken: string;
  };
  user: {
    id: string;
    email: string;
    full_name: string;
    is_license_active: boolean;
    [key: string]: unknown;
  };
  /** Present only when the same email exists as both Admin and active Educator. */
  has_dual_role?: boolean;
  educator_tokens?: { accessToken: string; csrfToken: string };
  educator_user?: EducatorUser;
}

export interface ResponseLogin {
  data: LoginResponse;
  message: string;
  status: string;
}

export interface LoginState {
  responseLogin: ResponseLogin | null;
  status: 'idle' | 'loading' | 'succeeded' | 'failed';
  error: string | null;
  rememberedEmail: string;
  sessionChecked: boolean;
}
const savedEmail =
  typeof window !== 'undefined' ? localStorage.getItem('remembered_email') || '' : '';

const initialState: LoginState = {
  responseLogin: null,
  status: IDLE,
  error: null,
  rememberedEmail: savedEmail,
  sessionChecked: false,
};

export const LoginRequest = createAsyncThunk<
  ResponseLogin,
  LoginPayload,
  { rejectValue: { message: string } }
>('auth/login', async (data, thunkAPI) => {
  try {
    const res = await api.post(config.LoginAPI, data);
    return res.data;
  } catch (err) {
    const error = err as { response?: { data?: { message?: string } } };
    return thunkAPI.rejectWithValue({
      message: error.response?.data?.message || 'Login failed',
    });
  }
});

const LoginSlice = createSlice({
  name: 'auth/login',
  initialState,
  reducers: {
    logout(state) {
      state.responseLogin = null;
      state.status = IDLE;
      state.error = null;
      state.sessionChecked = true;
      state.rememberedEmail = '';
    },
    restoreSession(state, action) {
      state.responseLogin = action.payload;
      state.status = SUCCEEDED;
      state.sessionChecked = true;
    },
    markSessionChecked(state) {
      state.sessionChecked = true;
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
    builder.addCase(LoginRequest.pending, (state) => {
      state.status = LOADING;
      state.error = null;
    });

    builder.addCase(LoginRequest.fulfilled, (state, action) => {
      state.status = SUCCEEDED;
      state.sessionChecked = true;
      // For dual-role logins, skip storing responseLogin until the user picks
      // a role. This prevents AppRouter from seeing isAuthenticated=true and
      // redirecting away from /login before the role-choice popup can render.
      if (!action.payload.data?.has_dual_role) {
        state.responseLogin = action.payload;
      }
    });

    builder.addCase(LoginRequest.rejected, (state, action) => {
      state.status = FAILED;
      state.error = action.payload?.message || 'Login failed';
    });
  },
});

export const { logout, restoreSession, markSessionChecked, setRememberedEmail } =
  LoginSlice.actions;

export default LoginSlice.reducer;

const selectState = (state: RootState) => state.Login;

export const selectLoginResponse = createSelector(selectState, (state) => state.responseLogin);

export const selectLoginStatus = createSelector(selectState, (state) => state.status);

export const selectLoginError = createSelector(selectState, (state) => state.error);
export const selectRememberedEmail = createSelector(selectState, (state) => state.rememberedEmail);
export const selectSessionChecked = createSelector(selectState, (state) => state.sessionChecked);

export const selectCurrentUser = createSelector(
  selectState,
  (state) => state.responseLogin?.data?.user ?? null,
);

export const selectIsStartTrial = createSelector(
  selectCurrentUser,
  (user) => user && user.is_license_active === false,
);
