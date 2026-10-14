import {
  createAsyncThunk,
  createSelector,
  createSlice,
} from '@reduxjs/toolkit';
import type { RootState } from '../../store';
import { FAILED, IDLE, LOADING, SUCCEEDED } from '../../utils/constants';
import config from '../config';
import api from '../api';

export interface DeleteEducatorResponse {
  id: string;
  message: string;
  status: string;
}

export interface DeleteEducatorState {
  responseDeleteEducator: DeleteEducatorResponse | null;
  status: 'idle' | 'loading' | 'succeeded' | 'failed';
  error: string | null;
}

const initialState: DeleteEducatorState = {
  responseDeleteEducator: null,
  status: IDLE,
  error: null,
};

export const DeleteEducatorRequest = createAsyncThunk<
  DeleteEducatorResponse,
  string,
  { rejectValue: { message: string } }
>('educator/delete', async (id, thunkAPI) => {
  try {
    const res = await api.delete(`${config.DeleteEducatorAPI}/${id}`);
    return { id, ...res.data };
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
      message: error.response?.data?.message || 'Failed to delete educator',
    });
  }
});

const DeleteEducatorSlice = createSlice({
  name: 'educator/delete',
  initialState,
  reducers: {
    clearDeleteEducatorState(state) {
      state.responseDeleteEducator = null;
      state.status = IDLE;
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(DeleteEducatorRequest.pending, (state) => {
        state.status = LOADING;
        state.error = null;
      })
      .addCase(DeleteEducatorRequest.fulfilled, (state, action) => {
        state.status = SUCCEEDED;
        state.responseDeleteEducator = action.payload;
      })
      .addCase(DeleteEducatorRequest.rejected, (state, action) => {
        state.status = FAILED;
        state.error = action.payload?.message || 'Failed to delete educator';
      });
  },
});

export const { clearDeleteEducatorState } = DeleteEducatorSlice.actions;

export default DeleteEducatorSlice.reducer;

const selectState = (state: RootState) => state.DeleteEducator;

export const selectDeleteEducatorResponse = createSelector(
  selectState,
  (state) => state.responseDeleteEducator
);

export const selectDeleteEducatorStatus = createSelector(
  selectState,
  (state) => state.status
);
export const selectDeleteEducatorError = createSelector(
  selectState,
  (state) => state.error
);
