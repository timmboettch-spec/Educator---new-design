import { createAsyncThunk, createSelector, createSlice } from '@reduxjs/toolkit';
import type { RootState } from '../../store';
import { FAILED, IDLE, LOADING, SUCCEEDED } from '../../utils/constants';
import config from '../config';
import api from '../api';

export interface DualRoleSignUpPayload {
  email: string;
  full_name: string;
  invite_id?: string;
}

export interface DualRoleSignUpResponse {
  tokens: {
    accessToken: string;
  };
  user: {
    id: string;
    email: string;
    full_name: string;
    isLicenseActive: boolean;
  };
  has_dual_role: string;
  educator_tokens: { accessToken: string; },
  educator_user: Record<string, unknown>,
}

export interface ResponseDualRoleSignUp {
  data: DualRoleSignUpResponse;
  message: string;
  status: string;
}

export interface DualRoleSignUpState {
  responseDualRoleSignUp: ResponseDualRoleSignUp | null;
  status: 'idle' | 'loading' | 'succeeded' | 'failed';
  error: string | null;
}

const initialState: DualRoleSignUpState = {
  responseDualRoleSignUp: null,
  status: IDLE,
  error: null,
};

export const DualRoleSignUpRequest = createAsyncThunk<
  ResponseDualRoleSignUp,
  DualRoleSignUpPayload,
  { rejectValue: { message: string } }
>('auth/DualRoleSignUp', async (data, thunkAPI) => {
  try {
    const res = await api.post(config.DualRoleSignUpAPI, data, {
      withCredentials: true,
    });
    return res.data;
  } catch (err) {
    const error = err as { response?: { data?: { message?: string } } };
    return thunkAPI.rejectWithValue({
      message: error.response?.data?.message || 'DualRoleSignUp failed',
    });
  }
});

const DualRoleSignUpSlice = createSlice({
  name: 'auth/DualRoleSignUp',
  initialState,
  reducers: {
    logout(state) {
      state.responseDualRoleSignUp = null;
      state.status = IDLE;
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder.addCase(DualRoleSignUpRequest.pending, (state) => {
      state.status = LOADING;
      state.error = null;
    });

    builder.addCase(DualRoleSignUpRequest.fulfilled, (state, action) => {
      state.status = SUCCEEDED;
      state.responseDualRoleSignUp = action.payload;
    });

    builder.addCase(DualRoleSignUpRequest.rejected, (state, action) => {
      state.status = FAILED;
      state.error = action.payload?.message || 'DualRoleSignUp failed';
    });
  },
});

export const { logout } = DualRoleSignUpSlice.actions;

export default DualRoleSignUpSlice.reducer;

const selectState = (state: RootState) => state.DualRoleSignUp;

export const selectDualRoleSignUpResponse = createSelector(selectState, (state) => state.responseDualRoleSignUp);

export const selectDualRoleSignUpStatus = createSelector(selectState, (state) => state.status);

export const selectDualRoleSignUpError = createSelector(selectState, (state) => state.error);
