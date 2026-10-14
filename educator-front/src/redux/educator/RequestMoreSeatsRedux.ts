import {
  createAsyncThunk,
  createSelector,
  createSlice,
} from '@reduxjs/toolkit';
import type { RootState } from '../../store';
import { FAILED, IDLE, LOADING, SUCCEEDED } from '../../utils/constants';
import config from '../config';
import api from '../api';

/**
 * Educator-initiated CTA that notifies the admin (via email + in-app
 * notification) that the educator wants more AI simulation seats
 * allocated. See backend: POST /api/educators/request-seats.
 */

export interface RequestSeatsInput {
  requested_seats?: number;
  note?: string;
}

export interface RequestSeatsResponseData {
  requestedAt: string;
  /** Seconds the educator must wait before sending another request. */
  cooldownSeconds: number;
}

export interface RequestSeatsResponse {
  message: string;
  status: string;
  data?: RequestSeatsResponseData | null;
}

export interface RequestSeatsState {
  status: 'idle' | 'loading' | 'succeeded' | 'failed';
  response: RequestSeatsResponse | null;
  error: string | null;
  lastRequestedAt: string | null;
}

const initialState: RequestSeatsState = {
  status: IDLE,
  response: null,
  error: null,
  lastRequestedAt: null,
};

export const RequestMoreSeats = createAsyncThunk<
  RequestSeatsResponse,
  RequestSeatsInput,
  { rejectValue: { message: string } }
>('educator/requestMoreSeats', async (payload, thunkAPI) => {
  try {
    const body: RequestSeatsInput = {};
    if (
      typeof payload.requested_seats === 'number' &&
      payload.requested_seats > 0
    ) {
      body.requested_seats = Math.floor(payload.requested_seats);
    }
    if (payload.note && payload.note.trim().length > 0) {
      body.note = payload.note.trim();
    }
    const res = await api.post<RequestSeatsResponse>(
      config.RequestSeatsAPI,
      body
    );
    return res.data;
  } catch (err: unknown) {
    const error = err as {
      response?: { data?: { message?: string; msg?: string } };
    };
    return thunkAPI.rejectWithValue({
      message:
        error.response?.data?.message ||
        error.response?.data?.msg ||
        'Failed to send seat request',
    });
  }
});

const RequestMoreSeatsSlice = createSlice({
  name: 'educator/requestMoreSeats',
  initialState,
  reducers: {
    clearRequestMoreSeatsState(state) {
      state.status = IDLE;
      state.response = null;
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(RequestMoreSeats.pending, (state) => {
        state.status = LOADING;
        state.error = null;
      })
      .addCase(RequestMoreSeats.fulfilled, (state, action) => {
        state.status = SUCCEEDED;
        state.response = action.payload;
        state.lastRequestedAt =
          action.payload.data?.requestedAt ?? new Date().toISOString();
      })
      .addCase(RequestMoreSeats.rejected, (state, action) => {
        state.status = FAILED;
        state.error = action.payload?.message || 'Failed to send seat request';
      });
  },
});

export const { clearRequestMoreSeatsState } = RequestMoreSeatsSlice.actions;
export default RequestMoreSeatsSlice.reducer;

// ── Selectors ──────────────────────────────────────────────────────────────

const selectState = (state: RootState): RequestSeatsState =>
  (state as RootState & { RequestMoreSeats?: RequestSeatsState })
    .RequestMoreSeats ?? initialState;

export const selectRequestMoreSeatsStatus = createSelector(
  selectState,
  (s) => s.status
);
export const selectRequestMoreSeatsError = createSelector(
  selectState,
  (s) => s.error
);
export const selectRequestMoreSeatsResponse = createSelector(
  selectState,
  (s) => s.response
);
