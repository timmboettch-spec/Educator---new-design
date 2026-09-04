import {
  createAsyncThunk,
  createSelector,
  createSlice,
  type PayloadAction,
} from "@reduxjs/toolkit";
import type { Class } from "../../types/Class_types";
import type { RootState } from "../../store";
import { FAILED, IDLE, LOADING, SUCCEEDED } from "../../utils/constants";
import config from "../config";
import api from "../api";

export interface ResponseClass {
  data: {
    classes: Class[];
    simulations: number;
  };
  message: string;
  status: string;
}

export interface ClassState {
  responseClass: ResponseClass | null;
  status: "idle" | "loading" | "succeeded" | "failed";
  error: string | null;
  reportCountsById: Record<string, number>;
  needsAttentionById: Record<string, boolean>;
  unreadCountById: Record<string, number>;
  viewedReportIds: string[];
}

const VIEWED_REPORTS_KEY = 'rwai_viewed_report_ids';

function loadViewedReportIds(): string[] {
  try {
    const stored = localStorage.getItem(VIEWED_REPORTS_KEY);
    return stored ? (JSON.parse(stored) as string[]) : [];
  } catch {
    return [];
  }
}

const initialState: ClassState = {
  responseClass: null,
  status: IDLE,
  error: null,
  reportCountsById: {},
  needsAttentionById: {},
  unreadCountById: {},
  viewedReportIds: loadViewedReportIds(),
};

type ClassLike = Class & {
  report_count?: unknown;
  reports_count?: unknown;
  total_reports?: unknown;
  generated_reports?: unknown;
  reportCount?: unknown;
  reportsCount?: unknown;
  needs_attention?: unknown;
  unread_report_count?: unknown;
  unreadCount?: unknown;
};

function toNumber(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function toStringOrEmpty(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return String(value);
  return "";
}

export const FetchClassesRequest = createAsyncThunk<
  ResponseClass,
  { silent?: boolean } | void,
  { rejectValue: { message: string }; state: RootState }
>("/classes", async (_, thunkAPI) => {
  try {
    const res = await api.get(config.ClassUserAPI,{
      headers: {
        'ngrok-skip-browser-warning': 'true',
      },
    });
    const knownCounts = thunkAPI.getState().GetClass.reportCountsById;
    const knownAttentionMap = thunkAPI.getState().GetClass.needsAttentionById;
    const knownUnreadMap = thunkAPI.getState().GetClass.unreadCountById;
    const classes = (res.data?.data?.classes ?? []) as ClassLike[];
    const normalizedClasses = classes.map((cls) => {
      const id = toStringOrEmpty(cls.id);
      const knownCount = knownCounts[id];
      const apiCount =
        toNumber(cls.reports) ||
        toNumber(cls.report_count) ||
        toNumber(cls.reports_count) ||
        toNumber(cls.total_reports) ||
        toNumber(cls.generated_reports) ||
        toNumber(cls.reportCount) ||
        toNumber(cls.reportsCount);
      const apiUnreadCount =
        toNumber(cls.unreadReportCount) ||
        toNumber(cls.unread_report_count) ||
        toNumber(cls.unreadCount);
      const apiNeedsAttention =
        cls.needsAttention === true ||
        cls.needs_attention === true ||
        apiUnreadCount > 0;
      const mergedNeedsAttention = knownAttentionMap[id] ?? apiNeedsAttention;
      const mergedUnread = knownUnreadMap[id] ?? apiUnreadCount;

      return {
        ...cls,
        school_name: (cls as unknown as Record<string, Record<string, string>>).school?.school_name ?? (cls as unknown as Record<string, string>).school_name,
        reports: knownCount ?? apiCount,
        needsAttention: mergedNeedsAttention,
        unreadReportCount: mergedUnread,
      };
    });

    return {
      ...res.data,
      data: { ...res.data.data, classes: normalizedClasses },
    };
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
      message: error.response?.data?.message || "Class fetch failed",
    });
  }
});

const ClassSlice = createSlice({
  name: "GetClass",
  initialState,
  reducers: {
    resetClassListStatus(state) {
      state.status = IDLE;
    },
    resetClassState(state) {
      state.status = IDLE;
      state.responseClass = null;
      state.error = null;
      state.reportCountsById = {};
      state.needsAttentionById = {};
      state.unreadCountById = {};
      state.viewedReportIds = [];
      try { localStorage.removeItem(VIEWED_REPORTS_KEY); } catch { /* ignore */ }
    },
    patchStudentInClass(
      state,
      action: { payload: { id: string; student_id: string | null } },
    ) {
      if (!state.responseClass) return;
      for (const cls of state.responseClass.data.classes) {
        const idx =
          cls.students?.findIndex(
            (s) => String(s.id) === String(action.payload.id),
          ) ?? -1;
        if (idx !== -1 && cls.students) {
          cls.students[idx] = {
            ...cls.students[idx],
            student_id: action.payload.student_id ?? null,
          };
          break;
        }
      }
    },
    setClassReportCount(
      state,
      action: PayloadAction<{ classId: string; reports: number }>,
    ) {
      const count = toNumber(action.payload.reports);
      const id = String(action.payload.classId);
      state.reportCountsById[id] = count;
      if (!state.responseClass) return;
      const target = state.responseClass.data.classes.find(
        (cls) => String(cls.id) === id,
      );
      if (target) {
        target.reportCount = count;
      }
    },
    setClassNeedsAttention(
      state,
      action: PayloadAction<{ classId: string; needsAttention: boolean; unreadCount?: number }>,
    ) {
      const id = String(action.payload.classId);
      state.needsAttentionById[id] = action.payload.needsAttention;
      if (action.payload.unreadCount !== undefined) {
        state.unreadCountById[id] = action.payload.unreadCount;
      }
      if (!state.responseClass) return;
      const target = state.responseClass.data.classes.find((cls) => String(cls.id) === id);
      if (target) {
        target.needsAttention = action.payload.needsAttention;
        if (action.payload.unreadCount !== undefined) {
          target.unreadReportCount = action.payload.unreadCount;
        }
      }
    },
    decrementUnreadCount(
      state,
      action: PayloadAction<{ classId: string }>,
    ) {
      const id = String(action.payload.classId);
      if (!(id in state.unreadCountById)) return;
      const current = state.unreadCountById[id];
      const next = Math.max(0, current - 1);
      state.unreadCountById[id] = next;
      state.needsAttentionById[id] = next > 0;
      if (!state.responseClass) return;
      const target = state.responseClass.data.classes.find((cls) => String(cls.id) === id);
      if (target) {
        target.unreadReportCount = next;
        target.needsAttention = next > 0;
      }
    },
    // Idempotent: tracks viewed report IDs, persists to localStorage, and
    // decrements the unread count for the class. When the unread count reaches 0
    // the class is cleared from "Need Attention" so that re-opening the sub-table
    // (which re-fetches reports) does not put it back.
    // Accepts a single reportId OR an array (for deduplicated rows that collapse
    // multiple reports behind one table row).
    markReportViewed(
      state,
      action: PayloadAction<{ reportId: string | string[]; classId: string }>,
    ) {
      const { reportId, classId } = action.payload;
      const ids = Array.isArray(reportId) ? reportId : [reportId];

      // Filter to only truly new IDs so every new one is counted exactly once.
      const newIds = ids.filter((id) => !state.viewedReportIds.includes(id));
      if (newIds.length === 0) return;

      state.viewedReportIds.push(...newIds);
      // Persist so viewed state survives page reloads
      try {
        localStorage.setItem(VIEWED_REPORTS_KEY, JSON.stringify(state.viewedReportIds));
      } catch { /* ignore storage errors */ }

      const id = String(classId);

      // If unreadCountById has been initialised (sub-table was opened), decrement
      // by the number of newly-viewed IDs.
      if (id in state.unreadCountById) {
        const current = state.unreadCountById[id];
        const next = Math.max(0, current - newIds.length);
        state.unreadCountById[id] = next;
        state.needsAttentionById[id] = next > 0;
        if (state.responseClass) {
          const target = state.responseClass.data.classes.find(
            (cls) => String(cls.id) === id,
          );
          if (target) {
            target.unreadReportCount = next;
            target.needsAttention = next > 0;
          }
        }
      } else {
        // unreadCountById not yet initialised — we still know at least these
        // reports were viewed. Mark needsAttention conservatively: keep true
        // until we have a real count from the API. The next GetClassSimulationReports
        // call will compute the correct residual count using viewedReportIds.
        // However if needsAttentionById was already set to true from the API we
        // leave it — we cannot know the residual without a full list. If it was
        // never set at all, we cannot infer anything safe here, so we do nothing.
      }
    },
    // Inverse of markReportViewed: mark report(s) as unreviewed (removes them
    // from the viewed set so they read as NEW again), and bump the unread count.
    markReportUnviewed(
      state,
      action: PayloadAction<{ reportId: string | string[]; classId: string }>,
    ) {
      const { reportId, classId } = action.payload;
      const ids = Array.isArray(reportId) ? reportId : [reportId];
      const removeSet = new Set(ids);
      const before = state.viewedReportIds.length;
      state.viewedReportIds = state.viewedReportIds.filter(
        (id) => !removeSet.has(id),
      );
      const removed = before - state.viewedReportIds.length;
      if (removed === 0) return;
      try {
        localStorage.setItem(
          VIEWED_REPORTS_KEY,
          JSON.stringify(state.viewedReportIds),
        );
      } catch {
        /* ignore storage errors */
      }
      const id = String(classId);
      if (id in state.unreadCountById) {
        const next = state.unreadCountById[id] + removed;
        state.unreadCountById[id] = next;
        state.needsAttentionById[id] = next > 0;
        if (state.responseClass) {
          const target = state.responseClass.data.classes.find(
            (cls) => String(cls.id) === id,
          );
          if (target) {
            target.unreadReportCount = next;
            target.needsAttention = next > 0;
          }
        }
      }
    },
    patchClassInStore(
      state,
      action: PayloadAction<{
        id: string;
        class_name: string;
        status: string;
        start_date: string;
        end_date: string;
        school_id?: string;
        school_name?: string;
      }>,
    ) {
      if (!state.responseClass) return;
      const { id, class_name, status, start_date, end_date, school_id, school_name } = action.payload;
      const target = state.responseClass.data.classes.find(
        (cls) => String(cls.id) === String(id),
      );
      if (target) {
        target.class_name = class_name;
        target.status = status;
        target.start_date = start_date;
        target.end_date = end_date;
        if (school_id !== undefined) target.school_id = school_id;
        if (school_name !== undefined) target.school_name = school_name;
      }
    },
  },
  extraReducers: (builder) => {
    builder.addCase(FetchClassesRequest.pending, (state) => {
      state.status = LOADING;
      state.error = null;
    });

    builder.addCase(FetchClassesRequest.fulfilled, (state, action) => {
      state.status = SUCCEEDED;
      state.responseClass = action.payload;
    });

    builder.addCase(FetchClassesRequest.rejected, (state, action) => {
      state.status = FAILED;
      state.error = action.payload?.message || "Class fetch failed";
    });
  },
});

export const { resetClassListStatus, resetClassState, patchStudentInClass, patchClassInStore, setClassReportCount, setClassNeedsAttention, decrementUnreadCount, markReportViewed, markReportUnviewed } =
  ClassSlice.actions;

const selectState = (state: RootState) => state.GetClass;

export const selectClassResponse = createSelector(
  selectState,
  (state) => state.responseClass,
);

export const selectClassStatus = createSelector(
  selectState,
  (state) => state.status,
);

export const selectClassError = createSelector(
  selectState,
  (state) => state.error,
);

const selectClassListState = (state: RootState) => state.GetClass;

export const selectClasses = createSelector(
  selectClassListState,
  (s) => s?.responseClass?.data.classes,
);

export const selectClassListLoading = createSelector(
  selectClassListState,
  (s) => s?.status === LOADING,
);

export const selectClassListError = createSelector(
  selectClassListState,
  (s) => s?.error,
);

export const selectReportCountsById = createSelector(
  selectState,
  (s) => s.reportCountsById,
);

export const selectNeedsAttentionById = createSelector(
  selectState,
  (s) => s.needsAttentionById,
);

export const selectUnreadCountById = createSelector(
  selectState,
  (s) => s.unreadCountById,
);

export const selectViewedReportIds = createSelector(
  selectState,
  (s) => s.viewedReportIds,
);

/**
 * Returns a Set of all student_id codes currently stored across all classes.
 * Used for uniqueness validation when generating new 8-digit student codes.
 */
export const selectAllStudentCodes = createSelector(
  selectClasses,
  (classes): Set<string> => {
    const codes = new Set<string>();
    if (!classes) return codes;
    for (const cls of classes) {
      for (const student of cls.students ?? []) {
        if (student.student_id) codes.add(student.student_id);
      }
    }
    return codes;
  },
);

/**
 * Unified "is this report NEW" helper.
 *
 * Rules (applied in priority order):
 *  1. If the backend explicitly sets isNew=false, the report is never NEW.
 *  2. If the educator has already viewed it locally (viewedReportIds), not NEW.
 *  3. If the backend explicitly sets isNew=true, it IS new.
 *  4. If isNew is absent (backend hasn't shipped the field yet), treat any
 *     unviewed report as new so badges work out-of-the-box today.
 */
export function isReportNew(reportId: string, isNew: boolean | undefined, viewedIds: string[]): boolean {
  if (isNew === false) return false;          // backend says explicitly: not new
  if (viewedIds.includes(reportId)) return false; // educator already opened it
  if (isNew === true) return true;            // backend says explicitly: new
  return true;                               // isNew absent → assume new until viewed
}

export const selectNewReportsByUserId = createSelector(
  (state: RootState) => state.EducatorReports.reports,
  selectViewedReportIds,
  (reports, viewedIds): Record<string, boolean> => {
    const map: Record<string, boolean> = {};
    for (const r of reports) {
      if (!r.userId) continue;
      if (isReportNew(r.id, r.isNew, viewedIds)) {
        map[r.userId] = true;
      }
    }
    return map;
  },
);

/**
 * Derives Need Attention state per class purely from EducatorReports + viewedReportIds.
 * This is available immediately after GetEducatorSimulationReports resolves on mount,
 * without requiring the educator to expand any class row.
 *
 * Returns a map of { classId -> unreadCount } for every class that has ≥1 unread report.
 */
export const selectNeedAttentionByClassId = createSelector(
  (state: RootState) => state.EducatorReports.reports,
  selectViewedReportIds,
  selectClasses,
  (reports, viewedIds, classes): Record<string, number> => {
    if (!classes || classes.length === 0) return {};

    // Build userId → classId map from class rosters
    const userToClass = new Map<string, string>();
    for (const cls of classes) {
      for (const student of cls.students ?? []) {
        if (student.user_id) userToClass.set(student.user_id, cls.id);
        // also index by student_id since some reports use userId = student_id
        if (student.student_id) userToClass.set(student.student_id, cls.id);
      }
    }

    const unreadByClass: Record<string, number> = {};
    for (const r of reports) {
      if (!r.userId) continue;
      if (!isReportNew(r.id, r.isNew, viewedIds)) continue;
      const classId = userToClass.get(r.userId);
      if (!classId) continue;
      unreadByClass[classId] = (unreadByClass[classId] ?? 0) + 1;
    }
    return unreadByClass;
  },
);

/**
 * Total number of classes that have at least one unread report.
 * Drives the Need Attention tab badge and is available immediately on mount.
 */
export const selectNeedAttentionCount = createSelector(
  selectNeedAttentionByClassId,
  (byClass): number => Object.keys(byClass).length,
);

export const FetchNeedAttentionClasses = createAsyncThunk<
  void,
  void,
  { rejectValue: { message: string }; state: RootState }
>('/classes/needAttention', async (_, thunkAPI) => {

  try {
    const res = await api.get(config.ClassesNeedingAttentionAPI);

    type AttentionEntry = Record<string, unknown>;
    let entries: AttentionEntry[] = [];
    const raw = res.data as unknown;

    if (Array.isArray(raw)) {
      entries = raw as AttentionEntry[];
    } else if (raw && typeof raw === 'object') {
      const r = raw as Record<string, unknown>;
      if (Array.isArray(r['data'])) {
        entries = r['data'] as AttentionEntry[];
      } else if (r['data'] && typeof r['data'] === 'object') {
        const d = r['data'] as Record<string, unknown>;
        if (Array.isArray(d['classes'])) entries = d['classes'] as AttentionEntry[];
        else if (Array.isArray(d['data'])) entries = d['data'] as AttentionEntry[];
      }
    }

    if (entries.length > 0) {
      for (const entry of entries) {
        const id = String(
          entry['classId'] ?? entry['class_id'] ?? entry['id'] ?? '',
        );
        if (!id) continue;

        const unreadCount = toNumber(
          entry['unreadCount'] ??
            entry['unread_count'] ??
            entry['unreadReportCount'] ??
            entry['unread_report_count'] ??
            0,
        );
        const needsAttention =
          typeof (entry['needsAttention'] ?? entry['needs_attention']) === 'boolean'
            ? Boolean(entry['needsAttention'] ?? entry['needs_attention'])
            : unreadCount > 0;

        thunkAPI.dispatch(
          setClassNeedsAttention({ classId: id, needsAttention, unreadCount }),
        );
      }
      return;
    }
  } catch {
    return;
  }

  const state = thunkAPI.getState() as RootState;
  const allClasses = state.GetClass.responseClass?.data?.classes ?? [];
  const unreadCountById = state.GetClass.unreadCountById;

  for (const cls of allClasses) {
    const id = String(cls.id ?? '');
    if (!id) continue;

    // Prefer the live unread count (set by GetClassSimulationReports after
    // cross-referencing viewedReportIds) over the raw API snapshot.
    // Do NOT fall back to total report count — that would put every class
    // with any reports into Need Attention regardless of viewed status.
    if (id in unreadCountById) {
      const unreadCount = unreadCountById[id];
      thunkAPI.dispatch(
        setClassNeedsAttention({
          classId: id,
          needsAttention: unreadCount > 0,
          unreadCount,
        }),
      );
    } else {
      // No unread count computed yet — derive from cls.unreadReportCount
      // which is the value the backend sent (not the total report count).
      const apiUnread =
        toNumber(cls.unreadReportCount) ||
        toNumber((cls as ClassLike).unread_report_count) ||
        toNumber((cls as ClassLike).unreadCount);
      thunkAPI.dispatch(
        setClassNeedsAttention({
          classId: id,
          needsAttention: apiUnread > 0 || cls.needsAttention === true,
          unreadCount: apiUnread,
        }),
      );
    }
  }
});

export default ClassSlice.reducer;
