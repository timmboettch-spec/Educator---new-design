import { createAsyncThunk, createSelector, createSlice } from '@reduxjs/toolkit';
import config from '../config';
import api from '../api';
import { RootState } from '@/store';

export interface LibrarySimulation {
  id: string;
  simulation_id?: string | null;
  scenario_id: string | null;
  title: string | null;
  unit_id: string;
  difficulty: string | null;
  learnerLevel: string | null;
  description: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface LibraryUnit {
  id: string;
  unit_id: string;
  name: string;
  imageURL: string;
  category: string;
  simulations: LibrarySimulation[];
}

interface MyLibraryState {
  units: LibraryUnit[];
  loading: boolean;
  adding: boolean;
  removing: boolean;
  error: string | null;
}

const initialState: MyLibraryState = {
  units: [],
  loading: false,
  adding: false,
  removing: false,
  error: null,
};

export const AddToLibraryRequest = createAsyncThunk<
  void,
  { scenario_id: string; unit_id: string },
  { rejectValue: string }
>('myLibrary/add', async ({ scenario_id, unit_id }, { rejectWithValue }) => {
  try {
      const res = await api.post(config.AddToLibraryAPI, { scenario_id, unit_id });
      return res.data;
  } catch (err: unknown) {
    const error = err as {
      response?: { status: number; data?: { message?: string; error?: string } };
    };
    return rejectWithValue(
      error.response?.data?.message ??
        error.response?.data?.error ??
        (err instanceof Error ? err.message : 'Unknown error'),
    );
  }
});

const myLibrarySlice = createSlice({
  name: 'myLibrary',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(AddToLibraryRequest.pending, (state) => {
        state.adding = true;
      })
      .addCase(AddToLibraryRequest.fulfilled, (state) => {
        state.adding = false;
      })
      .addCase(AddToLibraryRequest.rejected, (state) => {
        state.adding = false;
      })
  },
});

export default myLibrarySlice.reducer;

const selectMyLibrary = (state: RootState) => state.AddToLibrary;

export const selectLibraryAdding = createSelector(selectMyLibrary, (s) => s.adding);
export const selectLibraryLoading = createSelector(selectMyLibrary, (s) => s.loading);
