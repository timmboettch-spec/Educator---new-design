import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import axios from 'axios';
import config from '../config';
import api from '../api';

interface RemoveProfilePictureResponse {
  message?: string;
}

interface RemoveProfilePictureState {
  loading: boolean;
  error: string;
}

export const removeProfilePictureRequest = createAsyncThunk<
  RemoveProfilePictureResponse,
  void,
  { rejectValue: string }
>('profile/removePicture', async (_, { rejectWithValue }) => {
  try {
    const res = await api.delete(config.RemoveProfilePhotoAPI, {});
    return res.data;
  } catch (error: unknown) {
    if (axios.isAxiosError(error)) {
      return rejectWithValue(error.response?.data?.message ?? 'Remove failed');
    }
    return rejectWithValue('Remove failed');
  }
});

const initialState: RemoveProfilePictureState = {
  loading: false,
  error: '',
};

const removeProfilePictureSlice = createSlice({
  name: 'removeProfilePicture',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(removeProfilePictureRequest.pending, (state) => {
        state.loading = true;
        state.error = '';
      })
      .addCase(removeProfilePictureRequest.fulfilled, (state) => {
        state.loading = false;
      })
      .addCase(removeProfilePictureRequest.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload ?? 'Remove failed';
      });
  },
});

export default removeProfilePictureSlice.reducer;
