import { getStoredUser } from '../../utils/storage';
import {
  createAsyncThunk,
  createSelector,
  createSlice,
} from '@reduxjs/toolkit';
import type { Educator } from '../../types';
import type { RootState } from '../../store';
import { FAILED, IDLE, LOADING, SUCCEEDED } from '../../utils/constants';
import config from '../config';
import api from '../api';

export interface GetEducatorResponseData {
  items: Educator[];
  total: number;
  limit?: number;
  page?: number;
  totalPages?: number;
}

interface GetEducatorResponse {
  data: GetEducatorResponseData;
  message: string;
  status: string;
}

interface GetEducatorState {
  responseGetEducator: GetEducatorResponse | null;
  status: 'idle' | 'loading' | 'succeeded' | 'failed';
  error: string | null;
}

const initialState: GetEducatorState = {
  responseGetEducator: null,
  status: IDLE,
  error: null,
};

export const GetEducatorByUserRequest = createAsyncThunk<
  GetEducatorResponse,
  void,
  { rejectValue: { message: string } }
>('educator/getByUser', async (_, thunkAPI) => {
  try {
    const userData = getStoredUser();
    let userId = '';

    if (userData) {
      const user = JSON.parse(userData);
      userId = user.id;
    }

    if (!userId) {
      return thunkAPI.rejectWithValue({
        message: 'User not authenticated',
      });
    }
    const res = await api.get(`${config.EducatorAPI}/${userId}`, {
      headers: {
        'ngrok-skip-browser-warning': 'true',
      },
    });

    const payload = res.data?.data ?? res.data;

    let items: Educator[] = [];
    let total = 0;

    if (Array.isArray(payload)) {
      items = payload.map((item) => ({
        id: item.id,
        educator_name: item.educator_name || item.full_name || '',
        full_name: item.full_name,
        email: item.email,
        phone_number: item.phone_number,
        status: item.status,
        // Backward-compat: primary school id — falls back to first schoolAssignment
        school_id: (() => {
          if (item.school?.id) return item.school.id as string;
          if (item.school_id) return item.school_id as string;
          const primary = (
            item.schoolAssignments as
              | Array<{ is_primary?: boolean; school?: { id?: string } }>
              | undefined
          )?.find((sa) => sa.is_primary);
          if (primary?.school?.id) return primary.school.id;
          const first = (
            item.schoolAssignments as
              Array<{ school?: { id?: string } }> | undefined
          )?.[0];
          return first?.school?.id ?? '';
        })(),
        school_name: (() => {
          if (item.school?.school_name)
            return item.school.school_name as string;
          if (item.school_name) return item.school_name as string;
          const primary = (
            item.schoolAssignments as
              | Array<{
                  is_primary?: boolean;
                  school?: { school_name?: string };
                }>
              | undefined
          )?.find((sa) => sa.is_primary);
          if (primary?.school?.school_name) return primary.school.school_name;
          const first = (
            item.schoolAssignments as
              Array<{ school?: { school_name?: string } }> | undefined
          )?.[0];
          return first?.school?.school_name ?? '';
        })(),
        // Multi-school: build from schoolAssignments if available, else from legacy school field
        schools:
          Array.isArray(item.schoolAssignments) &&
          item.schoolAssignments.length > 0
            ? item.schoolAssignments
                .filter((sa: Record<string, unknown>) => sa.school)
                .map((sa: Record<string, unknown>) => {
                  const s = sa.school as Record<string, unknown>;
                  return {
                    id: String(s.id ?? ''),
                    school_name: String(s.school_name ?? ''),
                    lms_enabled: Boolean(s.lms_enabled ?? false),
                  };
                })
            : item.school
              ? [
                  {
                    id: item.school.id || '',
                    school_name: item.school.school_name || '',
                    lms_enabled: item.school.lms_enabled ?? false,
                  },
                ]
              : [],
        class_name: item.class_name || '',
        totalTokens: (item.tokens || 0) + (item.allocated_tokens || 0),
        tokensUsed: item.allocated_tokens || 0,
        remainingTokens: item.tokens || 0,
      }));

      total = items.length;
    }

    return {
      ...res.data,
      data: {
        items,
        total,
        limit: 10,
        page: 1,
        totalPages: 1,
      },
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
      message: error.response?.data?.message || 'Failed to fetch educator',
    });
  }
});

const slice = createSlice({
  name: 'educator/getByUser',
  initialState,
  reducers: {
    clearGetEducatorState: (state) => {
      state.responseGetEducator = null;
      state.status = IDLE;
      state.error = null;
    },
    updateEducatorStatusInStore: (
      state,
      action: { payload: { educatorId: string; status: string } }
    ) => {
      const items = state.responseGetEducator?.data?.items;
      if (!items) return;
      const targetId = String(action.payload.educatorId);
      const educator = items.find((e) => String(e.id) === targetId);
      if (educator) {
        educator.status = String(action.payload.status || '').toUpperCase();
      }
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(GetEducatorByUserRequest.pending, (state) => {
        state.status = LOADING;
      })
      .addCase(GetEducatorByUserRequest.fulfilled, (state, action) => {
        state.status = SUCCEEDED;
        state.responseGetEducator = action.payload;
      })
      .addCase(GetEducatorByUserRequest.rejected, (state, action) => {
        state.status = FAILED;
        state.error = action.payload?.message || '';
      });
  },
});

export const { clearGetEducatorState, updateEducatorStatusInStore } =
  slice.actions;
export default slice.reducer;

const selectState = (state: RootState) => state.GetEducator;

export const selectGetEducatorsData = createSelector(selectState, (state) => {
  const data = state.responseGetEducator?.data;
  return {
    items: data?.items ?? [],
    total: data?.total ?? 0,
  };
});

export const selectGetEducatorResponse = createSelector(
  selectState,
  (state) => state.responseGetEducator
);

export const selectActiveGetEducators = createSelector(
  selectGetEducatorsData,
  ({ items }) => items.filter((e) => e.status?.toLowerCase() === 'active')
);

export const selectGetEducatorStatus = createSelector(
  selectState,
  (state) => state.status
);

export const selectGetEducatorError = createSelector(
  selectState,
  (state) => state.error
);

export const selectSortedEducators = createSelector(
  selectGetEducatorsData,
  ({ items }) =>
    [...items].sort((a, b) =>
      (a.full_name || '').localeCompare(b.full_name || '')
    )
);
