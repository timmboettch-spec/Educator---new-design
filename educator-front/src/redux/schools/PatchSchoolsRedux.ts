import { createAsyncThunk, createSelector, createSlice } from '@reduxjs/toolkit';
import type { RootState } from '../../store';
import { FAILED, IDLE, LOADING, SUCCEEDED } from '../../utils/constants';
import config from '../config';
import api from '../api';

export interface PatchSchoolPayload {
  id: string;
  school_name: string;
  status: string;
}

export interface PatchSchoolResponse {
  data: {
    id: string;
    school_name: string;
    status: string;
  };
  message: string;
  status: string;
}

export interface PatchSchoolState {
  response: PatchSchoolResponse | null;
  status: 'idle' | 'loading' | 'succeeded' | 'failed';
  error: string | null;
}

const initialState: PatchSchoolState = {
  response: null,
  status: IDLE,
  error: null,
};

export const PatchSchoolRequest = createAsyncThunk<
  PatchSchoolResponse,
  PatchSchoolPayload,
  { rejectValue: { message: string } }
>('patchSchool', async ({ id, ...data }, thunkAPI) => {
  try {
    const url = `${config.SchoolAPI}/${id}`;
    const res = await api.put(url, data, {
      headers: {
        'ngrok-skip-browser-warning': 'true',
      }
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
      message: error.response?.data?.message || 'Patch School failed',
    });
  }
});

const PatchSchoolSlice = createSlice({
  name: 'patchSchool',
  initialState,
  reducers: {
    resetPatchSchool(state) {
      state.response = null;
      state.status = IDLE;
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder.addCase(PatchSchoolRequest.pending, (state) => {
      state.status = LOADING;
      state.error = null;
    });
    builder.addCase(PatchSchoolRequest.fulfilled, (state, action) => {
      state.status = SUCCEEDED;
      state.response = action.payload;
    });
    builder.addCase(PatchSchoolRequest.rejected, (state, action) => {
      state.status = FAILED;
      state.error = action.payload?.message || 'Patch School failed';
    });
  },
});

export const { resetPatchSchool } = PatchSchoolSlice.actions;
export default PatchSchoolSlice.reducer;
const selectState = (state: RootState) => state.PatchSchool;
export const selectPatchSchoolResponse = createSelector(selectState, (state) => state.response);
export const selectPatchSchoolStatus = createSelector(selectState, (state) => state.status);
export const selectPatchSchoolError = createSelector(selectState, (state) => state.error);
