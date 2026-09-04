import { createAsyncThunk, createSelector, createSlice } from '@reduxjs/toolkit';
import type { RootState } from '../../store';
import { FAILED, IDLE, LOADING, SUCCEEDED } from '../../utils/constants';
import config from '../config';
import api from '../api';

export interface PostSchoolPayload {
  school_name: string;
  status: string;
  user_id: string;
}

export interface PostSchoolResponse {
  data: {
    id: string;
    status: string;
    user_id: string;
  };
  message: string;
  status: string;
}

export interface PostSchoolState {
  response: PostSchoolResponse | null;
  status: 'idle' | 'loading' | 'succeeded' | 'failed';
  error: string | null;
}

const initialState: PostSchoolState = {
  response: null,
  status: IDLE,
  error: null,
};

export const PostSchoolRequest = createAsyncThunk<
  PostSchoolResponse,
  PostSchoolPayload,
  { rejectValue: { message: string } }
>('postSchool', async (data, thunkAPI) => {
  try {
    const url = `${config.SchoolAPI}`;
    const res = await api.post(url, data, {
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
      message: error.response?.data?.message || 'Post School failed',
    });
  }
});

const PostSchoolSlice = createSlice({
  name: 'postSchool',
  initialState,
  reducers: {
    resetPostSchool(state) {
      state.response = null;
      state.status = IDLE;
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder.addCase(PostSchoolRequest.pending, (state) => {
      state.status = LOADING;
      state.error = null;
    });
    builder.addCase(PostSchoolRequest.fulfilled, (state, action) => {
      state.status = SUCCEEDED;
      state.response = action.payload;
    });
    builder.addCase(PostSchoolRequest.rejected, (state, action) => {
      state.status = FAILED;
      state.error = action.payload?.message || 'Post School failed';
    });
  },
});

export const { resetPostSchool } = PostSchoolSlice.actions;
export default PostSchoolSlice.reducer;
const selectState = (state: RootState) => state.PostSchool;
export const selectPostSchoolResponse = createSelector(selectState, (state) => state.response);
export const selectPostSchoolStatus = createSelector(selectState, (state) => state.status);
export const selectPostSchoolError = createSelector(selectState, (state) => state.error);
