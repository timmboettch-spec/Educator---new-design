import {
  createAsyncThunk,
  createSelector,
  createSlice,
} from "@reduxjs/toolkit";
import type { RootState } from "../../store";
import { FAILED, IDLE, LOADING, SUCCEEDED } from "../../utils/constants";
import config from "../config";
import api from "../api";

export interface ProductSimBundlePayload {
  bundle_name: string;
}

export interface BundleSimulation {
  scenario_id: string;
  title: string;
}

export interface BundleData {
  unit_id: string;
  simulations: BundleSimulation[];
}

export interface ProductSimBundleResponse {
  data: BundleData;
  message: string;
  status: string;
}

export interface ProductSimBundleState {
  response: ProductSimBundleResponse | null;
  status: "idle" | "loading" | "succeeded" | "failed";
  error: string | null;
}

const initialState: ProductSimBundleState = {
  response: null,
  status: IDLE,
  error: null,
};

export const ProductSimBundleRequest = createAsyncThunk<
  ProductSimBundleResponse,
  ProductSimBundlePayload,
  { rejectValue: { message: string } }
>("ProductSimBundle", async ({ bundle_name }, thunkAPI) => {
  try {
    const url = `${config.ProductAPI}/${bundle_name}`;
    const res = await api.get(url, {
      headers: {
        "ngrok-skip-browser-warning": "true"
      },
    });
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
      message: error.response?.data?.message || "Patch School failed",
    });
  }
});

// Slice
const ProductSimBundleSlice = createSlice({
  name: "ProductSimBundle",
  initialState,
  reducers: {
    resetProductSimBundle(state) {
      state.response = null;
      state.status = IDLE;
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder.addCase(ProductSimBundleRequest.pending, (state) => {
      state.status = LOADING;
      state.error = null;
    });

    builder.addCase(ProductSimBundleRequest.fulfilled, (state, action) => {
      state.status = SUCCEEDED;
      state.response = action.payload;
    });

    builder.addCase(ProductSimBundleRequest.rejected, (state, action) => {
      state.status = FAILED;
      state.error = action.payload?.message || "Patch School failed";
    });
  },
});

export const { resetProductSimBundle } = ProductSimBundleSlice.actions;
export default ProductSimBundleSlice.reducer;

// Selectors
const selectState = (state: RootState) => state.ProductSimBundle;

export const selectProductSimBundleResponse = createSelector(
  selectState,
  (state) => state.response,
);

export const selectProductSimBundleStatus = createSelector(
  selectState,
  (state) => state.status,
);

export const selectProductSimBundleError = createSelector(
  selectState,
  (state) => state.error,
);
