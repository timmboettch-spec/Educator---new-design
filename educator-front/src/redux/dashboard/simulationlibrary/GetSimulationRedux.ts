import type { PayloadAction } from "@reduxjs/toolkit";
import {
  createAsyncThunk,
  createSelector,
  createSlice,
} from "@reduxjs/toolkit";
import type { RootState } from "../../../store";
import { FAILED, IDLE, LOADING, SUCCEEDED } from "../../../utils/constants";
import config from "../../config";
import { matchDurationFilter } from "@/utils/helpers/matchDurationFilter";
import api from "@/redux/api";

import { parseAvatarEnabled } from "../../../utils/simulationType";
import { sanitizeCategory } from "../../../utils/normalizeSectionItem";

export type FilterType = "All" | "Recently Used" | "Recently Added";
export type ViewMode = "grid" | "list";

type GroupedUnit = {
  id: string;
  unit_id: string;
  name: string;
  imageURL: string;
  category: string;
  simulations: Array<Record<string, unknown>>;
};

const sanitizeDuration = (value: unknown): string => {
  const raw = String(value ?? "").trim();
  if (!raw) return "";

  // Keep concise duration values as-is.
  if (raw.length <= 30 && /min|hour|hr/i.test(raw)) return raw;

  // Extract ranges like "15-20 minutes" from sentence-like content.
  const rangeMatch = raw.match(
    /(\d+\s*(?:-|to)\s*\d+\s*(?:minutes?|mins?|hours?|hrs?))/i,
  );
  if (rangeMatch?.[1]) {
    return rangeMatch[1]
      .replace(/\s+to\s+/i, "-")
      .replace(/\s+/g, " ")
      .trim();
  }

  // Extract single values like "20 minutes".
  const singleMatch = raw.match(/(\d+\s*(?:minutes?|mins?|hours?|hrs?))/i);
  if (singleMatch?.[1]) return singleMatch[1].replace(/\s+/g, " ").trim();

  // If no clear duration token is present, suppress noisy sentence text.
  return "";
};

export interface FilterValues {
  product: string;
  topic: string;
  unit: string;
  learnerLevel: string;
  difficulty: string;
  duration: string;
}

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
  status: "idle" | "loading" | "succeeded" | "failed";
  error: string | null;
  viewMode: ViewMode;
  activeFilter: FilterType;
  panelFilteredSimulations: Simulation[] | null;
  appliedFilters: FilterValues;
}

const initialState: SimulationLibraryState = {
  responseSimulationLibrary: null,
  status: IDLE,
  error: null,
  viewMode: "grid",
  activeFilter: "All",
  panelFilteredSimulations: null,
  appliedFilters: {
    product: "",
    topic: "",
    unit: "",
    learnerLevel: "",
    difficulty: "",
    duration: "",
  },
};

export const fetchMyLibrarySimulations = createAsyncThunk<
  ResponseSimulationLibrary,
  void,
  { rejectValue: { message: string }; state: RootState }
>("dashboard/fetchMyLibrarySimulations", async (_, thunkAPI) => {
  try {
    const ls =
      localStorage.getItem("app_language")?.toLowerCase() === "es"
        ? "es"
        : "en";
    const res = await api.get(config.MyLibraryAPI, {
      headers: { "ngrok-skip-browser-warning": "true" },
      params: { ls },
    });
    const rawData = res.data?.data ?? res.data ?? [];
    const raw: Record<string, unknown>[] = Array.isArray(rawData)
      ? rawData
      : [];

    let flat: Simulation[] = [];

    if (raw.length > 0 && "educator_id" in (raw[0] as object)) {
      const grouped = new Map<
        string,
        { unit: Record<string, unknown>; sims: Record<string, unknown>[] }
      >();
      for (const row of raw) {
        const unitId = String(row.unit_id ?? "");
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
              sim.title ?? sim.name ?? row.title ?? row.name ?? "",
            );
            const difficulty = String(sim.difficulty ?? row.difficulty ?? "");
            const learnerLevel = String(
              sim.learnerLevel ??
                sim.learner_level ??
                row.learnerLevel ??
                row.learner_level ??
                "",
            );
            const description = String(
              sim.description ?? row.description ?? "",
            );
            const duration = sanitizeDuration(
              sim.duration ??
                sim.estimatedDuration ??
                sim.estimated_duration ??
                (sim.studentBriefing as Record<string, unknown> | undefined)
                  ?.timeAllotment ??
                "",
            );
            const learningObjectivesRaw =
              (sim.learningObjectives as unknown) ??
              (sim.learning_objectives as unknown) ??
              (sim.learningObjective as unknown);
            const learningObjectives = Array.isArray(learningObjectivesRaw)
              ? learningObjectivesRaw.filter(
                  (v): v is string =>
                    typeof v === "string" && v.trim().length > 0,
                )
              : typeof learningObjectivesRaw === "string" &&
                  learningObjectivesRaw.trim().length > 0
                ? learningObjectivesRaw
                    .split(/\n|\|\|/)
                    .map((v) => v.trim())
                    .filter(Boolean)
                : [];
            return {
              id: String(row.scenario_id ?? row.id ?? ""),
              simulation_id: String(row.scenario_id ?? row.id ?? ""),
              name: title,
              title,
              unit: unitId,
              unit_name: String(
                unit.name ??
                  unit.title ??
                  unit.unitName ??
                  unit.unit_name ??
                  (row as Record<string, unknown>).unit_name ??
                  "",
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
                  "",
              ),
              description,
              assigned: false,
              rating: 0,
              difficulty,
              learnerLevel,
              targetAudience: learnerLevel,
              learningObjectives,
              topicsAddressed: String(
                sim.topicsAddressed ?? sim.topics_addressed ?? "",
              ),
              clinicalSetting: sanitizeCategory(
                sim.department ??
                  sim.clinicalSetting ??
                  sim.clinical_location ??
                  "",
              ),
              avatarEnabled: parseAvatarEnabled(sim.avatarEnabled),
            };
          }),
      );
    } else {
      flat = (raw as unknown as GroupedUnit[]).flatMap((unit) =>
        (unit.simulations ?? [])
          .filter(
            (sim) => sim.scenario_id != null && (sim.title ?? sim.name) != null,
          )
          .map((sim) => ({
            id: String(sim.id ?? sim.scenario_id ?? ""),
            simulation_id: String(sim.id ?? sim.scenario_id ?? ""),
            name: String(sim.title ?? sim.name ?? ""),
            title: String(sim.title ?? sim.name ?? ""),
            unit: unit.unit_id ?? "",
            unit_name: unit.name ?? "",
            duration: sanitizeDuration(
              sim.duration ??
                sim.estimatedDuration ??
                sim.estimated_duration ??
                (sim.studentBriefing as Record<string, unknown> | undefined)
                  ?.timeAllotment ??
                "",
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
                "",
            ),
            description: String(sim.description ?? ""),
            assigned: false,
            rating: 0,
            difficulty: String(sim.difficulty ?? ""),
            learnerLevel: String(sim.learnerLevel ?? sim.learner_level ?? ""),
            targetAudience: String(sim.learnerLevel ?? sim.learner_level ?? ""),
            learningObjectives: Array.isArray(sim.learningObjectives)
              ? (sim.learningObjectives as string[]).filter(
                  (v) => typeof v === "string" && v.trim().length > 0,
                )
              : typeof sim.learningObjective === "string" &&
                  sim.learningObjective.trim().length > 0
                ? sim.learningObjective
                    .split(/\n|\|\|/)
                    .map((v) => v.trim())
                    .filter(Boolean)
                : [],
            topicsAddressed: String(
              sim.topicsAddressed ?? sim.topics_addressed ?? "",
            ),
            clinicalSetting: sanitizeCategory(
              sim.department ??
                sim.clinicalSetting ??
                sim.clinical_location ??
                "",
            ),
            avatarEnabled: parseAvatarEnabled(sim.avatarEnabled),
          })),
      );
    }

    const simsNeedingImage = flat.filter((s) => !s.image);
    if (simsNeedingImage.length > 0) {
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
        const headers = { "ngrok-skip-browser-warning": "true" };
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
              "",
          );

        const [scenariosRes, detailRes] = await Promise.allSettled([
          api.get(config.SimulationCatalogScenariosAPI, { headers }),
          api.get(config.SimulationCatalogDetailAPI, { headers }),
        ]);

        if (scenariosRes.status === "fulfilled") {
          const arr = (scenariosRes.value.data?.data ??
            scenariosRes.value.data ??
            []) as Record<string, unknown>[];
          for (const item of arr) {
            const t = String(item.title ?? item.name ?? "")
              .trim()
              .toLowerCase();
            const img = extractImg(item);
            if (t && img && !titleToImage.has(t)) titleToImage.set(t, img);
          }
        }

        if (detailRes.status === "fulfilled") {
          const rawAll = detailRes.value.data?.data ?? detailRes.value.data;
          const addItem = (item: Record<string, unknown>, unitImg?: string) => {
            const t = String(item.title ?? item.name ?? "")
              .trim()
              .toLowerCase();
            const img = extractImg(item) || unitImg || "";
            if (t && img && !titleToImage.has(t)) titleToImage.set(t, img);
          };
          if (Array.isArray(rawAll)) {
            for (const entry of rawAll as Record<string, unknown>[]) {
              const unitImg = String(
                entry.imageUrl ?? entry.image_url ?? entry.image ?? "",
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
        const img = titleToImage.get(sim.title.trim().toLowerCase()) ?? "";
        return img ? { ...sim, image: img } : sim;
      });
    }

    return { status: "SUCCESS", message: "", data: flat };
  } catch (err: unknown) {
    const error = err as {
      response?: { status: number; data?: { message?: string } };
    };
    return thunkAPI.rejectWithValue({
      message: error.response?.data?.message || "Failed to fetch library",
    });
  }
});

const SimulationLibrarySlice = createSlice({
  name: "dashboard/simulationLibrary",
  initialState,
  reducers: {
    setActiveFilter(state, action: PayloadAction<FilterType>) {
      state.activeFilter = action.payload;
    },
    clearSimulationLibraryState(state) {
      state.responseSimulationLibrary = null;
      state.status = IDLE;
      state.error = null;
      state.panelFilteredSimulations = null;
      state.appliedFilters = {
        product: "",
        topic: "",
        unit: "",
        learnerLevel: "",
        difficulty: "",
        duration: "",
      };
    },

    applyPanelFilter(state, action: PayloadAction<FilterValues>) {
      const { product, topic, unit, learnerLevel, difficulty, duration } =
        action.payload;
      const allSimulations = state.responseSimulationLibrary?.data ?? [];

      const normalize = (v: string) => v.trim().toLowerCase();

      const hasFilter =
        product || topic || unit || learnerLevel || difficulty || duration;
      if (!hasFilter) {
        state.panelFilteredSimulations = null;
        state.appliedFilters = {
          product: "",
          topic: "",
          unit: "",
          learnerLevel: "",
          difficulty: "",
          duration: "",
        };
        return;
      }

      // Store applied filters
      state.appliedFilters = action.payload;

      state.panelFilteredSimulations = allSimulations.filter((sim) => {
        // Product and topic filters removed - category no longer sourced from units
        const matchUnit = unit ? normalize(sim.unit) === normalize(unit) : true;
        const matchLearnerLevel = learnerLevel
          ? normalize(sim.learnerLevel) === normalize(learnerLevel)
          : true;
        const matchDifficulty = difficulty
          ? normalize(sim.difficulty) === normalize(difficulty)
          : true;
        const matchDuration = duration
          ? matchDurationFilter(sim.duration, duration)
          : true;
        return (
          matchUnit &&
          matchLearnerLevel &&
          matchDifficulty &&
          matchDuration
        );
      });
    },

    clearPanelFilter(state) {
      state.panelFilteredSimulations = null;
      state.appliedFilters = {
        product: "",
        topic: "",
        unit: "",
        learnerLevel: "",
        difficulty: "",
        duration: "",
      };
    },

    removeFilter(state, action: PayloadAction<keyof FilterValues>) {
      const filterKey = action.payload;
      
      // Update applied filters
      state.appliedFilters = {
        ...state.appliedFilters,
        [filterKey]: "",
      };

      // Reapply filters with the updated values
      const { product, topic, unit, learnerLevel, difficulty, duration } = state.appliedFilters;
      const allSimulations = state.responseSimulationLibrary?.data ?? [];
      const normalize = (v: string) => v.trim().toLowerCase();

      const hasFilter =
        product || topic || unit || learnerLevel || difficulty || duration;
      
      if (!hasFilter) {
        state.panelFilteredSimulations = null;
        return;
      }

      state.panelFilteredSimulations = allSimulations.filter((sim) => {
        const matchUnit = unit ? normalize(sim.unit) === normalize(unit) : true;
        const matchLearnerLevel = learnerLevel
          ? normalize(sim.learnerLevel) === normalize(learnerLevel)
          : true;
        const matchDifficulty = difficulty
          ? normalize(sim.difficulty) === normalize(difficulty)
          : true;
        const matchDuration = duration
          ? matchDurationFilter(sim.duration, duration)
          : true;
        return (
          matchUnit &&
          matchLearnerLevel &&
          matchDifficulty &&
          matchDuration
        );
      });
    },
  },

  extraReducers: (builder) => {
    builder.addCase(fetchMyLibrarySimulations.pending, (state) => {
      state.status = LOADING;
      state.error = null;
    });
    builder.addCase(fetchMyLibrarySimulations.fulfilled, (state, action) => {
      state.status = SUCCEEDED;
      state.responseSimulationLibrary = action.payload;
    });
    builder.addCase(fetchMyLibrarySimulations.rejected, (state, action) => {
      state.status = FAILED;
      state.error =
        (action.payload as { message?: string })?.message ||
        "Failed to fetch library";
    });
  },
});

export const {
  setActiveFilter,
  clearSimulationLibraryState,
  applyPanelFilter,
  clearPanelFilter,
  removeFilter,
} = SimulationLibrarySlice.actions;

export default SimulationLibrarySlice.reducer;

const selectState = (state: RootState) => state.SimulationLibrary;

export const selectSimulationLibraryData = createSelector(
  selectState,
  (state) => state.responseSimulationLibrary?.data ?? [],
);

export const selectSimulationLoading = createSelector(
  selectState,
  (state) => state.status === LOADING,
);

export const selectSimulationError = createSelector(
  selectState,
  (state) => state.error,
);

export const selectViewMode = createSelector(
  selectState,
  (state) => state.viewMode,
);

export const selectActiveFilter = createSelector(
  selectState,
  (state) => state.activeFilter,
);

export const selectAppliedFilters = createSelector(
  selectState,
  (state) => state.appliedFilters,
);

export const selectFilteredSimulations = createSelector(
  [
    selectSimulationLibraryData,
    selectActiveFilter,
    (state: RootState) => state.SimulationLibrary.panelFilteredSimulations,
  ],
  (simulations, filter, panelFiltered) => {
    if (panelFiltered !== null) return panelFiltered;
    if (!simulations) return [];
    switch (filter) {
      case "Recently Used":
        return simulations.slice(0, 5);
      case "Recently Added":
        return [...simulations].reverse();
      default:
        return simulations;
    }
  },
);
