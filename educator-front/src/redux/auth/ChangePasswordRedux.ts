import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import axios from 'axios';
import config from '../config';
import api from '../api';

interface ChangePasswordPayload {
  user_id: string;
  old_password: string;
  new_password: string;
}

interface ChangePasswordState {
  status: 'idle' | 'loading' | 'succeeded' | 'failed';
  error: string | null;
}

const initialState: ChangePasswordState = {
  status: 'idle',
  error: null,
};

export const changePasswordRequest = createAsyncThunk<
  string,
  ChangePasswordPayload,
  { rejectValue: string }
>('changePassword/changePassword', async (payload, { rejectWithValue }) => {
  try {
    const res = await api.put(config.ChangePasswordAPI, payload);
    return res.data?.message || 'Password changed successfully';
  } catch (error: unknown) {
    if (axios.isAxiosError(error)) {
      return rejectWithValue(error.response?.data?.message || 'Failed to change password');
    }
    return rejectWithValue('Failed to change password');
  }
});

const changePasswordSlice = createSlice({
  name: 'changePassword',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(changePasswordRequest.pending, (state) => {
        state.status = 'loading';
      })
      .addCase(changePasswordRequest.fulfilled, (state) => {
        state.status = 'succeeded';
        state.error = null;
      })
      .addCase(changePasswordRequest.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.payload || 'Something went wrong';
      });
  },
});

export default changePasswordSlice.reducer;
