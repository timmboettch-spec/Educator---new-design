import {
  createAsyncThunk,
  createSelector,
  createSlice,
} from '@reduxjs/toolkit';

import type { RootState } from '../../store';
import { FAILED, IDLE, LOADING, SUCCEEDED } from '../../utils/constants';
import type { AccessStatus, AuthUserRole } from '../../utils/normalizeAuthUser';
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
  /**
   * Not guaranteed: the documented contract keeps the access token in an
   * httpOnly cookie only, and `csrfToken` is fetched separately via
   * GET /api/auth/csrf-token rather than bundled here.
   */
  tokens?: {
    accessToken: string;
    csrfToken?: string;
  };
  user: {
    /** New contract; `id` is the pre-migration name. */
    userId?: string;
    id?: string;
    email: string;
    full_name?: string;
    is_license_active?: boolean;
    createdAt?: string;
    userRoles?: AuthUserRole[];
    [key: string]: unknown;
  };
  /** Absent means `access_granted` (pre-migration responses omit it). */
  accessStatus?: AccessStatus;
  /**
   * The role the session is acting as. Authoritative after `select-role`, whose
   * response still lists every role in `user.userRoles[]`.
   */
  activeRole?: AuthUserRole | null;
  /** Present only when the same email exists as both Admin and active Educator. */
  has_dual_role?: boolean;
  educator_tokens?: { accessToken: string; csrfToken: string };
  educator_user?: EducatorUser;
}

export interface ResponseLogin {
  data: LoginResponse;
  message: string;
  /** Dropped by the new response envelope; still sent by the old one. */
  status?: string;
}

export interface LoginState {
  responseLogin: ResponseLogin | null;
  status: 'idle' | 'loading' | 'succeeded' | 'failed';
  error: string | null;
  rememberedEmail: string;
  sessionChecked: boolean;
}
const savedEmail =
  typeof window !== 'undefined'
    ? localStorage.getItem('remembered_email') || ''
    : '';

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
    patchLoginUser(state, action: { payload: Record<string, unknown> }) {
      if (!state.responseLogin?.data?.user) return;
      state.responseLogin.data.user = {
        ...state.responseLogin.data.user,
        ...action.payload,
      };
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

    // Deliberately does not store `responseLogin`: SignIn's `finishLogin` is the
    // single commit point for a session. It writes the token to storage (which
    // the axios interceptor reads), then dispatches `restoreSession` with the
    // normalized user, then navigates. Storing the raw payload here made the
    // guards see a token with no resolvable role (the raw user only carries
    // `userRoles[]`), flashing /no-access, and let a dashboard mount and fire
    // requests before the token reached storage.
    builder.addCase(LoginRequest.fulfilled, (state) => {
      state.status = SUCCEEDED;
      state.sessionChecked = true;
    });

    builder.addCase(LoginRequest.rejected, (state, action) => {
      state.status = FAILED;
      state.error = action.payload?.message || 'Login failed';
    });
  },
});

export const {
  logout,
  restoreSession,
  patchLoginUser,
  markSessionChecked,
  setRememberedEmail,
} = LoginSlice.actions;

export default LoginSlice.reducer;

const selectState = (state: RootState) => state.Login;

export const selectLoginResponse = createSelector(
  selectState,
  (state) => state.responseLogin
);

export const selectLoginStatus = createSelector(
  selectState,
  (state) => state.status
);

export const selectLoginError = createSelector(
  selectState,
  (state) => state.error
);
export const selectRememberedEmail = createSelector(
  selectState,
  (state) => state.rememberedEmail
);
export const selectSessionChecked = createSelector(
  selectState,
  (state) => state.sessionChecked
);

export const selectCurrentUser = createSelector(
  selectState,
  (state) => state.responseLogin?.data?.user ?? null
);

export const selectIsStartTrial = createSelector(
  selectCurrentUser,
  (user) => user && user.is_license_active === false
);
