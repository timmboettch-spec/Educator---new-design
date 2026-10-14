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

export interface UpdateStudentCodeResponse {
  status: string;
  message: string;
  data: {
    id: string;
    student_id: string | null;
    new_code?: string;
  };
}

export interface UpdateStudentCodeState {
  response: UpdateStudentCodeResponse | null;
  status: 'idle' | 'loading' | 'succeeded' | 'failed';
  error: string | null;
}

const initialState: UpdateStudentCodeState = {
  response: null,
  status: IDLE,
  error: null,
};

export const UpdateStudentCodeRequest = createAsyncThunk(
  'student/updateCode',
  async (id: string, thunkAPI) => {
    try {
      const res = await api.put(`${config.RegenerateCodeApi}/${id}`, {
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
        message:
          error.response?.data?.message || 'Failed to update student code',
      });
    }
  }
);

const updateStudentCodeSlice = createSlice({
  name: 'student/updateCode',
  initialState,
  reducers: {
    clearUpdateStudentCodeState(state) {
      state.response = null;
      state.status = IDLE;
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(UpdateStudentCodeRequest.pending, (state) => {
        state.status = LOADING;
        state.error = null;
      })
      .addCase(
        UpdateStudentCodeRequest.fulfilled,
        (state, action: PayloadAction<UpdateStudentCodeResponse>) => {
          state.status = SUCCEEDED;
          state.response = action.payload;
        }
      )
      .addCase(UpdateStudentCodeRequest.rejected, (state, action) => {
        state.status = FAILED;
        state.error =
          (action.payload as { message?: string })?.message ||
          'Failed to update student code';
      });
  },
});

export const { clearUpdateStudentCodeState } = updateStudentCodeSlice.actions;
export default updateStudentCodeSlice.reducer;

const selectUpdateStudentCodeState = (state: RootState) =>
  state.UpdateStudentCode;

export const selectUpdateCodeLoading = createSelector(
  selectUpdateStudentCodeState,
  (s) => s.status === LOADING
);

export const selectUpdateCodeSuccess = createSelector(
  selectUpdateStudentCodeState,
  (s) => s.status === SUCCEEDED
);

export const selectUpdateCodeError = createSelector(
  selectUpdateStudentCodeState,
  (s) => s.error
);

export const selectUpdateCodeResponse = createSelector(
  selectUpdateStudentCodeState,
  (s) => s.response
);
