import {
  createAsyncThunk,
  createSelector,
  createSlice,
} from '@reduxjs/toolkit';
import type { RootState } from '../../store';
import { FAILED, IDLE, LOADING, SUCCEEDED } from '../../utils/constants';
import config from '../config';
import api from '../api';

export interface DeleteSchoolResponse {
  message: string;
  status: string;
  success: boolean;
}

export interface DeleteSchoolState {
  response: DeleteSchoolResponse | null;
  status: 'idle' | 'loading' | 'succeeded' | 'failed';
  error: string | null;
}

const initialState: DeleteSchoolState = {
  response: null,
  status: IDLE,
  error: null,
};

export const DeleteSchoolRequest = createAsyncThunk<
  DeleteSchoolResponse,
  string,
  { rejectValue: { message: string } }
>('deleteSchool', async (id, thunkAPI) => {
  try {
    const url = `${config.SchoolAPI}/${id}`;
    const res = await api.delete(url, {
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
    return thunkAPI.rejectWithValue({
      message: error.response?.data?.message || 'Delete School failed',
    });
  }
});

const DeleteSchoolSlice = createSlice({
  name: 'deleteSchool',
  initialState,
  reducers: {
    resetDeleteSchool(state) {
      state.response = null;
      state.status = IDLE;
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder.addCase(DeleteSchoolRequest.pending, (state) => {
      state.status = LOADING;
      state.error = null;
    });

    builder.addCase(DeleteSchoolRequest.fulfilled, (state, action) => {
      state.status = SUCCEEDED;
      state.response = action.payload;
    });

    builder.addCase(DeleteSchoolRequest.rejected, (state, action) => {
      state.status = FAILED;
      state.error = action.payload?.message || 'Delete School failed';
    });
  },
});

export const { resetDeleteSchool } = DeleteSchoolSlice.actions;
export default DeleteSchoolSlice.reducer;
const selectState = (state: RootState) => state.DeleteSchool;
export const selectDeleteSchoolResponse = createSelector(
  selectState,
  (state) => state.response
);
export const selectDeleteSchoolStatus = createSelector(
  selectState,
  (state) => state.status
);
export const selectDeleteSchoolError = createSelector(
  selectState,
  (state) => state.error
);
