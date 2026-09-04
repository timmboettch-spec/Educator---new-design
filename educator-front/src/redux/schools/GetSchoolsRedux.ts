import { getStoredUser } from '../../utils/storage';
import { createAsyncThunk, createSelector, createSlice } from '@reduxjs/toolkit';
import type { RootState } from '../../store';
import { FAILED, IDLE, LOADING, SUCCEEDED } from '../../utils/constants';
import config from '../config';
import api from '../api';

export interface School {
  id: string;
  school_name: string;
  status: string;
  user_id: string;
  totalTokens?: number;
  tokensUsed?: number;
  remainingTokens?: number;
  educatorCount?: number;
  // Derived placeholder used for the sortable Hardware Hours Used column.
  hardwareHoursUsed?: number;
}
export interface ResponseSchool {
  data: School[] | { items: School[] };
  message: string;
  status: string;
}

export interface SchoolState {
  responseSchool: ResponseSchool | null;
  status: 'idle' | 'loading' | 'succeeded' | 'failed';
  error: string | null;
}

const initialState: SchoolState = {
  responseSchool: null,
  status: IDLE,
  error: null,
};

export const GetSchoolRequest = createAsyncThunk<ResponseSchool, { status?: string } | undefined>(
  '/schools',
  async (params, thunkAPI) => {
    try {
      const userData = getStoredUser();
      let userId = '';

      if (userData) {
        const user = JSON.parse(userData);
        userId = user.id;
      }

      if (!userId) {
        return thunkAPI.rejectWithValue({ message: 'User not authenticated' });
      }
      let url = `${config.SchoolAPI}/admin/${userId}`;
      if (params?.status) {
        url += `?status=${params.status}`;
      }

      const res = await api.get(url, {
      headers: {
        'ngrok-skip-browser-warning': 'true',
      }
    });
      const rawData = res.data?.data ?? res.data;
      const rawItems: Record<string, unknown>[] = Array.isArray(rawData)
        ? rawData
        : Array.isArray(rawData?.items)
          ? rawData.items
          : [];

      const normalizedItems: School[] = rawItems.map((item) => ({
        id: item.id as string,
        school_name: item.school_name as string,
        status: item.status as string,
        user_id: item.user_id as string,
        totalTokens: ((item.tokens as number) || 0) + ((item.allocated_tokens as number) || 0),
        tokensUsed: (item.allocated_tokens as number) || 0,
        remainingTokens: (item.tokens as number) || 0,
      }));

      return {
        ...res.data,
        data: normalizedItems,
      };
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
        message: error.response?.data?.message || 'School failed',
      });
    }
  },
);

const SchoolSlice = createSlice({
  name: '/schools',
  initialState,
  reducers: {
    resetSchools(state) {
      state.responseSchool = null;
      state.status = IDLE;
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder.addCase(GetSchoolRequest.pending, (state) => {
      state.status = LOADING;
      state.error = null;
    });

    builder.addCase(GetSchoolRequest.fulfilled, (state, action) => {
      state.status = SUCCEEDED;
      state.responseSchool = action.payload;
    });

    builder.addCase(GetSchoolRequest.rejected, (state, action) => {
      state.status = FAILED;
      state.error = action.error.message || 'School failed';
    });
  },
});

export const { resetSchools } = SchoolSlice.actions;
export default SchoolSlice.reducer;
const selectState = (state: RootState) => state.getSchools;
export const selectSchoolResponse = createSelector(selectState, (state) => state.responseSchool);
export const selectSchoolStatus = createSelector(selectState, (state) => state.status);
export const selectSchoolError = createSelector(selectState, (state) => state.error);
export const selectSchools = createSelector(selectSchoolResponse, (response): School[] => {
  const data = response?.data;
  if (!data) return [];
  if (Array.isArray(data)) return data;
  if (Array.isArray((data as { items: School[] }).items)) {
    return (data as { items: School[] }).items;
  }
  return [];
});
export const selectSortedSchools = createSelector(selectSchools, (schools) =>
  [...schools].sort((a, b) => a.school_name.localeCompare(b.school_name)),
);
