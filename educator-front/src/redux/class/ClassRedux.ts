import type { PayloadAction } from '@reduxjs/toolkit';
import { createAsyncThunk, createSelector, createSlice } from '@reduxjs/toolkit';
import config from '../../redux/config';
import type { RootState } from '../../store';
import { FAILED, IDLE, LOADING, SUCCEEDED } from '../../utils/constants';
import api from '../api';

export interface PostClassPayload {
  class_name: string;
  term?: string;
  year?: string;
  start_date?: string;
  end_date?: string;
  status?: string;
  total_no_of_students?: number;
  user_id?: string;
  students?: Record<string, string>[];
}

export interface PostClassData {
  id: string;
  class_name: string;
  term: string;
  year: string;
  status: string;
  user_id: string;
}

export interface PostClassResponse {
  status: string;
  message: string;
  data: PostClassData;
}
interface PostClassRequestBody {
  class_name: string;
  term?: string;
  year?: string;
  status?: string;
  start_date?: string;
  end_date?: string;
  students?: Record<string, string>[];
  total_no_of_students?: number;
}
export interface PostClassState {
  response: PostClassResponse | null;
  status: 'idle' | 'loading' | 'succeeded' | 'failed';
  error: string | null;
}

const initialState: PostClassState = {
  response: null,
  status: IDLE,
  error: null,
};

export const PostClassRequest = createAsyncThunk<
  PostClassResponse,
  PostClassPayload,
  { rejectValue: { message: string } }
>('class/post', async (payload, thunkAPI) => {
  try {
    const body: PostClassRequestBody = {
      class_name: payload.class_name,
      term: payload.term,
      year: payload.year,
      status: payload.status,
      start_date: payload.start_date,
      end_date: payload.end_date,
    };

    if (payload.students && payload.students.length > 0) {
      body.students = payload.students;
    } else if (payload.total_no_of_students) {
      body.total_no_of_students = payload.total_no_of_students;
    }

    const res = await api.post(config.ClassUserAPI, body);
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
    const errorMessage =  error.response?.data?.message || 'Failed to create class';
    return thunkAPI.rejectWithValue({
      message: errorMessage,
    });
  }
});

const postClassSlice = createSlice({
  name: 'class/post',
  initialState,
  reducers: {
    clearPostClassState(state) {
      state.response = null;
      state.status = IDLE;
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(PostClassRequest.pending, (state) => {
        state.status = LOADING;
        state.error = null;
      })
      .addCase(PostClassRequest.fulfilled, (state, action: PayloadAction<PostClassResponse>) => {
        state.status = SUCCEEDED;
        state.response = action.payload;
      })
      .addCase(PostClassRequest.rejected, (state, action) => {
        state.status = FAILED;
        state.error = action.payload?.message || 'Failed to create class';
      });
  },
});

export const { clearPostClassState } = postClassSlice.actions;
export default postClassSlice.reducer;
const selectPostClassState = (state: RootState) => state.Class;

export const selectPostClassLoading = createSelector(
  selectPostClassState,
  (s) => s.status === LOADING,
);
export const selectPostClassSuccess = createSelector(
  selectPostClassState,
  (s) => s.status === SUCCEEDED,
);
export const selectPostClassError = createSelector(selectPostClassState, (s) => s.error);
export const selectPostClassResponse = createSelector(selectPostClassState, (s) => s.response);
