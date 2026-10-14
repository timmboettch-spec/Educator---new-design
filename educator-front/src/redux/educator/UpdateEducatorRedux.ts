import {
  createAsyncThunk,
  createSelector,
  createSlice,
} from '@reduxjs/toolkit';
import type { RootState } from '../../store';
import { FAILED, IDLE, LOADING, SUCCEEDED } from '../../utils/constants';
import config from '../config';
import api from '../api';

export interface EducatorPayload {
  full_name: string;
  email: string;
  school_id: string;
  class_id?: string;
  status?: string;
  parent_id?: string;
  tokens?: number;
}

export interface ResponseEducator {
  data: unknown;
  message: string;
  status: string;
}

export interface UpdateEducatorState {
  responseUpdateEducator: ResponseEducator | null;
  status: 'idle' | 'loading' | 'succeeded' | 'failed';
  error: string | null;
}

const initialState: UpdateEducatorState = {
  responseUpdateEducator: null,
  status: IDLE,
  error: null,
};

export const UpdateEducatorRequest = createAsyncThunk<
  ResponseEducator,
  { id: string; data: EducatorPayload },
  { rejectValue: { message: string } }
>('educator/update', async ({ id, data }, thunkAPI) => {
  try {
    const res = await api.put(`${config.UpdateEducatorAPI}/${id}`, {
      full_name: data.full_name,
      school_id: data.school_id,
      status: data.status,
      tokens: data.tokens,
    });

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
      message: error.response?.data?.message || 'Failed to update educator',
    });
  }
});

const UpdateEducatorSlice = createSlice({
  name: 'educator/update',
  initialState,
  reducers: {
    clearUpdateEducatorState(state) {
      state.responseUpdateEducator = null;
      state.status = IDLE;
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(UpdateEducatorRequest.pending, (state) => {
        state.status = LOADING;
        state.error = null;
      })
      .addCase(UpdateEducatorRequest.fulfilled, (state, action) => {
        state.status = SUCCEEDED;
        state.responseUpdateEducator = action.payload;
      })
      .addCase(UpdateEducatorRequest.rejected, (state, action) => {
        state.status = FAILED;
        state.error = action.payload?.message || 'Failed to update educator';
      });
  },
});

export const { clearUpdateEducatorState } = UpdateEducatorSlice.actions;

export default UpdateEducatorSlice.reducer;

const selectState = (state: RootState) => state.updateEducator;

export const selectUpdateEducatorStatus = createSelector(
  selectState,
  (state) => state.status
);
export const selectUpdateEducatorError = createSelector(
  selectState,
  (state) => state.error
);
