import { clearAuthData } from '../../utils/storage';
import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { FAILED, IDLE, LOADING, SUCCEEDED } from '../../utils/constants';
import config from '../config';
import api from '../api';

interface LogoutResponse {
  status: string;
  message: string;
  data: null;
}

export const LogoutRequest = createAsyncThunk<
  LogoutResponse,
  void,
  { rejectValue: { message: string } }
>('auth/logout', async (_, thunkAPI) => {
  try {
    await api.post(config.LogOutAPI, {});
  } catch (err) {
    const error = err as {
      response?: {
        status: number;
        data?: {
          status: string;
          message?: string;
        };
      };
      message?: string;
    };
    return thunkAPI.rejectWithValue({
      message:
        error.response?.data?.message || error.message || 'Logout failed',
    });
  }
  clearAuthData();
  return { status: 'SUCCESS', message: 'Logged out successfully', data: null };
});

const LogoutSlice = createSlice({
  name: 'auth/logout',
  initialState: {
    status: IDLE as 'idle' | 'loading' | 'succeeded' | 'failed',
    error: null as string | null,
    message: null as string | null,
  },
  reducers: {
    resetLogout(state) {
      state.status = IDLE;
      state.error = null;
      state.message = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(LogoutRequest.pending, (state) => {
        state.status = LOADING;
        state.error = null;
        state.message = null;
      })
      .addCase(LogoutRequest.fulfilled, (state, action) => {
        state.status = SUCCEEDED;
        state.message = action.payload?.message ?? null;
      })
      .addCase(LogoutRequest.rejected, (state, action) => {
        state.status = FAILED;
        state.error = action.payload?.message || 'Logout failed';
      });
  },
});

export const { resetLogout } = LogoutSlice.actions;
export default LogoutSlice.reducer;
