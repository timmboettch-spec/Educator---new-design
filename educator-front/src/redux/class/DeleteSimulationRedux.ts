import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import axios from 'axios';
import type { RootState } from '../../store';
import config from '../config';
import api from '../api';
import { isAISimulation } from '../../utils/simulationType';
import { classSimulationsApi } from '../api/classSimulations/classSimulationsApi';

interface DeleteSimState {
  status: 'idle' | 'loading' | 'success' | 'failed';
  error: string | null;
}

const initialState: DeleteSimState = {
  status: 'idle',
  error: null,
};

interface DeleteSimResponse {
  status: string;
  message: string;
}

interface DeleteSimPayload {
  simId: string;
  avatarEnabled?: boolean;
  startDate?: string;
  classId?: string;
}

export const DeleteSimulationRequest = createAsyncThunk<
  DeleteSimResponse,
  DeleteSimPayload,
  { rejectValue: string }
>('simulation/delete', async (payload, { dispatch, rejectWithValue }) => {
  try {
    const { simId, avatarEnabled, startDate } = payload;
    const todayStr = new Date().toISOString().slice(0, 10);
    const startDateStr =
      typeof startDate === 'string' ? startDate.slice(0, 10) : '';
    const res = await api.delete(`${config.DeleteclassSimsApi}/${simId}`, {
      headers: {
        'ngrok-skip-browser-warning': 'true',
      },
    });
    const shouldDeductTokens =
      isAISimulation(avatarEnabled) &&
      !!startDateStr &&
      startDateStr <= todayStr;

    if (shouldDeductTokens) {
      try {
        await api.post(
          `${config.DeleteclassSimsApi}/${simId}/deduct-token`,
          {},
          {
            headers: {
              'ngrok-skip-browser-warning': 'true',
            },
            withCredentials: true,
          }
        );
      } catch (tokenErr) {
        void tokenErr;
      }
    }

    // The assignments table caches this class's list; refetch it.
    dispatch(classSimulationsApi.util.invalidateTags(['ClassSimulations']));
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
    if (axios.isAxiosError(err)) {
      return rejectWithValue(error.response?.data?.message || 'Delete failed');
    }
    return rejectWithValue('Delete failed');
  }
});

export type { DeleteSimPayload };

const DeleteSimulationSlice = createSlice({
  name: 'deleteSimulation',
  initialState,
  reducers: {
    resetDeleteSimState: (state) => {
      state.status = 'idle';
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(DeleteSimulationRequest.pending, (state) => {
        state.status = 'loading';
      })
      .addCase(DeleteSimulationRequest.fulfilled, (state) => {
        state.status = 'success';
      })
      .addCase(DeleteSimulationRequest.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.payload || 'Delete failed';
      });
  },
});

export const { resetDeleteSimState } = DeleteSimulationSlice.actions;
export default DeleteSimulationSlice.reducer;
export const selectDeleteSimStatus = (state: RootState) =>
  state.DeleteClassSim.status;
export const selectDeleteSimError = (state: RootState) =>
  state.DeleteClassSim.error;
