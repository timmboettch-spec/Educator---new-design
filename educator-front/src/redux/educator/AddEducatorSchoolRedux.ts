import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { FAILED, IDLE, LOADING, SUCCEEDED } from '../../utils/constants';
import config from '../config';
import api from '../api';

export const AddEducatorSchoolRequest = createAsyncThunk<
  { message: string },
  { educatorId: string; school_id: string },
  { rejectValue: { message: string } }
>('educator/addSchool', async ({ educatorId, school_id }, thunkAPI) => {
  try {
    const res = await api.post(
      `${config.UpdateEducatorAPI}/${educatorId}/schools`,
      { school_id },
    );
    return res.data;
  } catch (err: unknown) {
    const error = err as { response?: { data?: { message?: string } } };
    return thunkAPI.rejectWithValue({
      message: error.response?.data?.message || 'Failed to add school',
    });
  }
});

interface AddEducatorSchoolState {
  status: 'idle' | 'loading' | 'succeeded' | 'failed';
  error: string | null;
}

const initialState: AddEducatorSchoolState = { status: IDLE, error: null };

const AddEducatorSchoolSlice = createSlice({
  name: 'educator/addSchool',
  initialState,
  reducers: {
    clearAddEducatorSchoolState(state) {
      state.status = IDLE;
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(AddEducatorSchoolRequest.pending, (state) => {
        state.status = LOADING;
        state.error = null;
      })
      .addCase(AddEducatorSchoolRequest.fulfilled, (state) => {
        state.status = SUCCEEDED;
      })
      .addCase(AddEducatorSchoolRequest.rejected, (state, action) => {
        state.status = FAILED;
        state.error = action.payload?.message ?? 'Error';
      });
  },
});

export const { clearAddEducatorSchoolState } = AddEducatorSchoolSlice.actions;
export default AddEducatorSchoolSlice.reducer;
