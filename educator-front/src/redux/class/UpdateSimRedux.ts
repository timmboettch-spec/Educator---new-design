import type { PayloadAction } from '@reduxjs/toolkit';
import { createAsyncThunk, createSelector, createSlice } from '@reduxjs/toolkit';
import type { RootState } from '../../store';
import { FAILED, IDLE, LOADING, SUCCEEDED } from '../../utils/constants';
import config from '../config';
import api from '../api';

export interface UpdateSimPayload {
  simId?: string;
  simulation_name?: string;
  unit?: string;
  category?: string;
  start_date?: string;
  due_date?: string;
  end_date?: string;
  class_id?: string;
}

export interface UpdateSimResponse {
  status: string;
  message: string;
  data?: unknown;
}

export interface UpdateSimState {
  response: UpdateSimResponse | null;
  status: 'idle' | 'loading' | 'succeeded' | 'failed';
  error: string | null;
}

const initialState: UpdateSimState = {
  response: null,
  status: IDLE,
  error: null,
};

export const updateSimulationRequest = createAsyncThunk<
  UpdateSimResponse,
  UpdateSimPayload,
  { rejectValue: { message: string } }
>('simulation/update', async (payload, thunkAPI) => {
  try {
    const { simId, ...body } = payload;
    const res = await api.put(`${config.PutclassSimsApi}/${simId}`, body);
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
      message: error.response?.data?.message || 'Failed to update simulation',
    });
  }
});

const updateSimSlice = createSlice({
  name: 'simulation/update',
  initialState,
  reducers: {
    clearUpdateSimulationState(state) {
      state.response = null;
      state.status = IDLE;
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(updateSimulationRequest.pending, (state) => {
        state.status = LOADING;
        state.error = null;
      })
      .addCase(updateSimulationRequest.fulfilled, (state, action: PayloadAction<UpdateSimResponse>) => {
        state.status = SUCCEEDED;
        state.response = action.payload;
      })
      .addCase(updateSimulationRequest.rejected, (state, action) => {
        state.status = FAILED;
        state.error = action.payload?.message || 'Failed to update simulation';
      });
  },
});

export const { clearUpdateSimulationState } = updateSimSlice.actions;
export default updateSimSlice.reducer;

const selectUpdateSimState = (state: RootState) => state.PutclassSim;

export const selectUpdateSimLoading = createSelector(
  selectUpdateSimState,
  (s) => s.status === LOADING,
);
export const selectUpdateSimSuccess = createSelector(
  selectUpdateSimState,
  (s) => s.status === SUCCEEDED,
);
export const selectUpdateSimError = createSelector(selectUpdateSimState, (s) => s.error);
export const selectUpdateSimResponse = createSelector(selectUpdateSimState, (s) => s.response);
