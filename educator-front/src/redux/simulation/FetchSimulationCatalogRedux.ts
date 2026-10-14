import {
  createAsyncThunk,
  createSlice,
  type PayloadAction,
} from '@reduxjs/toolkit';
import config from '../config';
import type { RootState } from '../../store';
import api from '../api';
import { parseAvatarEnabled } from '../../utils/simulationType';
import { readProductName } from '../dashboard/simulationlibrary/GetSimulationRedux';
import {
  EMPTY_LIBRARY_FILTERS,
  type LibraryFilters,
} from '../../utils/libraryFilters';

export interface BrowseByItem {
  id: number;
  title: string;
  description: string;
  duration: string;
  image: string;
  cta: string;
  unit?: string;
}

export interface SectionItem {
  id: number;
  scenarioId?: string;
  myFavorite?: boolean;
  title: string;
  image: string;
  cta: string;
  highlight?: boolean;
  rating?: number;
  unit?: string;
  unit_name?: string;
  targetAudience?: string[];
  duration?: string;
  difficulty?: string;
  clinicalLocation?: string;
  purpose?: string;
  description?: string;
  images?: string[];
  category?: string;
  language?: string;
  subtitle?: string;
  developer?: string;
  institution?: string;
  last_update?: string;
  status?: string;
  learning_objectives?: string[];
  learnerLevel?: string;
  avatarEnabled?: boolean;
  productName?: string;
}

export interface BannerData {
  title: string;
  subtitle: string;
  image: string;
}

export interface FilterField {
  key: string;
  label: string;
  options: string[];
}

export interface Section {
  key: string;
  title: string;
  type: 'carousel' | 'grid' | 'mixed';
  viewAll?: boolean;
  items: SectionItem[];
}

export interface CatalogData {
  banner: BannerData;
  filters: {
    fields: FilterField[];
  };
  browseBy: {
    filters: { id: string; label: string; active: boolean }[];
    items: BrowseByItem[];
  };
  sections: Section[];
}

interface CatalogFavoriteItem {
  scenarioId?: string;
  scenario_id?: string;
  myFavorite?: boolean;
}

interface ScenarioPayloadItem extends Record<string, unknown> {
  scenarioId?: string;
  scenario_id?: string;
  id?: string | number;
  myFavorite?: boolean;
}

export interface SimulationDetail {
  id: number;
  title: string;
  subtitle?: string;
  scenarioImage?: string;
  image_url?: string;
  images?: string[];
  usage?: string;
  unit?: string;
  category?: string;
  targetAudience?: string[];
  language?: string;
  tries_left?: number;
  purpose?: string;
  description?: string;
  learning_objectives?: string[];
  difficultyLevel?: string;
  estimatedDuration?: string;
  whats_new?: { version: string; timeAgo: string; notes: string };
  simulation_privacy?: string;
  developer?: string;
  institution?: string;
  last_update?: string;
  department?: string;
  learnerLevel?: string;
  learningObjective?: string;
  topicsAddressed?: string;
  productName?: string;
  additionalEquipment?: string;
  optionalEquipment?: string;
  setupNotes?: string;
  prebriefScriptPdf?: string;
  debriefPointsPdf?: string;
  setupNotesPdf?: string;
  facilitationNotesPdf?: string;
  printableSbarPdf?: string;
  printablePatientChartPdf?: string;
}

/** Applied catalogue filters: the same multi-select fields as the library. */
export type CatalogFilters = LibraryFilters;

interface SimulationCatalogState {
  catalogData: CatalogData | null;
  loading: boolean;
  error: string | null;
  selectedItem: SimulationDetail | null;
  detailLoading: boolean;
  detailError: string | null;
  scenarioImageBlobUrl: string | null;
  scenarioImageBlobLoading: boolean;
  appliedFilters: CatalogFilters;
}

const initialState: SimulationCatalogState = {
  catalogData: null,
  loading: false,
  error: null,
  selectedItem: null,
  detailLoading: false,
  detailError: null,
  scenarioImageBlobUrl: null,
  scenarioImageBlobLoading: false,
  appliedFilters: EMPTY_LIBRARY_FILTERS,
};

const toStr = (v: unknown): string => (v == null ? '' : String(v));
const toOptStr = (v: unknown): string | undefined =>
  v == null || v === '' ? undefined : String(v);

const normalizeSectionItem = (item: Record<string, unknown>): SectionItem => ({
  ...(item as Partial<SectionItem>),
  myFavorite: Boolean(item.myFavorite),
  id: Number.isFinite(Number(item.id)) ? Number(item.id) : 0,
  scenarioId: toOptStr(
    item.scenarioId ??
      item.scenario_id ??
      item.scenarioID ??
      item.simulation_id ??
      (isNaN(Number(item.id)) ? item.id : undefined)
  ),
  title: toStr(item.title ?? item.name),
  image: toStr(
    item.scenarioImage ??
      item.image_url ??
      item.image ??
      item.imageUrl ??
      item.imageURL ??
      item.scenario_image ??
      item.cover_image ??
      item.coverImage ??
      item.thumbnail ??
      item.blob_url ??
      item.blobUrl ??
      item.media_url ??
      item.mediaUrl ??
      item.picture ??
      item.photo ??
      item.unit_image
  ),
  cta: toStr(item.cta ?? 'View'),
  unit: toOptStr(
    item.unit ??
      (item.unitId as string | undefined) ??
      item.unit_id ??
      item.unit_name
  ),
  unit_name: toOptStr(item.unit_name ?? item.unitName ?? item.unit_title),
  category: undefined, // Category is now derived from avatarEnabled only
  description: toOptStr(item.description),
  images: Array.isArray(item.images) ? (item.images as string[]) : undefined,
  language: toOptStr(item.language),
  subtitle: toOptStr(item.subtitle ?? item.sub_title),
  developer: toOptStr(item.developer),
  institution: toOptStr(item.institution),
  last_update: toOptStr(item.last_update ?? item.updatedAt ?? item.updated_at),
  learning_objectives: Array.isArray(item.learning_objectives)
    ? (item.learning_objectives as string[])
    : undefined,
  targetAudience: Array.isArray(item.targetAudience)
    ? (item.targetAudience as string[])
    : item.targetAudience
      ? [String(item.targetAudience)]
      : Array.isArray(item.target_audience)
        ? (item.target_audience as string[])
        : item.target_audience
          ? [String(item.target_audience)]
          : undefined,
  difficulty: toOptStr(item.difficulty ?? item.difficultyLevel),
  duration: toOptStr(item.duration ?? item.estimatedDuration),
  purpose: toOptStr(item.purpose ?? item.objective),
  status: toOptStr(item.status ?? item.Status), // Handle both lowercase and uppercase
  learnerLevel: toOptStr(item.learnerLevel ?? item.learner_level),
  avatarEnabled: parseAvatarEnabled(item.avatarEnabled),
  // Same sources as the library: productSetup.title, then the flat aliases.
  productName: toOptStr(readProductName(item)),
});

export const fetchSimulationCatalog = createAsyncThunk<
  CatalogData,
  string | undefined,
  { rejectValue: string; state: RootState }
>(
  'simulationCatalog/fetch',
  async (ls, { rejectWithValue }) => {
    try {
      const headers = {
        'ngrok-skip-browser-warning': 'true',
      };

      const params = ls ? { ls } : { ls: 'en' };

      const response = await api.get(config.SimulationCatalogCombinedAPI, {
        headers,
        params,
      });

      const payload = response.data?.data;

      if (!payload || typeof payload !== 'object') {
        return rejectWithValue('Empty response from catalog API');
      }

      const catalogFavorites = new Map(
        (payload.catalog ?? []).map((item: CatalogFavoriteItem) => [
          item.scenarioId || item.scenario_id,
          item.myFavorite,
        ])
      );

      const rawItems = (payload.scenarios ?? []).map(
        (item: ScenarioPayloadItem) => ({
          ...item,
          myFavorite:
            catalogFavorites.get(
              item.scenarioId || item.scenario_id || item.id
            ) ?? false,
        })
      );
      const simulationItems: SectionItem[] = rawItems
        .map((item: Record<string, unknown>) => normalizeSectionItem(item))
        .filter((item: SectionItem) => {
          const st = item.status?.trim().toLowerCase();
          return st !== 'draft' && st !== 'archived';
        });
      const allSections: Section[] = [
        {
          key: 'all-simulations',
          title: 'All Simulations',
          type: 'grid',
          items: simulationItems,
        },
      ];

      const allDisplayItems = simulationItems;

      const existingFields = payload.filters?.fields ?? [];

      const getExistingOpts = (key: string) =>
        existingFields.find((f: FilterField) => f.key === key)?.options ?? [];

      const pickOptions = (
        existing: string[],
        dynamic: (string | undefined)[]
      ): string[] =>
        [
          ...new Set([...existing, ...(dynamic.filter(Boolean) as string[])]),
        ].sort();

      const dynamicFilters: CatalogData['filters'] = {
        fields: [
          {
            key: 'unit',
            label:
              existingFields.find((f: FilterField) => f.key === 'unit')
                ?.label ?? 'Unit',
            options: [
              ...new Set(
                allDisplayItems.map((i) => i.unit).filter(Boolean) as string[]
              ),
            ].sort(),
          },
          {
            key: 'targetAudience',
            label:
              existingFields.find(
                (f: FilterField) => f.key === 'targetAudience'
              )?.label ?? 'Target Audience',
            options: pickOptions(
              getExistingOpts('targetAudience'),
              allDisplayItems.flatMap((i) => i.targetAudience ?? [])
            ),
          },
          {
            key: 'difficulty',
            label:
              existingFields.find((f: FilterField) => f.key === 'difficulty')
                ?.label ?? 'Difficulty',
            options: pickOptions(
              getExistingOpts('difficulty'),
              allDisplayItems.map((i) => i.difficulty)
            ),
          },
          {
            key: 'duration',
            label:
              existingFields.find((f: FilterField) => f.key === 'duration')
                ?.label ?? 'Duration',
            options: pickOptions(
              getExistingOpts('duration'),
              allDisplayItems.map((i) => i.duration)
            ),
          },
        ].filter((f) => f.options.length > 0),
      };

      const newestSim = simulationItems[simulationItems.length - 1];

      const rawBanner = payload.banner as Record<string, string>;

      const normalizedBanner: BannerData = {
        title: String(newestSim?.title ?? rawBanner?.title ?? ''),
        subtitle: String(newestSim?.description ?? rawBanner?.subtitle ?? ''),
        image: String(newestSim?.image ?? rawBanner?.image ?? ''),
      };

      return {
        banner: normalizedBanner,
        browseBy: payload.dashboard?.browseBy ??
          payload.browseBy ?? {
            filters: [],
            items: [],
          },
        sections: allSections,
        filters: dynamicFilters,
      };
    } catch (err: unknown) {
      return rejectWithValue(
        err instanceof Error ? err.message : 'Unknown error'
      );
    }
  },
  {
    condition: (_, { getState }) =>
      !(getState() as RootState).simulationCatalog.loading,
  }
);

const simulationCatalogSlice = createSlice({
  name: 'simulationCatalog',
  initialState,
  reducers: {
    clearSelectedSimulation(state) {
      state.selectedItem = null;
      state.detailError = null;
    },

    resetCatalog(state) {
      state.catalogData = null;
      state.error = null;
    },

    setAppliedFilters(state, action: PayloadAction<CatalogFilters>) {
      state.appliedFilters = action.payload;
    },

    clearAppliedFilters(state) {
      state.appliedFilters = EMPTY_LIBRARY_FILTERS;
    },

    updateSimulationFavorite(
      state,
      action: PayloadAction<{
        scenarioId: string;
        favorite: boolean;
      }>
    ) {
      const targetId = String(action.payload.scenarioId);
      state.catalogData?.sections.forEach((section) => {
        section.items.forEach((item) => {
          const matchScenarioId =
            item.scenarioId != null && String(item.scenarioId) === targetId;
          const matchId = item.id != null && String(item.id) === targetId;
          if (matchScenarioId || matchId) {
            item.myFavorite = action.payload.favorite;
          }
        });
      });
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchSimulationCatalog.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchSimulationCatalog.fulfilled, (state, action) => {
        state.loading = false;
        state.catalogData = action.payload;
      })
      .addCase(fetchSimulationCatalog.rejected, (state, action) => {
        state.loading = false;
        state.error =
          typeof action.payload === 'string'
            ? action.payload
            : action.error.message || 'Failed to fetch catalog';
      });
  },
});

export const {
  clearSelectedSimulation,
  resetCatalog,
  updateSimulationFavorite,
  setAppliedFilters,
  clearAppliedFilters,
} = simulationCatalogSlice.actions;
export default simulationCatalogSlice.reducer;
