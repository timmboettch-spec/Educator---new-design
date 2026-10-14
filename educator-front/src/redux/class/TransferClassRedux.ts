import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import axios from 'axios';
import type { RootState } from '../../store';
import config from '../config';
import axiosInstance from '../axiosInstance';

// ── Types ──────────────────────────────────────────────────────────────────

export interface ClassTransferPayload {
  classId: string;
  targetEducatorId: string;
}

export interface ClassTransferAuditRecord {
  id: string;
  classId: string;
  className: string;
  sourceEducatorId: string;
  sourceEducatorName: string | null;
  targetEducatorId: string;
  targetEducatorName: string | null;
  adminId: string;
  adminEmail: string | null;
  status: 'SUCCESS' | 'FAILED';
  notes: string | null;
  transferredAt: string;
}

interface TransferClassResponse {
  status: string;
  message: string;
  data: ClassTransferAuditRecord;
}

interface TransferClassState {
  status: 'idle' | 'loading' | 'succeeded' | 'failed';
  error: string | null;
  lastAudit: ClassTransferAuditRecord | null;
}

// ── Initial state ──────────────────────────────────────────────────────────

const initialState: TransferClassState = {
  status: 'idle',
  error: null,
  lastAudit: null,
};

// ── Thunk ──────────────────────────────────────────────────────────────────

export const TransferClassRequest = createAsyncThunk<
  TransferClassResponse,
  ClassTransferPayload,
  { rejectValue: string }
>('classTransfer/transfer', async (payload, { rejectWithValue }) => {
  try {
    const res = await axiosInstance.post<TransferClassResponse>(
      `${config.ClassTransferAPI}`,
      payload,
      {
        headers: { 'ngrok-skip-browser-warning': 'true' },
      }
    );
    return res.data;
  } catch (err: unknown) {
    if (axios.isAxiosError(err)) {
      const msg =
        (err.response?.data as { message?: string })?.message ||
        'Transfer failed';
      return rejectWithValue(msg);
    }
    return rejectWithValue('Transfer failed');
  }
});

// ── Slice ──────────────────────────────────────────────────────────────────

const TransferClassSlice = createSlice({
  name: 'transferClass',
  initialState,
  reducers: {
    resetTransferState: (state) => {
      state.status = 'idle';
      state.error = null;
      state.lastAudit = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(TransferClassRequest.pending, (state) => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(TransferClassRequest.fulfilled, (state, action) => {
        state.status = 'succeeded';
        state.lastAudit = action.payload.data;
      })
      .addCase(TransferClassRequest.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.payload ?? 'Transfer failed';
      });
  },
});

export const { resetTransferState } = TransferClassSlice.actions;

export const selectTransferClassStatus = (state: RootState) =>
  (state as RootState & { TransferClass?: TransferClassState }).TransferClass
    ?.status ?? 'idle';

export const selectTransferClassError = (state: RootState) =>
  (state as RootState & { TransferClass?: TransferClassState }).TransferClass
    ?.error ?? null;

export const selectTransferClassLastAudit = (state: RootState) =>
  (state as RootState & { TransferClass?: TransferClassState }).TransferClass
    ?.lastAudit ?? null;

export default TransferClassSlice.reducer;
