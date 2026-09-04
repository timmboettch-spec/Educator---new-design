import { createAsyncThunk, createSelector, createSlice } from '@reduxjs/toolkit';
import axios from 'axios';

import type { RootState } from '../../store';
import { FAILED, IDLE, LOADING, SUCCEEDED } from '../../utils/constants';
import config from '../config';

export interface VerifyInvitePayload {
  invite_id: string;
}

export interface VerifyInviteResponse {
  email: string;
  full_name: string;
}

export interface ResponseVerifyInvite {
  data: VerifyInviteResponse;
  message: string;
  status: string;
}

export interface VerifyInviteState {
  responseVerifyInvite: ResponseVerifyInvite | null;
  status: 'idle' | 'loading' | 'succeeded' | 'failed';
  error: string | null;
}

const initialState: VerifyInviteState = {
  responseVerifyInvite: null,
  status: IDLE,
  error: null,
};

export const VerifyInviteRequest = createAsyncThunk<
  ResponseVerifyInvite,
  VerifyInvitePayload,
  { rejectValue: { message: string } }
>('auth/VerifyInvite', async (data, thunkAPI) => {
  try {
    const url = `${config.VerifyInviteAPI}/${data.invite_id}`;
    const res = await axios.get(url, {
      headers: {
        'ngrok-skip-browser-warning': 'true',
      },
      withCredentials: true,
    });
    return res.data;
  } catch (err) {
    const error = err as { response?: { data?: { message?: string } } };
    return thunkAPI.rejectWithValue({
      message: error.response?.data?.message || 'VerifyInvite failed',
    });
  }
});

const VerifyInviteSlice = createSlice({
  name: 'auth/VerifyInvite',
  initialState,
  reducers: {
    logout(state) {
      state.responseVerifyInvite = null;
      state.status = IDLE;
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder.addCase(VerifyInviteRequest.pending, (state) => {
      state.status = LOADING;
      state.error = null;
    });

    builder.addCase(VerifyInviteRequest.fulfilled, (state, action) => {
      state.status = SUCCEEDED;
      state.responseVerifyInvite = action.payload;
    });

    builder.addCase(VerifyInviteRequest.rejected, (state, action) => {
      state.status = FAILED;
      state.error = action.payload?.message || 'VerifyInvite failed';
    });
  },
});

export const { logout } = VerifyInviteSlice.actions;

export default VerifyInviteSlice.reducer;

const selectState = (state: RootState) => state.VerifyInvite;

export const selectVerifyInviteResponse = createSelector(
  selectState,
  (state) => state.responseVerifyInvite,
);

export const selectVerifyInviteStatus = createSelector(selectState, (state) => state.status);

export const selectVerifyInviteError = createSelector(selectState, (state) => state.error);
