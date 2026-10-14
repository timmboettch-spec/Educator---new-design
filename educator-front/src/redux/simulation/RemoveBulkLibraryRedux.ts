import {
  createAsyncThunk,
  createSelector,
  createSlice,
} from '@reduxjs/toolkit';
import api from '../api';
import config from '../config';
import { type RootState } from '@/store';
import { invalidateMyLibraryList } from '../api/myLibrary/myLibraryApi';
import { clearSimulationLibraryState } from '../dashboard/simulationlibrary/GetSimulationRedux';

interface BulkLibraryResponse {
  success: boolean;
  message: string;
  data?: unknown;
}

interface RemoveBulkLibraryState {
  adding: boolean;
  loading: boolean;
  error: string | null;
}

const initialState: RemoveBulkLibraryState = {
  adding: false,
  loading: false,
  error: null,
};

export const RemoveBulkLibraryRequest = createAsyncThunk<
  BulkLibraryResponse,
  { scenarioIds: string[] },
  { rejectValue: string }
>(
  'myLibrary/RemoveBulk',
  async ({ scenarioIds }, { rejectWithValue, dispatch }) => {
    try {
      const response = await api.delete(config.RemoveBulkLibraryAPI, {
        data: {
          scenario_ids: scenarioIds,
        },
      });
      dispatch(invalidateMyLibraryList());
      // The assign modal's full copy is now out of date: dropped, so it is
      // loaded again when next needed.
      dispatch(clearSimulationLibraryState());

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
          (err instanceof Error ? err.message : 'Failed to remove simulations')
      );
    }
  }
);

const RemoveBulkLibrarySlice = createSlice({
  name: 'RemoveBulkLibrary',
  initialState,
  reducers: {
    clearAddLibraryError: (state) => {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(RemoveBulkLibraryRequest.pending, (state) => {
        state.adding = true;
        state.error = null;
      })
      .addCase(RemoveBulkLibraryRequest.fulfilled, (state) => {
        state.adding = false;
      })
      .addCase(RemoveBulkLibraryRequest.rejected, (state, action) => {
        state.adding = false;
        state.error =
          action.payload ?? action.error.message ?? 'Failed to add simulations';
      });
  },
});

export const { clearAddLibraryError } = RemoveBulkLibrarySlice.actions;

export default RemoveBulkLibrarySlice.reducer;

const selectRemoveBulkLibrary = (state: RootState) => state.removeBulkLibrary;

export const selectLibraryAdding = createSelector(
  selectRemoveBulkLibrary,
  (state) => state.adding
);

export const selectLibraryLoading = createSelector(
  selectRemoveBulkLibrary,
  (state) => state.loading
);

export const selectLibraryError = createSelector(
  selectRemoveBulkLibrary,
  (state) => state.error
);
