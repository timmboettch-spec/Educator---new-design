import {
  createAsyncThunk,
  createSelector,
  createSlice,
} from '@reduxjs/toolkit';
import axios from 'axios';

import type { RootState } from '../../store';
import { FAILED, IDLE, LOADING, SUCCEEDED } from '../../utils/constants';
import config from '../config';

export interface AcceptInvitePayload {
  /** The invite token from the `/signup/:invite_id` link. */
  token: string;
  password: string;
}

/**
 * accept-invite only activates the account: no tokens, no session. The user
 * signs in afterwards with the password they just set.
 */
export interface ResponseAcceptInvite {
  message: string;
  data?: unknown;
}

export interface AcceptInviteState {
  responseAcceptInvite: ResponseAcceptInvite | null;
  status: 'idle' | 'loading' | 'succeeded' | 'failed';
  error: string | null;
}

const initialState: AcceptInviteState = {
  responseAcceptInvite: null,
  status: IDLE,
  error: null,
};

export const AcceptInviteRequest = createAsyncThunk<
  ResponseAcceptInvite,
  AcceptInvitePayload,
  { rejectValue: { message: string } }
>('auth/AcceptInvite', async (data, thunkAPI) => {
  try {
    // Plain axios, like verify-token: the invite token is the only credential,
    // so a signed-in admin's bearer token must not ride along.
    const res = await axios.post(config.AcceptInviteAPI, data, {
      headers: {
        'ngrok-skip-browser-warning': 'true',
      },
      withCredentials: true,
    });
    return res.data;
  } catch (err) {
    const error = err as { response?: { data?: { message?: string } } };
    return thunkAPI.rejectWithValue({
      message: error.response?.data?.message || 'AcceptInvite failed',
    });
  }
});

const AcceptInviteSlice = createSlice({
  name: 'auth/AcceptInvite',
  initialState,
  reducers: {
    logout(state) {
      state.responseAcceptInvite = null;
      state.status = IDLE;
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder.addCase(AcceptInviteRequest.pending, (state) => {
      state.status = LOADING;
      state.error = null;
    });

    builder.addCase(AcceptInviteRequest.fulfilled, (state, action) => {
      state.status = SUCCEEDED;
      state.responseAcceptInvite = action.payload;
    });

    builder.addCase(AcceptInviteRequest.rejected, (state, action) => {
      state.status = FAILED;
      state.error = action.payload?.message || 'AcceptInvite failed';
    });
  },
});

export const { logout } = AcceptInviteSlice.actions;

export default AcceptInviteSlice.reducer;

const selectState = (state: RootState) => state.AcceptInvite;

export const selectAcceptInviteStatus = createSelector(
  selectState,
  (state) => state.status
);

export const selectAcceptInviteError = createSelector(
  selectState,
  (state) => state.error
);
