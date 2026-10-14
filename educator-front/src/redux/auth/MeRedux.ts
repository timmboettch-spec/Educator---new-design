import {
  createAsyncThunk,
  createSelector,
  createSlice,
} from '@reduxjs/toolkit';

import type { RootState } from '../../store';
import { FAILED, IDLE, LOADING, SUCCEEDED } from '../../utils/constants';
import {
  findRoleById,
  getActiveRole,
  normalizeAuthUser,
} from '../../utils/normalizeAuthUser';
import { getParsedUser, updateStoredUser } from '../../utils/storage';
import api from '../api';
import config from '../config';
import type { ResponseLogin } from './LoginRedux';

/** `/auth/me` replies with the same envelope as `login`. */
export type ResponseMe = ResponseLogin;

export interface MeState {
  user: Record<string, unknown> | null;
  status: 'idle' | 'loading' | 'succeeded' | 'failed';
  error: string | null;
}

const initialState: MeState = {
  user: null,
  status: IDLE,
  error: null,
};

/**
 * Refreshes the signed-in user from `GET /auth/me`, which needs no id and
 * works for every role. The response is flattened with `normalizeAuthUser`,
 * so callers read the same `full_name` / `role` / `ai_seats` shape that login
 * stores, and the stored user is kept in sync.
 */
export const fetchCurrentUser = createAsyncThunk<
  Record<string, unknown>,
  void,
  { rejectValue: { message: string } }
>('auth/Me', async (_, thunkAPI) => {
  try {
    const res = await api.get<ResponseMe>(config.MeAPI);
    const data = res.data?.data;
    // Without an explicit activeRole, `userRoles[0]` would decide the session's
    // role: keep the one already selected instead of guessing.
    const storedRoleId = getParsedUser()?.['active_role_id'];
    const activeRole = getActiveRole(
      data?.user,
      data?.activeRole ??
        (typeof storedRoleId === 'string'
          ? findRoleById(data?.user, storedRoleId)
          : null)
    );
    const user = normalizeAuthUser(data?.user, activeRole ?? undefined);

    if (!user) {
      return thunkAPI.rejectWithValue({ message: 'Failed to load profile' });
    }

    updateStoredUser(user);
    return user;
  } catch (err) {
    const error = err as {
      message?: string;
      response?: { data?: { message?: string } };
    };
    return thunkAPI.rejectWithValue({
      message:
        error.response?.data?.message ||
        error.message ||
        'Failed to load profile',
    });
  }
});

const MeSlice = createSlice({
  name: 'auth/Me',
  initialState,
  reducers: {
    logout(state) {
      state.user = null;
      state.status = IDLE;
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder.addCase(fetchCurrentUser.pending, (state) => {
      state.status = LOADING;
      state.error = null;
    });

    builder.addCase(fetchCurrentUser.fulfilled, (state, action) => {
      state.status = SUCCEEDED;
      state.user = action.payload;
    });

    builder.addCase(fetchCurrentUser.rejected, (state, action) => {
      state.status = FAILED;
      state.error = action.payload?.message || 'Failed to load profile';
    });
  },
});

export const { logout } = MeSlice.actions;

export default MeSlice.reducer;

const selectState = (state: RootState) => state.Me;

export const selectCurrentUser = createSelector(
  selectState,
  (state) => state.user
);

export const selectCurrentUserStatus = createSelector(
  selectState,
  (state) => state.status
);
