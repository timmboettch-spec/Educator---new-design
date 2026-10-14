import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { FAILED, IDLE, LOADING, SUCCEEDED } from '../../utils/constants';
import config from '../config';
import api from '../api';

export const RemoveEducatorSchoolRequest = createAsyncThunk<
  { message: string },
  { educatorId: string; schoolId: string },
  { rejectValue: { message: string } }
>('educator/removeSchool', async ({ educatorId, schoolId }, thunkAPI) => {
  try {
    const res = await api.delete(
      `${config.UpdateEducatorAPI}/${educatorId}/schools/${schoolId}`
    );
    return res.data;
  } catch (err: unknown) {
    const error = err as { response?: { data?: { message?: string } } };
    return thunkAPI.rejectWithValue({
      message: error.response?.data?.message || 'Failed to remove school',
    });
  }
});

interface RemoveEducatorSchoolState {
  status: 'idle' | 'loading' | 'succeeded' | 'failed';
  error: string | null;
}

const initialState: RemoveEducatorSchoolState = { status: IDLE, error: null };

const RemoveEducatorSchoolSlice = createSlice({
  name: 'educator/removeSchool',
  initialState,
  reducers: {
    clearRemoveEducatorSchoolState(state) {
      state.status = IDLE;
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(RemoveEducatorSchoolRequest.pending, (state) => {
        state.status = LOADING;
        state.error = null;
      })
      .addCase(RemoveEducatorSchoolRequest.fulfilled, (state) => {
        state.status = SUCCEEDED;
      })
      .addCase(RemoveEducatorSchoolRequest.rejected, (state, action) => {
        state.status = FAILED;
        state.error = action.payload?.message ?? 'Error';
      });
  },
});

export const { clearRemoveEducatorSchoolState } =
  RemoveEducatorSchoolSlice.actions;
export default RemoveEducatorSchoolSlice.reducer;
