import { createAsyncThunk, createSelector, createSlice } from '@reduxjs/toolkit';
import type { RootState } from '../../store';
import { FAILED, IDLE, LOADING, SUCCEEDED } from '../../utils/constants';
import config from '../config';
import api from '../api';

export interface EducatorPayload {
  full_name: string;
  email: string;
  school_id: string;
  status?: string;
  tokens: number;
}

export interface ResponseEducator {
  data: {
    invite_id: string;
    [key: string]: unknown;
  };
  message: string;
  status: string;
}

export interface CreateEducatorState {
  responseCreateEducator: ResponseEducator | null;
  status: 'idle' | 'loading' | 'succeeded' | 'failed';
  error: string | null;
}

const initialState: CreateEducatorState = {
  responseCreateEducator: null,
  status: IDLE,
  error: null,
};

export const InviteEducatorRequest = createAsyncThunk<
  ResponseEducator,
  EducatorPayload,
  { rejectValue: { message: string } }
>('educator/invite', async (data, thunkAPI) => {
  try {
   const res = await api.post(config.InviteEducatorAPI, data);
    return res.data;
  } catch (err: unknown) {
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
      message: error.response?.data?.message || 'Failed to create invite',
    });
  }
});

const CreateEducatorSlice = createSlice({
  name: 'educator/create',
  initialState,
  reducers: {
    clearCreateEducatorState(state) {
      state.responseCreateEducator = null;
      state.status = IDLE;
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(InviteEducatorRequest.pending, (state) => {
        state.status = LOADING;
        state.error = null;
      })
      .addCase(InviteEducatorRequest.fulfilled, (state, action) => {
        state.status = SUCCEEDED;
        state.responseCreateEducator = action.payload;
      })
      .addCase(InviteEducatorRequest.rejected, (state, action) => {
        state.status = FAILED;
        state.error = action.payload?.message || 'Failed to create invite';
      });
  },
});

export const { clearCreateEducatorState } = CreateEducatorSlice.actions;

export default CreateEducatorSlice.reducer;

const selectState = (state: RootState) => state.CreateEducator;

export const selectCreateEducatorResponse = createSelector(
  selectState,
  (state) => state.responseCreateEducator,
);

export const selectCreateEducatorStatus = createSelector(selectState, (state) => state.status);
export const selectCreateEducatorError = createSelector(selectState, (state) => state.error);
