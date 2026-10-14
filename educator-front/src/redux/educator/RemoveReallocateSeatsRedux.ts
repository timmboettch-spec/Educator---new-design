import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import type { RootState } from '../../store';
import { FAILED, IDLE, LOADING, SUCCEEDED } from '../../utils/constants';
import config from '../config';
import api from '../api';

export interface RemoveSeatsInput {
  educatorId: string;
  amount: number;
}

export interface RemoveSeatsResponseData {
  remainingTokens: number;
}

export interface ReallocateSeatsInput {
  sourceEducatorId: string;
  targetEducatorId: string;
  amount: number;
}

export interface ReallocateSeatsResponseData {
  sourceRemainingTokens: number;
  targetRemainingTokens: number;
}

interface ApiResponse<T> {
  message: string;
  status: string;
  data?: T | null;
}

export interface RemoveReallocateSeatsState {
  removeStatus: 'idle' | 'loading' | 'succeeded' | 'failed';
  removeError: string | null;
  reallocateStatus: 'idle' | 'loading' | 'succeeded' | 'failed';
  reallocateError: string | null;
}

const initialState: RemoveReallocateSeatsState = {
  removeStatus: IDLE,
  removeError: null,
  reallocateStatus: IDLE,
  reallocateError: null,
};

export const RemoveSeats = createAsyncThunk<
  ApiResponse<RemoveSeatsResponseData>,
  RemoveSeatsInput,
  { rejectValue: { message: string } }
>('educator/removeSeats', async ({ educatorId, amount }, thunkAPI) => {
  try {
    const res = await api.post<ApiResponse<RemoveSeatsResponseData>>(
      `${config.RemoveSeatsAPI}/${educatorId}/remove-seats`,
      { amount }
    );
    return res.data;
  } catch (err: unknown) {
    const error = err as { response?: { data?: { message?: string } } };
    return thunkAPI.rejectWithValue({
      message: error.response?.data?.message || 'Failed to remove seats',
    });
  }
});

export const ReallocateSeats = createAsyncThunk<
  ApiResponse<ReallocateSeatsResponseData>,
  ReallocateSeatsInput,
  { rejectValue: { message: string } }
>(
  'educator/reallocateSeats',
  async ({ sourceEducatorId, targetEducatorId, amount }, thunkAPI) => {
    try {
      const res = await api.post<ApiResponse<ReallocateSeatsResponseData>>(
        `${config.ReallocateSeatsAPI}/${sourceEducatorId}/reallocate-seats`,
        { target_educator_id: targetEducatorId, amount }
      );
      return res.data;
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      return thunkAPI.rejectWithValue({
        message: error.response?.data?.message || 'Failed to reallocate seats',
      });
    }
  }
);

const RemoveReallocateSeatsSlice = createSlice({
  name: 'educator/removeReallocateSeats',
  initialState,
  reducers: {
    clearRemoveSeatsState(state) {
      state.removeStatus = IDLE;
      state.removeError = null;
    },
    clearReallocateSeatsState(state) {
      state.reallocateStatus = IDLE;
      state.reallocateError = null;
    },
    clearAllRemoveReallocateState(state) {
      state.removeStatus = IDLE;
      state.removeError = null;
      state.reallocateStatus = IDLE;
      state.reallocateError = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(RemoveSeats.pending, (state) => {
        state.removeStatus = LOADING;
        state.removeError = null;
      })
      .addCase(RemoveSeats.fulfilled, (state) => {
        state.removeStatus = SUCCEEDED;
        state.removeError = null;
      })
      .addCase(RemoveSeats.rejected, (state, action) => {
        state.removeStatus = FAILED;
        state.removeError = action.payload?.message ?? 'Failed to remove seats';
      })
      .addCase(ReallocateSeats.pending, (state) => {
        state.reallocateStatus = LOADING;
        state.reallocateError = null;
      })
      .addCase(ReallocateSeats.fulfilled, (state) => {
        state.reallocateStatus = SUCCEEDED;
        state.reallocateError = null;
      })
      .addCase(ReallocateSeats.rejected, (state, action) => {
        state.reallocateStatus = FAILED;
        state.reallocateError =
          action.payload?.message ?? 'Failed to reallocate seats';
      });
  },
});

export const {
  clearRemoveSeatsState,
  clearReallocateSeatsState,
  clearAllRemoveReallocateState,
} = RemoveReallocateSeatsSlice.actions;

export const selectRemoveSeatsStatus = (state: RootState) =>
  state.RemoveReallocateSeats.removeStatus;
export const selectRemoveSeatsError = (state: RootState) =>
  state.RemoveReallocateSeats.removeError;
export const selectReallocateSeatsStatus = (state: RootState) =>
  state.RemoveReallocateSeats.reallocateStatus;
export const selectReallocateSeatsError = (state: RootState) =>
  state.RemoveReallocateSeats.reallocateError;

export default RemoveReallocateSeatsSlice.reducer;
