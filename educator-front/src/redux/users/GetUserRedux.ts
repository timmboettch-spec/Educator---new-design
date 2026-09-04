import { getStoredUser } from '../../utils/storage';
import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import config from '../config';
import { User } from '../../types';
import api from '../api';

interface UsersResponse {
  data: User;
}

interface UsersState {
  data: User | null;
  loading: boolean;
  error: string | null;
}

const initialState: UsersState = {
  data: null,
  loading: false,
  error: null,
};

export const getCurrentUserRequest = createAsyncThunk<UsersResponse, void, { rejectValue: string }>(
  'currentUser/fetch',
  async (_, { rejectWithValue }) => {
    try {
      const userData = getStoredUser();

      if (!userData) {
        return rejectWithValue('User not found');
      }

      const user = JSON.parse(userData);
      const userId = user.id;
      const userType = user.role;
      const url =
        userType === 'Educator'
          ? `${config.GetEducatorAPI}/${userId}`
          : `${config.UsersAPI}/${userId}`;

      const res = await api.get(url);
      return res.data;
    } catch (err: unknown) {
      return rejectWithValue(err instanceof Error ? err.message : 'Unknown error');
    }
  },
);

const userLibrarySlice = createSlice({
  name: 'userLibrary',
  initialState,
  reducers: {
    clearSimulationLibrary(state) {
      state.data = null;
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(getCurrentUserRequest.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(getCurrentUserRequest.fulfilled, (state, action) => {
        state.loading = false;
        state.data = action.payload.data;
      })
      .addCase(getCurrentUserRequest.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload ?? 'Failed to load user data';
      });
  },
});

export const { clearSimulationLibrary } = userLibrarySlice.actions;
export default userLibrarySlice.reducer;
