import type { PayloadAction } from '@reduxjs/toolkit';
import {
  createAsyncThunk,
  createSelector,
  createSlice,
} from '@reduxjs/toolkit';
import config from '../../config';
import type { RootState } from '../../../store';
import { FAILED, IDLE, LOADING, SUCCEEDED } from '../../../utils/constants';
import api from '@/redux/api';

export interface PostStudentPayload {
  class_id: string;
  student_name?: string;
  email?: string;
  student_id?: string;
}

export interface PostStudentData {
  id: string;
  student_id: string;
  student_name: string;
  email: string | null;
  class_id: string;
  status: string;
}

export interface PostStudentResponse {
  status: string;
  message: string;
  data: PostStudentData;
}

export interface PostStudentState {
  response: PostStudentResponse | null;
  status: 'idle' | 'loading' | 'succeeded' | 'failed';
  error: string | null;
}

const initialState: PostStudentState = {
  response: null,
  status: IDLE,
  error: null,
};

export const PostStudentRequest = createAsyncThunk<
  PostStudentResponse,
  PostStudentPayload,
  { rejectValue: { message: string } }
>('student/post', async (payload, thunkAPI) => {
  try {
    const res = await api.post(config.StudentAPI, payload);
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
      message: error.response?.data?.message || 'Failed to add student',
    });
  }
});

const postStudentSlice = createSlice({
  name: 'student/post',
  initialState,
  reducers: {
    clearPostStudentState(state) {
      state.response = null;
      state.status = IDLE;
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(PostStudentRequest.pending, (state) => {
        state.status = LOADING;
        state.error = null;
      })
      .addCase(
        PostStudentRequest.fulfilled,
        (state, action: PayloadAction<PostStudentResponse>) => {
          state.status = SUCCEEDED;
          state.response = action.payload;
        }
      )
      .addCase(PostStudentRequest.rejected, (state, action) => {
        state.status = FAILED;
        state.error = action.payload?.message || 'Failed to add student';
      });
  },
});

export const { clearPostStudentState } = postStudentSlice.actions;
export default postStudentSlice.reducer;

const selectPostStudentState = (state: RootState) => state.PostStudent;

export const selectPostStudentLoading = createSelector(
  selectPostStudentState,
  (s) => s.status === LOADING
);
export const selectPostStudentSuccess = createSelector(
  selectPostStudentState,
  (s) => s.status === SUCCEEDED
);
export const selectPostStudentError = createSelector(
  selectPostStudentState,
  (s) => s.error
);
export const selectPostStudentResponse = createSelector(
  selectPostStudentState,
  (s) => s.response
);
