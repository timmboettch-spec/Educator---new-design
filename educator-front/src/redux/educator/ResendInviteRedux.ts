import {
  createAsyncThunk,
  createSelector,
  createSlice,
} from '@reduxjs/toolkit';
import type { RootState } from '../../store';
import { FAILED, IDLE, LOADING, SUCCEEDED } from '../../utils/constants';
import config from '../config';
import api from '../api';

export interface ResendInviteResponse {
  message: string;
  status: string;
}

export interface ResendInviteState {
  responseResendInvite: ResendInviteResponse | null;
  status: 'idle' | 'loading' | 'succeeded' | 'failed';
  error: string | null;
}

const initialState: ResendInviteState = {
  responseResendInvite: null,
  status: IDLE,
  error: null,
};

export const ResendInviteRequest = createAsyncThunk<
  ResendInviteResponse,
  string,
  { rejectValue: { message: string } }
>('educator/resendInvite', async (id, thunkAPI) => {
  try {
    const res = await api.post(`${config.ResendInviteAPI}/${id}/resend-invite`);
    return res.data;
  } catch (err: unknown) {
    const error = err as {
      response?: {
        status: number;
        data?: {
          status: number;
          message?: string;
        };
      };
    };
    return thunkAPI.rejectWithValue({
      message: error.response?.data?.message || 'Failed to resend invitation',
    });
  }
});

const ResendInviteSlice = createSlice({
  name: 'educator/resendInvite',
  initialState,
  reducers: {
    clearResendInviteState(state) {
      state.responseResendInvite = null;
      state.status = IDLE;
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(ResendInviteRequest.pending, (state) => {
        state.status = LOADING;
        state.error = null;
      })
      .addCase(ResendInviteRequest.fulfilled, (state, action) => {
        state.status = SUCCEEDED;
        state.responseResendInvite = action.payload;
      })
      .addCase(ResendInviteRequest.rejected, (state, action) => {
        state.status = FAILED;
        state.error = action.payload?.message || 'Failed to resend invitation';
      });
  },
});

export const { clearResendInviteState } = ResendInviteSlice.actions;

export default ResendInviteSlice.reducer;

const selectState = (state: RootState) => state.ResendInvite;

export const selectResendInviteStatus = createSelector(
  selectState,
  (state) => state.status
);
export const selectResendInviteError = createSelector(
  selectState,
  (state) => state.error
);
