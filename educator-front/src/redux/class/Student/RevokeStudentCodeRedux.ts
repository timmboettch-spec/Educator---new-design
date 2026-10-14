import type { PayloadAction } from '@reduxjs/toolkit';
import {
  createAsyncThunk,
  createSelector,
  createSlice,
} from '@reduxjs/toolkit';
import type { RootState } from '../../../store';
import { FAILED, IDLE, LOADING, SUCCEEDED } from '../../../utils/constants';
import config from '../../config';
import api from '@/redux/api';

export interface RevokeStudentCodeResponse {
  status: string;
  message: string;
  data: { id: string };
}

export interface RevokeStudentCodeState {
  response: RevokeStudentCodeResponse | null;
  status: 'idle' | 'loading' | 'succeeded' | 'failed';
  error: string | null;
}

const initialState: RevokeStudentCodeState = {
  response: null,
  status: IDLE,
  error: null,
};

export const RevokeStudentCodeRequest = createAsyncThunk(
  'student/revokeCode',
  async (id: string, thunkAPI) => {
    try {
      const res = await api.put(`${config.StudentAPI}/revoke-code/${id}`, {
        headers: {
          'ngrok-skip-browser-warning': 'true',
        },
      });
      return res.data;
    } catch (err: unknown) {
      const error = err as {
        response?: { status: number; data?: { message?: string } };
      };
      return thunkAPI.rejectWithValue({
        message:
          error.response?.data?.message || 'Failed to revoke Student code',
      });
    }
  }
);

const revokeStudentCodeSlice = createSlice({
  name: 'student/revokeCode',
  initialState,
  reducers: {
    clearRevokeStudentCodeState(state) {
      state.response = null;
      state.status = IDLE;
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(RevokeStudentCodeRequest.pending, (state) => {
        state.status = LOADING;
        state.error = null;
      })
      .addCase(
        RevokeStudentCodeRequest.fulfilled,
        (state, action: PayloadAction<RevokeStudentCodeResponse>) => {
          state.status = SUCCEEDED;
          state.response = action.payload;
        }
      )
      .addCase(RevokeStudentCodeRequest.rejected, (state, action) => {
        state.status = FAILED;
        state.error =
          (action.payload as { message?: string })?.message ||
          'Failed to revoke Student code';
      });
  },
});

export const { clearRevokeStudentCodeState } = revokeStudentCodeSlice.actions;
export default revokeStudentCodeSlice.reducer;

const selectRevokeStudentCodeState = (state: RootState) =>
  state.RevokeStudentCode;

export const selectRevokeCodeLoading = createSelector(
  selectRevokeStudentCodeState,
  (s) => s.status === LOADING
);
export const selectRevokeCodeSuccess = createSelector(
  selectRevokeStudentCodeState,
  (s) => s.status === SUCCEEDED
);
export const selectRevokeCodeError = createSelector(
  selectRevokeStudentCodeState,
  (s) => s.error
);
