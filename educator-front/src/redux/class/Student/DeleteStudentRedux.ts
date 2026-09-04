import type { PayloadAction } from '@reduxjs/toolkit';
import { createAsyncThunk, createSelector, createSlice } from '@reduxjs/toolkit';
import axios from 'axios';
import config from '../../config';
import type { RootState } from '../../../store';
import { FAILED, IDLE, LOADING, SUCCEEDED } from '../../../utils/constants';
import api from '@/redux/api';

export interface DeleteStudentResponse {
  status: string;
  message: string;
}

export interface DeleteStudentState {
  response: DeleteStudentResponse | null;
  status: 'idle' | 'loading' | 'succeeded' | 'failed';
  error: string | null;
}

const initialState: DeleteStudentState = {
  response: null,
  status: IDLE,
  error: null,
};

export const DeleteStudentRequest = createAsyncThunk(
  'student/delete',
  async (studentId: string, thunkAPI) => {
    try {
      const res = await api.delete(`${config.StudentAPI}/${studentId}`, {});
      return res.data;
    } catch (err) {
      const error = err as { response?: { data?: { message?: string } } };
      if (axios.isAxiosError(error)) {
        return thunkAPI.rejectWithValue({
          message: error.response?.data?.message || 'Failed to delete student',
        });
      }
    }
  },
);

const deleteStudentSlice = createSlice({
  name: 'student/delete',
  initialState,
  reducers: {
    clearDeleteStudentState(state) {
      state.response = null;
      state.status = IDLE;
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(DeleteStudentRequest.pending, (state) => {
        state.status = LOADING;
        state.error = null;
      })
      .addCase(
        DeleteStudentRequest.fulfilled,
        (state, action: PayloadAction<DeleteStudentResponse>) => {
          state.status = SUCCEEDED;
          state.response = action.payload;
        },
      )
      .addCase(DeleteStudentRequest.rejected, (state, action) => {
        state.status = FAILED;
        state.error =
          (action.payload as { message?: string })?.message || 'Failed to delete student';
      });
  },
});

export const { clearDeleteStudentState } = deleteStudentSlice.actions;
export default deleteStudentSlice.reducer;

const selectDeleteStudentState = (state: RootState) => state.DeleteStudent;

export const selectDeleteStudentLoading = createSelector(
  selectDeleteStudentState,
  (s) => s.status === LOADING,
);
export const selectDeleteStudentSuccess = createSelector(
  selectDeleteStudentState,
  (s) => s.status === SUCCEEDED,
);
export const selectDeleteStudentError = createSelector(selectDeleteStudentState, (s) => s.error);
