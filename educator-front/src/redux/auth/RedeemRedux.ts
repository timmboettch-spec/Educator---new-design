import {
  createAsyncThunk,
  createSelector,
  createSlice,
} from '@reduxjs/toolkit';
import type { RootState } from '../../store';
import { FAILED, IDLE, LOADING, SUCCEEDED } from '../../utils/constants';
import config from '../config';
import api from '../api';

export interface RedeemPayload {
  code: string;
}

export interface RedeemResponse {
  /** `user_email` pre-migration. */
  userEmail?: string;
  user_email?: string;
  subscriptions?: unknown[];
}

export interface ResponseRedeem {
  data: RedeemResponse;
  message: string;
  status?: number;
  token?: string;
}

export interface RedeemState {
  responseRedeem: ResponseRedeem | null;
  status: 'idle' | 'loading' | 'succeeded' | 'failed';
  error: string | null;
}

const initialState: RedeemState = {
  responseRedeem: null,
  status: IDLE,
  error: null,
};

export const RedeemRequest = createAsyncThunk<
  ResponseRedeem,
  RedeemPayload,
  { rejectValue: { message: string } }
>('auth/Redeem', async (data, thunkAPI) => {
  try {
    const res = await api.post(config.RedeemAPI, data);
    return res.data;
  } catch (err) {
    const error = err as {
      response?: {
        status: number;
        data?: {
          status: number;
          message?: string;
        };
      };
    };
    return thunkAPI.rejectWithValue({
      message: error.response?.data?.message || 'Redeem failed',
    });
  }
});

const RedeemSlice = createSlice({
  name: 'auth/Redeem',
  initialState,
  reducers: {
    logout(state) {
      state.responseRedeem = null;
      state.status = IDLE;
      state.error = null;
    },
    clearRedeemError(state) {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(RedeemRequest.pending, (state) => {
        state.status = LOADING;
        state.error = null;
      })
      .addCase(RedeemRequest.fulfilled, (state, action) => {
        state.status = SUCCEEDED;
        state.responseRedeem = action.payload;
      })
      .addCase(RedeemRequest.rejected, (state, action) => {
        state.status = FAILED;
        state.error = action.payload?.message || 'Redeem failed';
      });
  },
});

export const { logout, clearRedeemError } = RedeemSlice.actions;
export default RedeemSlice.reducer;
const selectState = (state: RootState) => state.Redeem;
export const selectRedeemResponse = createSelector(
  selectState,
  (state) => state.responseRedeem
);
export const selectRedeemStatus = createSelector(
  selectState,
  (state) => state.status
);
export const selectRedeemError = createSelector(
  selectState,
  (state) => state.error
);
