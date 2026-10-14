import type { PayloadAction } from '@reduxjs/toolkit';
import {
  createAsyncThunk,
  createSelector,
  createSlice,
} from '@reduxjs/toolkit';
import type { RootState } from '../../../store';
import { FAILED, IDLE, LOADING, SUCCEEDED } from '../../../utils/constants';
import config from '../../config';
import api from '@/redux/api';
import { classSimulationsApi } from '../../api/classSimulations/classSimulationsApi';

export interface AddSimulationPayload {
  class_id: string;
  simulation_id: string;
  start_date: string;
  due_date: string;
  end_date: string;
  reduceToken: number;
}

export interface AddSimulationData {
  id: string;
  simulation_name: string;
  unit: string;
  start_date: string;
  due_date: string;
  end_date: string;
  class_id: string;
  class_name: string;
  category?: string;
  image_url?: string;
}

export interface AddSimulationResponse {
  status: string;
  message: string;
  data: AddSimulationData;
}

export interface UnitSimulation {
  simulation_id: string | undefined;
  id: string;
  title: string;
  unit_id: string;
  unit_name?: string;
  imageURL: string;
  description: string;
  difficulty: string;
  learnerLevel: string;
  avatarEnabled?: boolean;
}

export interface SimulationsByUnitState {
  simulations: UnitSimulation[];
  status: 'idle' | 'loading' | 'succeeded' | 'failed';
  error: string | null;
}

export interface AddSimulationState {
  response: AddSimulationResponse | null;
  status: 'idle' | 'loading' | 'succeeded' | 'failed';
  error: string | null;
}

const unitSimInitialState: SimulationsByUnitState = {
  simulations: [],
  status: IDLE,
  error: null,
};

const initialState: AddSimulationState = {
  response: null,
  status: IDLE,
  error: null,
};

export const fetchSimulationsByUnit = createAsyncThunk<
  UnitSimulation[],
  string,
  { rejectValue: { message: string } }
>('dashboard/fetchSimulationsByUnit', async (unit_id, thunkAPI) => {
  try {
    const res = await api.get(`${config.SimulationByUnitApi}/${unit_id}`, {});

    return (res.data?.data ?? res.data).map((s: Record<string, unknown>) => ({
      ...s,
      title: s?.name ?? s?.title ?? '',
    }));
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
      message: error.response?.data?.message || 'Failed to fetch simulations',
    });
  }
});

const simulationsByUnitSlice = createSlice({
  name: 'dashboard/simulationsByUnit',
  initialState: unitSimInitialState,
  reducers: {
    clearSimulationsByUnit(state) {
      state.simulations = [];
      state.status = IDLE;
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchSimulationsByUnit.pending, (state) => {
        state.status = LOADING;
        state.error = null;
        state.simulations = [];
      })
      .addCase(fetchSimulationsByUnit.fulfilled, (state, action) => {
        state.status = SUCCEEDED;
        state.simulations = Array.isArray(action.payload) ? action.payload : [];
      })
      .addCase(fetchSimulationsByUnit.rejected, (state, action) => {
        state.status = FAILED;
        state.error = action.payload?.message || 'Failed to fetch simulations';
      });
  },
});

export const { clearSimulationsByUnit } = simulationsByUnitSlice.actions;
export const simulationsByUnitReducer = simulationsByUnitSlice.reducer;

export const addSimulationRequest = createAsyncThunk<
  AddSimulationResponse,
  AddSimulationPayload,
  { rejectValue: { message: string } }
>('dashboard/addSimulation', async (payload, thunkAPI) => {
  try {
    const res = await api.post(config.SimulationAPI, payload);
    // The assignments table caches this class's list; refetch it.
    thunkAPI.dispatch(
      classSimulationsApi.util.invalidateTags(['ClassSimulations'])
    );
    return res.data;
  } catch (err) {
    const error = err as { response?: { data?: { message?: string } } };
    return thunkAPI.rejectWithValue({
      message: error.response?.data?.message || 'Failed to create simulation',
    });
  }
});

const addSimulationSlice = createSlice({
  name: 'dashboard/addSimulation',
  initialState,
  reducers: {
    clearAddSimulationState(state) {
      state.response = null;
      state.status = IDLE;
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(addSimulationRequest.pending, (state) => {
        state.status = LOADING;
        state.error = null;
      })
      .addCase(
        addSimulationRequest.fulfilled,
        (state, action: PayloadAction<AddSimulationResponse>) => {
          state.status = SUCCEEDED;
          state.response = action.payload;
        }
      )
      .addCase(addSimulationRequest.rejected, (state, action) => {
        state.status = FAILED;
        state.error = action.payload?.message || 'Failed to create simulation';
      });
  },
});

export const { clearAddSimulationState } = addSimulationSlice.actions;
export default addSimulationSlice.reducer;

const selectAddSimState = (state: RootState) => state.AddSimulation;

export const selectAddSimLoading = createSelector(
  selectAddSimState,
  (s) => s?.status === LOADING
);

export const selectAddSimSuccess = createSelector(
  selectAddSimState,
  (s) => s?.status === SUCCEEDED
);

export const selectAddSimError = createSelector(
  selectAddSimState,
  (s) => s?.error
);

export const selectAddSimResponse = createSelector(
  selectAddSimState,
  (s) => s?.response
);

const selectUnitSimState = (state: RootState) => state.SimulationsByUnit;

export const selectUnitSimulations = createSelector(
  selectUnitSimState,
  (s) => s?.simulations
);

export const selectUnitSimLoading = createSelector(
  selectUnitSimState,
  (s) => s?.status === LOADING
);
