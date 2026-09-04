import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import type { RootState } from '../../store';
import { FAILED, IDLE, LOADING, SUCCEEDED } from '../../utils/constants';
import Config from '../config';
import type { SimulationsState, SimulationItem, SimulationApiResponse } from '../../types/index';
import api from '../api';

const initialState: SimulationsState = {
  simulationsByClass: {},
  status: IDLE,
  error: null,
};

export const FetchSimulationsByClass = createAsyncThunk(
  'simulations/getByClass',
  async ({ classId }: { classId: string }, thunkAPI) => {
    try {
      const res = await api.get(`${Config.GetSimulationApi}/${classId}`, {
        headers: {
          'ngrok-skip-browser-warning': 'true',
        },
      });
      const rawData = Array.isArray(res.data?.data)
        ? res.data.data
        : Array.isArray(res.data)
          ? res.data
          : [];
      const simulations: SimulationItem[] = (rawData as SimulationApiResponse[]).map((sim) => ({
        id: sim.id,
        simulation_id: sim.simulation_id ?? '',
        simulation_title: sim.simulation_title ?? sim.simulation?.title ?? '',
        simulation_lib_name: sim.simulation?.libraryItem?.name ?? sim.simulation_title ?? '',
        unit: sim.unit_id ?? sim.simulation?.unit_id ?? sim.simulation?.unit ?? '',
        unit_name: sim.unit_name ?? sim.simulation?.unit ?? '',
        start_date: sim.start_date ?? '',
        due_date: sim.due_date ?? '',
        end_date: sim.end_date ?? '',
        class_id: sim.class_id ?? classId,
        class_name: '',
        user_id: '',
        image_url: sim.simulation?.image_url ?? '',
        created_at: sim.created_at ?? '',
        email: '',
        avatarEnabled: ((sim as unknown as Record<string, unknown>).avatarEnabled as boolean | undefined) ?? undefined,
        scenario_status: sim.scenario_status ?? null,
      }));

      return { classId, data: simulations };
    } catch (err) {
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
  },
);

const SimulationsSlice = createSlice({
  name: 'GetSimulations',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(FetchSimulationsByClass.pending, (state) => {
        state.status = LOADING;
      })
      .addCase(FetchSimulationsByClass.fulfilled, (state, action) => {
        state.status = SUCCEEDED;

        state.simulationsByClass[action.payload.classId] = action.payload.data;
      })
      .addCase(FetchSimulationsByClass.rejected, (state) => {
        state.status = FAILED;
      });
  },
});
export const selectSimulationsByClassId = (classId: string) => (state: RootState) =>
  classId in state.GetSimsList.simulationsByClass
    ? state.GetSimsList.simulationsByClass[classId]
    : null;

export default SimulationsSlice.reducer;
