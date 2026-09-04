import { createAsyncThunk, createSelector, createSlice } from '@reduxjs/toolkit';
import api from '../api';
import config from '../config';
import { RootState } from '@/store';

interface BulkLibraryResponse {
  success: boolean;
  message: string;
  data?: unknown;
}

interface AddToLibraryState {
  adding: boolean;
  loading: boolean;
  error: string | null;
}

const initialState: AddToLibraryState = {
  adding: false,
  loading: false,
  error: null,
};

export const AddToBulkLibraryRequest = createAsyncThunk<
  BulkLibraryResponse,
  { scenarioIds: string[] },
  { rejectValue: string }
>(
  'myLibrary/addBulk',
  async ({ scenarioIds }, { rejectWithValue }) => {
    try {
      const response = await api.post(
        config.AddToBulkLibraryAPI,
        {
          scenario_ids: scenarioIds,
        },
      );

      return response.data;
    } catch (err: unknown) {
      const error = err as {
        response?: {
          data?: {
            message?: string;
            error?: string;
          };
        };
      };

      return rejectWithValue(
        error.response?.data?.message ??
        error.response?.data?.error ??
        (err instanceof Error ? err.message : 'Failed to add simulations'),
      );
    }
  },
);

const addToLibrarySlice = createSlice({
  name: 'addToLibrary',
  initialState,
  reducers: {
    clearAddLibraryError: (state) => {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(AddToBulkLibraryRequest.pending, (state) => {
        state.adding = true;
        state.error = null;
      })
      .addCase(AddToBulkLibraryRequest.fulfilled, (state) => {
        state.adding = false;
      })
      .addCase(AddToBulkLibraryRequest.rejected, (state, action) => {
        state.adding = false;
        state.error =
          action.payload ??
          action.error.message ??
          'Failed to add simulations';
      });
  },
});

export const { clearAddLibraryError } = addToLibrarySlice.actions;

export default addToLibrarySlice.reducer;

const selectAddToLibrary = (state: RootState) =>
  state.addToBulkLibrary;

export const selectLibraryAdding = createSelector(
  selectAddToLibrary,
  (state) => state.adding,
);

export const selectLibraryLoading = createSelector(
  selectAddToLibrary,
  (state) => state.loading,
);

export const selectLibraryError = createSelector(
  selectAddToLibrary,
  (state) => state.error,
);