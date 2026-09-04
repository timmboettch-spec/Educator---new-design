import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import axios from 'axios';
import type { RootState } from '../../store';
import config from '../config';
import api from '../api';

interface DeleteState {
  status: 'idle' | 'loading' | 'success' | 'failed';
  error: string | null;
}

const initialState: DeleteState = {
  status: 'idle',
  error: null,
};

interface DeleteResponse {
  status: string;
  message: string;
}

export const DeleteClassRequest = createAsyncThunk<DeleteResponse, string, { rejectValue: string }>(
  'class/delete',
  async (id, { rejectWithValue }) => {
    try {
    const res = await api.delete(`${config.ClassAPI}/${id}`,{
      headers: {
        'ngrok-skip-browser-warning': 'true',
      },
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
      if (axios.isAxiosError(err)) {
        return rejectWithValue(error.response?.data?.message || 'Delete failed');
      }
      return rejectWithValue('Delete failed');
    }
  },
);

const DeleteClassSlice = createSlice({
  name: 'deleteClass',
  initialState,
  reducers: {
    resetDeleteState: (state) => {
      state.status = 'idle';
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(DeleteClassRequest.pending, (state) => {
        state.status = 'loading';
      })
      .addCase(DeleteClassRequest.fulfilled, (state) => {
        state.status = 'success';
      })
      .addCase(DeleteClassRequest.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.payload || 'Delete failed';
      });
  },
});

export const { resetDeleteState } = DeleteClassSlice.actions;
export default DeleteClassSlice.reducer;

export const selectDeleteStatus = (state: RootState) => state.DeleteClass.status;

export const selectDeleteError = (state: RootState) => state.DeleteClass.error;
