import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import type { RootState } from '../../store';
import { FAILED, IDLE, LOADING, SUCCEEDED } from '../../utils/constants';
import config from '../config';
import api from '../api';
import {
  fetchLMSClasses,
  type MoodleMappedClassesResponse,
  type MoodleMappedClass,
} from './GetLMSClassRedux';
import {
  getLtiLaunchCourseContextFromStorage,
  indexExistingClassesByCourseId,
  indexExistingClassesByNrpsUrl,
  normalizeLmsCourseId,
  normalizeNrpsUrl,
  resolveLmsClassName,
  shouldRenameExistingClass,
  type LmsClassDetail,
} from '../../utils/lmsClassName';
import { extractImportableNrpsStudents } from '../../utils/lmsNrpsStudentImport';
import { getLtiSchoolIdFromStorage } from '../../utils/lmsLaunchSync';
export type { LmsClassDetail } from '../../utils/lmsClassName';

export interface LmsStudent {
  id?: string;
  userId?: string;
  user_id?: string;
  name?: string;
  given_name?: string;
  family_name?: string;
  email?: string;
  roles?: string[];
  [key: string]: unknown;
}

export interface LmsLiveClass {
  nrpsUrl?: string;
  classDetails: LmsClassDetail | null;
  total: number;
  students: LmsStudent[];
  error?: string;
}

export interface SyncLmsResult {
  created: number;
  skipped: number;
  renamed: number;
  resynced: number;
  createdClassNames: string[];
}

interface SyncLmsState {
  syncState: 'idle' | 'loading' | 'succeeded' | 'failed';
  lastSyncResult: SyncLmsResult | null;
  liveRosterByClassName: Record<string, LmsStudent[]>;
  error: string | null;
}

function buildRosterByClassName(
  lmsClasses: LmsLiveClass[],
  ltiContext = getLtiLaunchCourseContextFromStorage()
): Record<string, LmsStudent[]> {
  const roster: Record<string, LmsStudent[]> = {};
  for (const lmsClass of lmsClasses) {
    if (lmsClass.error || !lmsClass.classDetails) continue;
    const className = resolveLmsClassName(lmsClass.classDetails, ltiContext);
    if (!className) continue;
    roster[className.toLowerCase().trim()] = lmsClass.students ?? [];
  }
  return roster;
}

function isLearnerRole(roles: string[] | undefined): boolean {
  if (!Array.isArray(roles) || roles.length === 0) return false;
  const normalized = roles.map((r) => String(r ?? '').toLowerCase());
  const hasLearner = normalized.some(
    (role) =>
      role.includes('learner') ||
      role.includes('student') ||
      role.endsWith('#student') ||
      role.endsWith('/student') ||
      role === 'student'
  );
  const hasInstructorOrAdmin = normalized.some(
    (role) =>
      role.includes('instructor') ||
      role.includes('teacher') ||
      role.includes('administrator') ||
      role.includes('admin') ||
      role.includes('manager')
  );
  return hasLearner && !hasInstructorOrAdmin;
}

function extractLmsStudents(lmsStudents: LmsStudent[]) {
  return extractImportableNrpsStudents(lmsStudents, (student) =>
    isLearnerRole(student.roles)
  );
}

function defaultClassDateRange(): { start_date: string; end_date: string } {
  const today = new Date();
  const nextYear = new Date(today);
  nextYear.setFullYear(today.getFullYear() + 1);
  const toISODate = (d: Date) => d.toISOString().split('T')[0];
  return {
    start_date: toISODate(today),
    end_date: toISODate(nextYear),
  };
}

const initialState: SyncLmsState = {
  syncState: IDLE,
  lastSyncResult: null,
  liveRosterByClassName: {},
  error: null,
};

function getNrpsUrlsFromStorage(): string[] {
  if (typeof window === 'undefined') return [];
  const raw = localStorage.getItem('nrpsUrl') ?? '';
  return Array.from(
    new Set(
      raw
        .split(',')
        .map((u) => u.trim())
        .filter(Boolean)
    )
  );
}

async function triggerBackendRosterSync(
  ltiContext: ReturnType<typeof getLtiLaunchCourseContextFromStorage>,
  nrpsUrls: string[]
): Promise<boolean> {
  const lmsCourseId = normalizeLmsCourseId(ltiContext.courseId ?? '');
  if (!lmsCourseId) {
    return false;
  }
  return triggerBackendRosterSyncForCourse(lmsCourseId, nrpsUrls[0] ?? '');
}

async function triggerBackendRosterSyncForCourse(
  lmsCourseId: string,
  nrpsUrl = '',
  schoolIdOverride = ''
): Promise<boolean> {
  const normalizedCourseId = normalizeLmsCourseId(lmsCourseId);
  if (!normalizedCourseId) {
    return false;
  }
  const schoolId = (schoolIdOverride || getLtiSchoolIdFromStorage()).trim();
  try {
    await api.post(
      config.LmsProvisionSyncAPI,
      {
        lmsCourseId: normalizedCourseId,
        moodleCourseId: normalizedCourseId,
        nrpsUrl,
        ...(schoolId ? { schoolId } : {}),
      },
      { headers: { 'ngrok-skip-browser-warning': 'true' } }
    );
    return true;
  } catch {
    return false;
  }
}

async function buildSchoolIdByClassIdMap(): Promise<Map<string, string>> {
  const schoolIdByClassId = new Map<string, string>();
  try {
    const portalRes = await api.get(config.ClassUserAPI, {
      headers: { 'ngrok-skip-browser-warning': 'true' },
    });
    const portalClasses: Array<{ id?: string; school_id?: string }> =
      portalRes.data?.data?.classes ?? [];
    for (const cls of portalClasses) {
      const classId = String(cls.id ?? '').trim();
      const schoolId = String(cls.school_id ?? '').trim();
      if (classId && schoolId) {
        schoolIdByClassId.set(classId, schoolId);
      }
    }
  } catch {
    // Best-effort: fall back to launch school when portal list is unavailable.
  }
  return schoolIdByClassId;
}

async function resyncAllMappedLmsRosters(): Promise<number> {
  try {
    const mappedRes = await api.get(config.LmsMoodleMappedClassesAPI, {
      headers: { 'ngrok-skip-browser-warning': 'true' },
    });
    const mappedClasses: MoodleMappedClass[] =
      mappedRes.data?.data?.classes ?? [];

    const schoolIdByClassId = await buildSchoolIdByClassIdMap();

    const seenCourseIds = new Set<string>();
    const syncTargets = mappedClasses.flatMap((mappedClass) => {
      const lmsCourseId = normalizeLmsCourseId(mappedClass.lmsCourseId);
      if (!lmsCourseId || seenCourseIds.has(lmsCourseId)) {
        return [];
      }
      seenCourseIds.add(lmsCourseId);

      const classId = String(mappedClass.classId ?? '').trim();
      const schoolId = classId ? (schoolIdByClassId.get(classId) ?? '') : '';

      return [
        triggerBackendRosterSyncForCourse(
          lmsCourseId,
          String(mappedClass.nrpsUrl ?? '').trim(),
          schoolId
        ),
      ];
    });

    const results = await Promise.all(syncTargets);
    return results.filter(Boolean).length;
  } catch {
    return 0;
  }
}

function hydrateLmsCachesFromLaunch(
  thunkAPI: { dispatch: (action: unknown) => unknown },
  lmsClasses: LmsLiveClass[],
  mappedPayload: MoodleMappedClassesResponse | null
): void {
  thunkAPI.dispatch(
    fetchLiveLmsClasses.fulfilled(
      buildRosterByClassName(lmsClasses),
      '',
      undefined
    )
  );
  if (mappedPayload) {
    thunkAPI.dispatch(fetchLMSClasses.fulfilled(mappedPayload, '', undefined));
  }
}

export const syncLmsClasses = createAsyncThunk<
  SyncLmsResult,
  void,
  { rejectValue: { message: string }; state: RootState }
>('lmsSync/syncClasses', async (_, thunkAPI) => {
  try {
    const ltiContext = getLtiLaunchCourseContextFromStorage();
    const nrpsUrls = getNrpsUrlsFromStorage();
    const lmsRes = await api.get(config.LiveClassesAPI, {
      params:
        nrpsUrls.length > 0 ? { nrpsUrls: nrpsUrls.join(',') } : undefined,
      headers: { 'ngrok-skip-browser-warning': 'true' },
    });
    const lmsClasses: LmsLiveClass[] = lmsRes.data?.data?.classes ?? [];
    let mappedClasses: MoodleMappedClass[] = [];
    let mappedClassesPayload: MoodleMappedClassesResponse | null = null;
    try {
      const mappedRes = await api.get(config.LmsMoodleMappedClassesAPI, {
        headers: { 'ngrok-skip-browser-warning': 'true' },
      });
      mappedClasses = mappedRes.data?.data?.classes ?? [];
      mappedClassesPayload = {
        classes: mappedClasses,
        total: mappedRes.data?.data?.total ?? mappedClasses.length,
      };
    } catch {
      // Best-effort: fall back to lms_class_reference on portal classes only.
    }

    let existingClasses =
      thunkAPI.getState().GetClass.responseClass?.data?.classes ?? [];
    if (existingClasses.length === 0) {
      try {
        const portalRes = await api.get(config.ClassUserAPI, {
          headers: { 'ngrok-skip-browser-warning': 'true' },
        });
        existingClasses = portalRes.data?.data?.classes ?? [];
      } catch {
        // Best-effort: mapped-classes API remains primary; portal list fills lms_class_reference gaps.
      }
    }

    // Existence is keyed by Moodle course ID / NRPS URL from active mappings only — never class name.
    const existingByCourseId = indexExistingClassesByCourseId(
      mappedClasses,
      existingClasses
    );
    const existingByNrpsUrl = indexExistingClassesByNrpsUrl(mappedClasses);
    const selectedCourseIds = new Set<string>();
    const selectedNrpsUrls = new Set<string>();
    let renamedCount = 0;
    let resyncedCount = 0;
    const launchSchoolId = getLtiSchoolIdFromStorage();
    const toCreate: Array<{
      class_id?: string;
      class_name: string;
      lmsCourseId?: string | number;
      nrpsUrl?: string;
      school_id?: string;
      status: 'ACTIVE';
      start_date: string;
      end_date: string;
      students: ReturnType<typeof extractLmsStudents>;
    }> = [];

    const firstRosterError = lmsClasses.find((c) => !!c.error)?.error;

    for (const lmsClass of lmsClasses) {
      if (lmsClass.error) {
        continue;
      }

      const detail = lmsClass.classDetails;
      const className = detail ? resolveLmsClassName(detail, ltiContext) : '';
      const lmsClassId = String(
        detail?.contextId ?? detail?.context_id ?? detail?.id ?? ''
      ).trim();

      if (!className) {
        continue;
      }

      const normalizedCourseId = normalizeLmsCourseId(lmsClassId);
      let existingForCourse = normalizedCourseId
        ? existingByCourseId.get(normalizedCourseId)
        : undefined;
      // Only fall back to NRPS URL when we have no course ID — never treat a shared NRPS
      // endpoint as proof that this specific Moodle course already exists.
      if (!existingForCourse && !normalizedCourseId && lmsClass.nrpsUrl) {
        existingForCourse = existingByNrpsUrl.get(
          normalizeNrpsUrl(lmsClass.nrpsUrl)
        );
      }

      if (existingForCourse) {
        if (shouldRenameExistingClass(existingForCourse.className, className)) {
          try {
            await api.put(`${config.ClassAPI}/${existingForCourse.classId}`, {
              className,
            });
            renamedCount += 1;
          } catch {
            // Rename is best-effort; do not create a duplicate if update fails.
          }
        }

        if (
          normalizedCourseId &&
          (await triggerBackendRosterSyncForCourse(
            normalizedCourseId,
            lmsClass.nrpsUrl ?? nrpsUrls[0] ?? ''
          ))
        ) {
          resyncedCount += 1;
        }

        continue;
      }

      // Dedup within this batch: skip if we've already queued this exact course/NRPS combo
      if (normalizedCourseId && selectedCourseIds.has(normalizedCourseId)) {
        continue;
      }
      const nrpsKey = lmsClass.nrpsUrl
        ? normalizeNrpsUrl(lmsClass.nrpsUrl)
        : '';
      if (nrpsKey && selectedNrpsUrls.has(nrpsKey)) {
        continue;
      }

      const students =
        lmsClass.students.length > 0
          ? extractLmsStudents(lmsClass.students)
          : [];
      const { start_date, end_date } = defaultClassDateRange();
      toCreate.push({
        lmsCourseId: lmsClassId || undefined,
        nrpsUrl: lmsClass.nrpsUrl || undefined,
        class_name: className,
        ...(launchSchoolId ? { school_id: launchSchoolId } : {}),
        status: 'ACTIVE',
        start_date,
        end_date,
        students,
      });
      if (normalizedCourseId) {
        selectedCourseIds.add(normalizedCourseId);
      }
      if (nrpsKey) {
        selectedNrpsUrls.add(nrpsKey);
      }
    }

    // Safety net: if the launched course has no active mapping, force-create from LTI context
    // even when the live-classes payload didn't queue it (e.g. after a soft delete).
    if (toCreate.length === 0) {
      const launchCourseId = normalizeLmsCourseId(ltiContext.courseId ?? '');
      const launchCourseName = (ltiContext.courseName ?? '').trim();
      const launchNrpsKey = nrpsUrls[0] ? normalizeNrpsUrl(nrpsUrls[0]) : '';
      const launchCourseAlreadyExists =
        existingByCourseId.has(launchCourseId) ||
        (launchNrpsKey ? existingByNrpsUrl.has(launchNrpsKey) : false);
      if (launchCourseId && launchCourseName && !launchCourseAlreadyExists) {
        const matchingLive = lmsClasses.find((entry) => {
          if (entry.error || !entry.classDetails) {
            return false;
          }
          const detail = entry.classDetails;
          const liveCourseId = normalizeLmsCourseId(
            String(detail.contextId ?? detail.context_id ?? detail.id ?? '')
          );
          return liveCourseId === launchCourseId;
        });
        const students =
          matchingLive && matchingLive.students.length > 0
            ? extractLmsStudents(matchingLive.students)
            : [];
        const { start_date, end_date } = defaultClassDateRange();
        toCreate.push({
          lmsCourseId: launchCourseId,
          nrpsUrl: matchingLive?.nrpsUrl ?? nrpsUrls[0] ?? undefined,
          class_name: launchCourseName,
          ...(launchSchoolId ? { school_id: launchSchoolId } : {}),
          status: 'ACTIVE',
          start_date,
          end_date,
          students,
        });
      }
    }

    if (toCreate.length === 0) {
      if (firstRosterError) {
        return thunkAPI.rejectWithValue({ message: firstRosterError });
      }
      if (resyncedCount === 0) {
        if (await triggerBackendRosterSync(ltiContext, nrpsUrls)) {
          resyncedCount += 1;
        }
      }
      if (resyncedCount === 0) {
        resyncedCount = await resyncAllMappedLmsRosters();
      }
      hydrateLmsCachesFromLaunch(thunkAPI, lmsClasses, mappedClassesPayload);
      return {
        created: 0,
        skipped: lmsClasses.length,
        renamed: renamedCount,
        resynced: resyncedCount,
        createdClassNames: [],
      };
    }

    const bulkRes = await api.post(
      config.ClassBulkCreateAPI,
      { classes: toCreate },
      {
        headers: {
          'ngrok-skip-browser-warning': 'true',
        },
      }
    );

    const bulkData = bulkRes.data?.data as
      | {
          created?: number;
          failed?: number;
          results?: Array<{ success?: boolean; className?: string }>;
        }
      | undefined;
    const createdClassNames =
      bulkData?.results
        ?.filter((r) => r?.success)
        .map((r) => String(r.className ?? '').trim())
        .filter(Boolean) ?? toCreate.map((c) => c.class_name);
    const createdCount =
      typeof bulkData?.created === 'number'
        ? bulkData.created
        : createdClassNames.length;
    const failedCount =
      typeof bulkData?.failed === 'number' ? bulkData.failed : 0;

    if (await triggerBackendRosterSync(ltiContext, nrpsUrls)) {
      resyncedCount += 1;
    }

    hydrateLmsCachesFromLaunch(thunkAPI, lmsClasses, mappedClassesPayload);

    return {
      created: createdCount,
      skipped: Math.max(0, lmsClasses.length - createdCount - failedCount),
      renamed: renamedCount,
      resynced: resyncedCount,
      createdClassNames,
    };
  } catch (err) {
    const error = err as { response?: { data?: { message?: string } } };
    return thunkAPI.rejectWithValue({
      message: error.response?.data?.message ?? 'LMS class sync failed',
    });
  }
});

export const resyncLmsRosters = createAsyncThunk<
  { resynced: number },
  void,
  { rejectValue: { message: string } }
>('lmsSync/resyncRosters', async (_, thunkAPI) => {
  try {
    const resynced = await resyncAllMappedLmsRosters();
    return { resynced };
  } catch (err) {
    const error = err as { response?: { data?: { message?: string } } };
    return thunkAPI.rejectWithValue({
      message: error.response?.data?.message ?? 'LMS roster resync failed',
    });
  }
});

export const fetchLiveLmsClasses = createAsyncThunk<
  Record<string, LmsStudent[]>,
  void,
  { rejectValue: { message: string } }
>('lmsSync/fetchLiveClasses', async (_, thunkAPI) => {
  try {
    const nrpsUrls = getNrpsUrlsFromStorage();

    const lmsRes = await api.get(config.LiveClassesAPI, {
      params:
        nrpsUrls.length > 0 ? { nrpsUrls: nrpsUrls.join(',') } : undefined,
      headers: { 'ngrok-skip-browser-warning': 'true' },
    });

    const lmsClasses: LmsLiveClass[] = lmsRes.data?.data?.classes ?? [];
    const ltiContext = getLtiLaunchCourseContextFromStorage();
    return buildRosterByClassName(lmsClasses, ltiContext);
  } catch (err) {
    const error = err as { response?: { data?: { message?: string } } };
    return thunkAPI.rejectWithValue({
      message: error.response?.data?.message ?? 'Failed to fetch LMS classes',
    });
  }
});

const syncLmsClassesSlice = createSlice({
  name: 'lmsSync',
  initialState,
  reducers: {
    resetSyncState(state) {
      state.syncState = IDLE;
      state.lastSyncResult = null;
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(syncLmsClasses.pending, (state) => {
        state.syncState = LOADING;
        state.error = null;
      })
      .addCase(syncLmsClasses.fulfilled, (state, action) => {
        state.syncState = SUCCEEDED;
        state.lastSyncResult = action.payload;
      })
      .addCase(syncLmsClasses.rejected, (state, action) => {
        state.syncState = FAILED;
        state.error = action.payload?.message ?? 'LMS class sync failed';
      })
      .addCase(fetchLiveLmsClasses.fulfilled, (state, action) => {
        const liveResult = action.payload;
        state.liveRosterByClassName = {
          ...state.liveRosterByClassName,
          ...liveResult,
        };
      })
      .addCase(fetchLMSClasses.fulfilled, (state, action) => {
        for (const cls of action.payload.classes) {
          const key = (cls.className ?? '').toLowerCase().trim();
          if (!key) continue;
          const students: LmsStudent[] = (cls.students ?? []).map((s) => ({
            id: String(s.user_id ?? s.studentCode ?? ''),
            userId: String(s.user_id ?? s.studentCode ?? ''),
            user_id: String(s.user_id ?? s.studentCode ?? ''),
            name: s.name ?? s.studentName ?? undefined,
            email: s.email ?? undefined,
          }));
          if (
            !state.liveRosterByClassName[key] ||
            state.liveRosterByClassName[key].length === 0
          ) {
            state.liveRosterByClassName[key] = students;
          }
        }
      });
  },
});

export const { resetSyncState } = syncLmsClassesSlice.actions;
export const selectSyncState = (state: RootState) => state.lmsSync.syncState;
export const selectLastSyncResult = (state: RootState) =>
  state.lmsSync.lastSyncResult;
export const selectLiveRosterByClassName = (state: RootState) =>
  state.lmsSync.liveRosterByClassName;
export default syncLmsClassesSlice.reducer;
