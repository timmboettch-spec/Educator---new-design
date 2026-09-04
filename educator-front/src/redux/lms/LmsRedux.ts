import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import type { RootState } from '../../store';
import { FAILED, IDLE, LOADING, SUCCEEDED } from '../../utils/constants';
import config from '../config';
import api from '../api';

export interface LtiToolMetadata {
  baseUrl?: string;
  initiateLoginUrl: string;
  redirectUris: string[];
  jwksUrl: string;
  targetLinkUri: string;
  studentinitiateLoginUrl: string;
  studentredirectUris: string[];
  studentjwksUrl: string;
  studenttargetLinkUri: string;
}

export interface LmsSchoolConfig {
  id?: string;
  schoolId: string;
  lmsType: string;
  issuer: string;
  clientId: string;
  authEndpoint: string;
  tokenEndpoint: string;
  jwksUrl: string;
  platformKeyId?: string;
  status?: string;
  sharePii?: boolean;
  lmsBaseUrl?: string | null;
  /** @deprecated Backend alias — prefer lmsBaseUrl */
  moodleUrl?: string | null;
}

export interface ConfigureLmsPayload {
  schoolId?: string;
  lmsType: string;
  issuer: string;
  clientId: string;
  authEndpoint: string;
  tokenEndpoint: string;
  jwksUrl: string;
  sharePii?: boolean;
  lmsBaseUrl?: string;
  lmsApiToken?: string;
}

interface LmsState {
  metadata: LtiToolMetadata | null;
  metadataState: 'idle' | 'loading' | 'succeeded' | 'failed';
  schoolConfig: LmsSchoolConfig | null;
  schoolConfigState: 'idle' | 'loading' | 'succeeded' | 'failed';
  saveConfigState: 'idle' | 'loading' | 'succeeded' | 'failed';
  error: string | null;
}

const initialState: LmsState = {
  metadata: null,
  metadataState: IDLE,
  schoolConfig: null,
  schoolConfigState: IDLE,
  saveConfigState: IDLE,
  error: null,
};

export const fetchLtiMetadata = createAsyncThunk<
  LtiToolMetadata,
  void,
  { rejectValue: { message: string } }
>('lms/fetchMetadata', async (_, thunkAPI) => {
  try {
    const res = await api.get(config.LtiMetadataAPI);
    return res.data as LtiToolMetadata;
  } catch (err) {
    const error = err as { response?: { data?: { message?: string } } };
    return thunkAPI.rejectWithValue({
      message: error.response?.data?.message ?? 'Failed to fetch LTI metadata',
    });
  }
});

export const fetchEducatorLmsConfig = createAsyncThunk<
  LmsSchoolConfig | null,
  string | undefined,
  { rejectValue: { message: string } }
>('lms/fetchEducatorConfig', async (schoolId, thunkAPI) => {
  try {
    const endpoint = schoolId?.trim()
      ? `${config.LmsConfigureAPI}/${schoolId.trim()}/config`
      : config.LmsEducatorConfigAPI;
    const res = await api.get(endpoint);
    return (res.data?.data ?? null) as LmsSchoolConfig | null;
  } catch (err) {
    const error = err as { response?: { data?: { message?: string } } };
    return thunkAPI.rejectWithValue({
      message: error.response?.data?.message ?? 'Failed to fetch LMS config',
    });
  }
});

export const saveEducatorLmsConfig = createAsyncThunk<
  LmsSchoolConfig,
  ConfigureLmsPayload,
  { rejectValue: { message: string } }
>('lms/saveEducatorConfig', async (payload, thunkAPI) => {
  try {
    const res = await api.post(`${config.LmsConfigureAPI}/configure`, payload);
    return res.data?.data as LmsSchoolConfig;
  } catch (err) {
    const error = err as { response?: { data?: { message?: string } } };
    return thunkAPI.rejectWithValue({
      message: error.response?.data?.message ?? 'Failed to save LMS configuration',
    });
  }
});

const lmsSlice = createSlice({
  name: 'lms',
  initialState,
  reducers: {
    resetSaveConfigState: (state) => {
      state.saveConfigState = IDLE;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchLtiMetadata.pending, (state) => {
        state.metadataState = LOADING;
        state.error = null;
      })
      .addCase(fetchLtiMetadata.fulfilled, (state, action) => {
        state.metadataState = SUCCEEDED;
        state.metadata = action.payload;
      })
      .addCase(fetchLtiMetadata.rejected, (state, action) => {
        state.metadataState = FAILED;
        state.error = action.payload?.message ?? 'Failed to load metadata';
      })
      .addCase(fetchEducatorLmsConfig.pending, (state) => {
        state.schoolConfigState = LOADING;
      })
      .addCase(fetchEducatorLmsConfig.fulfilled, (state, action) => {
        state.schoolConfigState = SUCCEEDED;
        state.schoolConfig = action.payload;
      })
      .addCase(fetchEducatorLmsConfig.rejected, (state) => {
        state.schoolConfigState = FAILED;
        state.schoolConfig = null;
      })
      .addCase(saveEducatorLmsConfig.pending, (state) => {
        state.saveConfigState = LOADING;
      })
      .addCase(saveEducatorLmsConfig.fulfilled, (state, action) => {
        state.saveConfigState = SUCCEEDED;
        state.schoolConfig = action.payload;
      })
      .addCase(saveEducatorLmsConfig.rejected, (state, action) => {
        state.saveConfigState = FAILED;
        state.error = action.payload?.message ?? 'Failed to save config';
      });
  },
});

export const { resetSaveConfigState } = lmsSlice.actions;
export const selectLtiMetadata = (state: RootState) => state.lms.metadata;
export const selectLmsMetadataState = (state: RootState) => state.lms.metadataState;
export const selectSchoolLmsConfig = (state: RootState) => state.lms.schoolConfig;
export const selectSchoolConfigState = (state: RootState) => state.lms.schoolConfigState;
export const selectSaveConfigState = (state: RootState) => state.lms.saveConfigState;
export default lmsSlice.reducer;