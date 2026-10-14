import {
  createAsyncThunk,
  createSelector,
  createSlice,
} from '@reduxjs/toolkit';
import type { RootState } from '../../../store';
import { FAILED, IDLE, LOADING, SUCCEEDED } from '../../../utils/constants';
import config from '../../config';
import api from '@/redux/api';

import { parseAvatarEnabled } from '../../../utils/simulationType';
import { sanitizeCategory } from '../../../utils/normalizeSectionItem';
import { sanitizeDuration } from '../../../utils/sanitizeDuration';

type GroupedUnit = {
  id: string;
  unit_id: string;
  name: string;
  imageURL: string;
  category: string;
  simulations: Array<Record<string, unknown>>;
};

/** Reads a scenario's required product name, wherever the BE puts it. */
export const readProductName = (sim: Record<string, unknown>): string => {
  const setup = sim.productSetup as { title?: unknown } | undefined;
  return String(
    setup?.title ?? sim.productName ?? sim.product_name ?? ''
  ).trim();
};

export interface Simulation {
  simulation_id: string;
  id: string;
  name: string;
  title: string;
  unit: string;
  unit_name: string;
  duration: string;
  image: string;
  description: string;
  assigned: boolean;
  rating: number;
  difficulty: string;
  learnerLevel: string;
  targetAudience?: string;
  learningObjectives?: string[];
  topicsAddressed?: string;
  clinicalSetting?: string;
  /** Required product, from the scenario's `productSetup.title`. */
  productName?: string;
  fromBundle?: boolean;
  avatarEnabled?: boolean;
  end_date?: string;
  start_date?: string;
}

export interface ResponseSimulationLibrary {
  data: Simulation[];
  message: string;
  status: string;
}

export interface SimulationLibraryState {
  responseSimulationLibrary: ResponseSimulationLibrary | null;
  /** False when the loaded library skipped the image lookup (see `skipImages`). */
  hasImages: boolean;
  status: 'idle' | 'loading' | 'succeeded' | 'failed';
  error: string | null;
  /** The load in flight; an answer to any other (e.g. from before a reset) is dropped. */
  requestId?: string;
}

const initialState: SimulationLibraryState = {
  responseSimulationLibrary: null,
  hasImages: false,
  status: IDLE,
  error: null,
};

export interface FetchMyLibraryOptions {
  /**
   * Skips filling missing images from the catalogue (two extra, large
   * requests), for screens that don't show images.
   */
  skipImages?: boolean;
}

export const fetchMyLibrarySimulations = createAsyncThunk<
  ResponseSimulationLibrary,
  FetchMyLibraryOptions | void,
  { rejectValue: { message: string }; state: RootState }
>('dashboard/fetchMyLibrarySimulations', async (options, thunkAPI) => {
  try {
    const ls =
      localStorage.getItem('app_language')?.toLowerCase() === 'es'
        ? 'es'
        : 'en';
    const res = await api.get(config.MyLibraryAPI, {
      headers: { 'ngrok-skip-browser-warning': 'true' },
      params: { ls },
    });
    const rawData = res.data?.data ?? res.data ?? [];
    const raw: Record<string, unknown>[] = Array.isArray(rawData)
      ? rawData
      : [];

    let flat: Simulation[] = [];

    if (raw.length > 0 && 'educator_id' in (raw[0] as object)) {
      const grouped = new Map<
        string,
        { unit: Record<string, unknown>; sims: Record<string, unknown>[] }
      >();
      for (const row of raw) {
        const unitId = String(row.unit_id ?? '');
        if (!grouped.has(unitId)) {
          grouped.set(unitId, {
            unit: (row.unit ?? {}) as Record<string, unknown>,
            sims: [],
          });
        }
        grouped.get(unitId)!.sims.push(row);
      }
      flat = Array.from(grouped.entries()).flatMap(([unitId, { unit, sims }]) =>
        sims
          .filter((row) => row.scenario_id != null)
          .map((row) => {
            const sim = (row.scenario ?? row.simulation ?? {}) as Record<
              string,
              unknown
            >;
            const title = String(
              sim.title ?? sim.name ?? row.title ?? row.name ?? ''
            );
            const difficulty = String(sim.difficulty ?? row.difficulty ?? '');
            const learnerLevel = String(
              sim.learnerLevel ??
                sim.learner_level ??
                row.learnerLevel ??
                row.learner_level ??
                ''
            );
            const description = String(
              sim.description ?? row.description ?? ''
            );
            const duration = sanitizeDuration(
              sim.duration ??
                sim.estimatedDuration ??
                sim.estimated_duration ??
                (sim.studentBriefing as Record<string, unknown> | undefined)
                  ?.timeAllotment ??
                ''
            );
            const learningObjectivesRaw =
              (sim.learningObjectives as unknown) ??
              (sim.learning_objectives as unknown) ??
              (sim.learningObjective as unknown);
            const learningObjectives = Array.isArray(learningObjectivesRaw)
              ? learningObjectivesRaw.filter(
                  (v): v is string =>
                    typeof v === 'string' && v.trim().length > 0
                )
              : typeof learningObjectivesRaw === 'string' &&
                  learningObjectivesRaw.trim().length > 0
                ? learningObjectivesRaw
                    .split(/\n|\|\|/)
                    .map((v) => v.trim())
                    .filter(Boolean)
                : [];
            return {
              id: String(row.scenario_id ?? row.id ?? ''),
              simulation_id: String(row.scenario_id ?? row.id ?? ''),
              name: title,
              title,
              unit: unitId,
              unit_name: String(
                unit.name ??
                  unit.title ??
                  unit.unitName ??
                  unit.unit_name ??
                  (row as Record<string, unknown>).unit_name ??
                  ''
              ),
              duration,
              image: String(
                sim.scenarioImage ??
                  sim.scenario_image ??
                  sim.imageUrl ??
                  sim.imageURL ??
                  sim.image_url ??
                  sim.image ??
                  row.imageUrl ??
                  row.imageURL ??
                  row.image_url ??
                  row.image ??
                  row.cover_image ??
                  row.coverImage ??
                  row.thumbnail ??
                  row.blob_url ??
                  unit.imageUrl ??
                  unit.imageURL ??
                  unit.image_url ??
                  unit.image ??
                  ''
              ),
              description,
              assigned: false,
              rating: 0,
              difficulty,
              learnerLevel,
              targetAudience: learnerLevel,
              learningObjectives,
              topicsAddressed: String(
                sim.topicsAddressed ?? sim.topics_addressed ?? ''
              ),
              clinicalSetting: sanitizeCategory(
                sim.department ??
                  sim.clinicalSetting ??
                  sim.clinical_location ??
                  ''
              ),
              avatarEnabled: parseAvatarEnabled(sim.avatarEnabled),
              productName: readProductName(sim),
            };
          })
      );
    } else {
      flat = (raw as unknown as GroupedUnit[]).flatMap((unit) =>
        (unit.simulations ?? [])
          .filter(
            (sim) => sim.scenario_id != null && (sim.title ?? sim.name) != null
          )
          .map((sim) => ({
            id: String(sim.id ?? sim.scenario_id ?? ''),
            simulation_id: String(sim.id ?? sim.scenario_id ?? ''),
            name: String(sim.title ?? sim.name ?? ''),
            title: String(sim.title ?? sim.name ?? ''),
            unit: unit.unit_id ?? '',
            unit_name: unit.name ?? '',
            duration: sanitizeDuration(
              sim.duration ??
                sim.estimatedDuration ??
                sim.estimated_duration ??
                (sim.studentBriefing as Record<string, unknown> | undefined)
                  ?.timeAllotment ??
                ''
            ),
            image: String(
              sim.scenarioImage ??
                sim.scenario_image ??
                sim.imageUrl ??
                sim.imageURL ??
                sim.image_url ??
                sim.image ??
                sim.cover_image ??
                sim.coverImage ??
                sim.thumbnail ??
                (unit as unknown as Record<string, unknown>).imageUrl ??
                unit.imageURL ??
                (unit as unknown as Record<string, unknown>).image_url ??
                (unit as unknown as Record<string, unknown>).image ??
                ''
            ),
            description: String(sim.description ?? ''),
            assigned: false,
            rating: 0,
            difficulty: String(sim.difficulty ?? ''),
            learnerLevel: String(sim.learnerLevel ?? sim.learner_level ?? ''),
            targetAudience: String(sim.learnerLevel ?? sim.learner_level ?? ''),
            learningObjectives: Array.isArray(sim.learningObjectives)
              ? (sim.learningObjectives as string[]).filter(
                  (v) => typeof v === 'string' && v.trim().length > 0
                )
              : typeof sim.learningObjective === 'string' &&
                  sim.learningObjective.trim().length > 0
                ? sim.learningObjective
                    .split(/\n|\|\|/)
                    .map((v) => v.trim())
                    .filter(Boolean)
                : [],
            topicsAddressed: String(
              sim.topicsAddressed ?? sim.topics_addressed ?? ''
            ),
            clinicalSetting: sanitizeCategory(
              sim.department ??
                sim.clinicalSetting ??
                sim.clinical_location ??
                ''
            ),
            avatarEnabled: parseAvatarEnabled(sim.avatarEnabled),
            productName: readProductName(sim),
          }))
      );
    }

    const simsNeedingImage = flat.filter((s) => !s.image);
    if (!options?.skipImages && simsNeedingImage.length > 0) {
      const titleToImage = new Map<string, string>();

      const rootState = thunkAPI.getState() as RootState;
      const catalogData = rootState.simulationCatalog?.catalogData;

      if (catalogData?.sections?.length) {
        for (const section of catalogData.sections) {
          for (const item of section.items ?? []) {
            const t = item.title?.trim().toLowerCase();
            if (t && item.image && !titleToImage.has(t))
              titleToImage.set(t, item.image);
          }
        }
      }

      if (titleToImage.size === 0) {
        const headers = { 'ngrok-skip-browser-warning': 'true' };
        const extractImg = (item: Record<string, unknown>): string =>
          String(
            item.scenarioImage ??
              item.scenario_image ??
              item.image_url ??
              item.imageUrl ??
              item.imageURL ??
              item.image ??
              item.cover_image ??
              item.coverImage ??
              item.blob_url ??
              item.blobUrl ??
              item.thumbnail ??
              item.unit_image ??
              ''
          );

        const [scenariosRes, detailRes] = await Promise.allSettled([
          api.get(config.SimulationCatalogScenariosAPI, { headers }),
          api.get(config.SimulationCatalogDetailAPI, { headers }),
        ]);

        if (scenariosRes.status === 'fulfilled') {
          const arr = (scenariosRes.value.data?.data ??
            scenariosRes.value.data ??
            []) as Record<string, unknown>[];
          for (const item of arr) {
            const t = String(item.title ?? item.name ?? '')
              .trim()
              .toLowerCase();
            const img = extractImg(item);
            if (t && img && !titleToImage.has(t)) titleToImage.set(t, img);
          }
        }

        if (detailRes.status === 'fulfilled') {
          const rawAll = detailRes.value.data?.data ?? detailRes.value.data;
          const addItem = (item: Record<string, unknown>, unitImg?: string) => {
            const t = String(item.title ?? item.name ?? '')
              .trim()
              .toLowerCase();
            const img = extractImg(item) || unitImg || '';
            if (t && img && !titleToImage.has(t)) titleToImage.set(t, img);
          };
          if (Array.isArray(rawAll)) {
            for (const entry of rawAll as Record<string, unknown>[]) {
              const unitImg = String(
                entry.imageUrl ?? entry.image_url ?? entry.image ?? ''
              );
              const nested = Array.isArray(entry.scenarios)
                ? (entry.scenarios as Record<string, unknown>[])
                : Array.isArray(entry.items)
                  ? (entry.items as Record<string, unknown>[])
                  : null;
              if (nested) {
                for (const sim of nested) addItem(sim, unitImg);
              } else {
                addItem(entry);
              }
            }
          }
        }
      }

      flat = flat.map((sim) => {
        if (sim.image) return sim;
        const img = titleToImage.get(sim.title.trim().toLowerCase()) ?? '';
        return img ? { ...sim, image: img } : sim;
      });
    }

    return { status: 'SUCCESS', message: '', data: flat };
  } catch (err: unknown) {
    const error = err as {
      response?: { status: number; data?: { message?: string } };
    };
    return thunkAPI.rejectWithValue({
      message: error.response?.data?.message || 'Failed to fetch library',
    });
  }
});

const SimulationLibrarySlice = createSlice({
  name: 'dashboard/simulationLibrary',
  initialState,
  // Filtering, search, sort and view mode live on the page (URL + local
  // state); this slice only holds the server response.
  reducers: {
    clearSimulationLibraryState(state) {
      state.responseSimulationLibrary = null;
      state.hasImages = false;
      state.status = IDLE;
      state.error = null;
      state.requestId = undefined;
    },
  },

  extraReducers: (builder) => {
    builder.addCase(fetchMyLibrarySimulations.pending, (state, action) => {
      state.status = LOADING;
      state.error = null;
      state.requestId = action.meta.requestId;
    });
    // Only the latest load's answer counts: one started before the library
    // was cleared (a change, or a logout) holds data that no longer applies.
    builder.addCase(fetchMyLibrarySimulations.fulfilled, (state, action) => {
      if (action.meta.requestId !== state.requestId) return;
      state.requestId = undefined;
      state.status = SUCCEEDED;
      state.responseSimulationLibrary = action.payload;
      state.hasImages = !action.meta.arg?.skipImages;
    });
    builder.addCase(fetchMyLibrarySimulations.rejected, (state, action) => {
      if (action.meta.requestId !== state.requestId) return;
      state.requestId = undefined;
      state.status = FAILED;
      state.error =
        (action.payload as { message?: string })?.message ||
        'Failed to fetch library';
    });
  },
});

export const { clearSimulationLibraryState } = SimulationLibrarySlice.actions;

export default SimulationLibrarySlice.reducer;

const selectState = (state: RootState) => state.SimulationLibrary;

export const selectSimulationLibraryData = createSelector(
  selectState,
  (state) => state.responseSimulationLibrary?.data ?? []
);

export const selectSimulationLibraryHasImages = createSelector(
  selectState,
  (state) => state.hasImages
);

export const selectSimulationLoading = createSelector(
  selectState,
  (state) => state.status === LOADING
);

export const selectSimulationError = createSelector(
  selectState,
  (state) => state.error
);

export const selectSimulationLibraryStatus = createSelector(
  selectState,
  (state) => state.status
);
