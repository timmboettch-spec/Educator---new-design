import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import axios from 'axios';
import config from '../config';
import { ACCOUNT_VALIDATION } from '../../utils/messages/account';
import { isValidProfileImageFile } from '../../utils/validation';
import api from '../api';

interface UpdateProfilePayload {
  fullName: string;
  profile_image?: File | null;
  remove_photo?: boolean;
  /** Keeps the full-page loader off (see loaderMiddleware); not sent to the API. */
  silent?: boolean;
}

interface UpdateProfileResponse {
  message?: string;
  data?: {
    fullName?: string;
  };
}

interface UpdateProfileState {
  loading: boolean;
  error: string;
  success: string;
}

export const updateProfileRequest = createAsyncThunk<
  UpdateProfileResponse,
  UpdateProfilePayload,
  { rejectValue: string }
>('profile/update', async (payload, { rejectWithValue }) => {
  try {
    if (
      payload.profile_image &&
      !isValidProfileImageFile(payload.profile_image)
    ) {
      return rejectWithValue(ACCOUNT_VALIDATION.IMAGE_TYPE_INVALID);
    }
    // A name-only change uses the documented JSON body. Photo changes stay
    // multipart until the backend confirms how `profilePictureUrl` is obtained.
    if (!payload.profile_image && !payload.remove_photo) {
      const res = await api.put(config.UpdateProfileAPI, {
        fullName: payload.fullName,
      });
      return res.data;
    }

    const formData = new FormData();
    formData.append('fullName', payload.fullName);

    if (payload.profile_image) {
      formData.append('file', payload.profile_image);
    }

    if (payload.remove_photo) {
      formData.append('remove_photo', 'true');
    }

    const res = await api.put(config.UpdateProfileAPI, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return res.data;
  } catch (error: unknown) {
    if (axios.isAxiosError(error)) {
      return rejectWithValue(error.response?.data?.message ?? 'Update failed');
    }

    return rejectWithValue('Update failed');
  }
});

const initialState: UpdateProfileState = {
  loading: false,
  error: '',
  success: '',
};

const UpdateProfileSlice = createSlice({
  name: 'updateProfile',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(updateProfileRequest.pending, (state) => {
        state.loading = true;
        state.error = '';
        state.success = '';
      })
      .addCase(updateProfileRequest.fulfilled, (state) => {
        state.loading = false;
        state.success = 'Profile updated successfully';
      })
      .addCase(updateProfileRequest.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload ?? action.error.message ?? 'Update failed';
      });
  },
});

export default UpdateProfileSlice.reducer;
