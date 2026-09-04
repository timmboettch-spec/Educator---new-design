import { createAsyncThunk, createSelector, createSlice } from '@reduxjs/toolkit';
import type { RootState } from '../../store';
import { FAILED, IDLE, LOADING, SUCCEEDED } from '../../utils/constants';
import config from '../config';
import api from '../api';

interface UpdateClassPayload {
  id: string;
  data: {
    class_name: string;
    term?: string;
    year?: string;
    status: 'ACTIVE' | 'DRAFT' | 'INACTIVE' | 'ARCHIEVED' | 'ATTENTION';
    start_date: string;
    end_date: string;
    school_id?: string;
  };
}

interface UpdateClassResponse {
  message: string;
  status: string;
}

const initialState = { status: IDLE, error: null as string | null };

export const UpdateClassRequest = createAsyncThunk<
  UpdateClassResponse,
  UpdateClassPayload,
  { rejectValue: string }
>('classes/update', async ({ id, data }, thunkAPI) => {
  try {
  const res = await api.put(`${config.ClassAPI}/${id}`, data);
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
    return thunkAPI.rejectWithValue(error.response?.data?.message || 'Update failed');
  }
});
const PatchClassSlice = createSlice({
  name: 'patchClass',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(UpdateClassRequest.pending, (state) => {
        state.status = LOADING;
      })
      .addCase(UpdateClassRequest.fulfilled, (state) => {
        state.status = SUCCEEDED;
      })
      .addCase(UpdateClassRequest.rejected, (state, action) => {
        state.status = FAILED;
        state.error = action.payload || 'Update failed';
      });
  },
});

export default PatchClassSlice.reducer;

const selectState = (state: RootState) => state.PatchClass;
export const selectPatchStatus = createSelector(selectState, (state) => state.status);
