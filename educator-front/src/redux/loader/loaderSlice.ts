import { createSlice } from '@reduxjs/toolkit';
import type { PayloadAction } from '@reduxjs/toolkit';
import type { RootState } from '../../store';

export interface PendingToast {
  message: string;
  type: 'success' | 'error' | 'info' | 'warning';
}

interface LoaderState {
  isLoading: boolean;
  isLoggingOut: boolean;
  apiRequestCount: number;
  pendingToast: PendingToast | null;
}

const initialState: LoaderState = {
  isLoading: false,
  isLoggingOut: false,
  apiRequestCount: 0,
  pendingToast: null,
};

const loaderSlice = createSlice({
  name: 'loader',
  initialState,
  reducers: {
    setLoading: (state, action) => {
      state.isLoading = action.payload;
    },

    setLoggingOut: (state, action) => {
      state.isLoggingOut = action.payload;
    },

    incrementApiRequest: (state) => {
      state.apiRequestCount += 1;
      state.isLoading = true;
    },

    decrementApiRequest: (state) => {
      state.apiRequestCount = Math.max(0, state.apiRequestCount - 1);

      if (state.apiRequestCount === 0) {
        state.isLoading = false;
      }
    },

    setPendingToast: (state, action: PayloadAction<PendingToast>) => {
      state.pendingToast = action.payload;
    },

    clearPendingToast: (state) => {
      state.pendingToast = null;
    },
  },
});

export const {
  setLoading,
  setLoggingOut,
  incrementApiRequest,
  decrementApiRequest,
  setPendingToast,
  clearPendingToast,
} = loaderSlice.actions;

export const selectIsLoading = (state: RootState) => state.loader.isLoading;

export const selectIsLoggingOut = (state: RootState) =>
  state.loader.isLoggingOut;

export const selectApiRequestCount = (state: RootState) =>
  state.loader.apiRequestCount;

export const selectPendingToast = (state: RootState) =>
  state.loader.pendingToast;

export default loaderSlice.reducer;
