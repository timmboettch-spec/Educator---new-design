import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import type { RootState } from '../../store';
import { FAILED, IDLE, LOADING, SUCCEEDED } from '../../utils/constants';
import config from '../config';
import api from '../api';

export type GoogleConnectionStatusValue = 'active' | 'revoked' | 'error' | null;

export interface GoogleConnectionStatus {
  connected: boolean;
  schoolId: string;
  status: GoogleConnectionStatusValue;
  googleAccountEmail: string | null;
  googleAccountId: string | null;
  scopes: string | null;
  tokenExpiresAt: string | null;
  connectedByEducatorId: string | null;
}

export interface GoogleClassroomCourse {
  id: string;
  name: string;
  section: string | null;
  descriptionHeading: string | null;
  room: string | null;
  courseState: string | null;
  enrollmentState: string | null;
  alternateLink: string | null;
  linked: boolean;
  mappingId: string | null;
  classId: string | null;
  className: string | null;
  archived: boolean;
  lastRosterSyncedAt: string | null;
}

export interface GoogleCourseMapping {
  id: string;
  schoolId: string;
  classId: string;
  googleCourseId: string;
  googleCourseName: string | null;
  linkedByEducatorId: string | null;
  lastRosterSyncedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  roster?: GoogleRosterSyncResult | null;
}

export interface GoogleProvisionItem {
  course: {
    id: string;
    name: string;
    section: string | null;
    descriptionHeading: string | null;
    room: string | null;
    courseState: string | null;
    enrollmentState: string | null;
    alternateLink: string | null;
  };
  classId: string;
  className: string;
  linked: boolean;
  mappingId: string | null;
  isNew: boolean;
  archived: boolean;
  lastRosterSyncedAt: string | null;
}

export interface GoogleProvisionResult {
  schoolId: string;
  items: GoogleProvisionItem[];
  newCount: number;
  archivedMatchCount: number;
}

export interface GoogleArchivedClass {
  classId: string;
  className: string;
  googleCourseId: string | null;
  googleCourseName: string | null;
  courseExists: boolean | null;
  archivedAt: string | null;
}

export interface GoogleBulkLinkResult {
  schoolId: string;
  results: Array<{
    googleCourseId: string;
    success: boolean;
    mapping?: GoogleCourseMapping;
    error?: string;
  }>;
}

export interface GoogleRosterSyncResult {
  mappingId: string;
  classId: string;
  googleCourseId: string;
  lastRosterSyncedAt: string;
  added: number;
  updated: number;
  deactivated: number;
  total: number;
}

interface GoogleClassroomState {
  status: GoogleConnectionStatus | null;
  statusState: 'idle' | 'loading' | 'succeeded' | 'failed';
  connectState: 'idle' | 'loading' | 'succeeded' | 'failed';
  disconnectState: 'idle' | 'loading' | 'succeeded' | 'failed';
  courses: GoogleClassroomCourse[];
  coursesState: 'idle' | 'loading' | 'succeeded' | 'failed';
  provisionState: 'idle' | 'loading' | 'succeeded' | 'failed';
  provisionResult: GoogleProvisionResult | null;
  archivedClasses: GoogleArchivedClass[];
  archivedState: 'idle' | 'loading' | 'succeeded' | 'failed';
  linkState: 'idle' | 'loading' | 'succeeded' | 'failed';
  unlinkState: 'idle' | 'loading' | 'succeeded' | 'failed';
  bulkLinkState: 'idle' | 'loading' | 'succeeded' | 'failed';
  linkingCourseId: string | null;
  unlinkingMappingId: string | null;
  rosterSyncState: 'idle' | 'loading' | 'succeeded' | 'failed';
  syncingMappingId: string | null;
  error: string | null;
}

const initialState: GoogleClassroomState = {
  status: null,
  statusState: IDLE,
  connectState: IDLE,
  disconnectState: IDLE,
  courses: [],
  coursesState: IDLE,
  provisionState: IDLE,
  provisionResult: null,
  archivedClasses: [],
  archivedState: IDLE,
  linkState: IDLE,
  unlinkState: IDLE,
  bulkLinkState: IDLE,
  linkingCourseId: null,
  unlinkingMappingId: null,
  rosterSyncState: IDLE,
  syncingMappingId: null,
  error: null,
};

/** Hosts allowed for Google OAuth authorization redirects. */
const ALLOWED_GOOGLE_OAUTH_HOSTS = new Set([
  'accounts.google.com',
  'oauth2.googleapis.com',
]);

export function isAllowedGoogleAuthorizationUrl(
  authorizationUrl: string
): boolean {
  try {
    const parsed = new URL(authorizationUrl);
    if (parsed.protocol !== 'https:') {
      return false;
    }
    // Exact host match only — blocks evil.accounts.google.com and similar.
    const host = parsed.hostname.toLowerCase();
    if (!ALLOWED_GOOGLE_OAUTH_HOSTS.has(host)) {
      return false;
    }
    // Reject credentials in the authority (https://user:pass@accounts.google.com/...).
    if (parsed.username || parsed.password) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

function apiErrorMessage(err: unknown, fallback: string): string {
  const error = err as {
    response?: { data?: { message?: string | string[] } };
  };
  const message = error.response?.data?.message;
  if (Array.isArray(message)) {
    return message.filter(Boolean).join(', ') || fallback;
  }
  if (typeof message === 'string' && message.trim()) {
    return message;
  }
  return fallback;
}

/** Backend sends this when the Google token is expired/revoked (UnauthorizedException). */
export const GOOGLE_CLASSROOM_REAUTH_REQUIRED =
  'Google Classroom authorization expired or was revoked. Reconnect Google Classroom for this school.';

export function isGoogleClassroomReauthMessage(
  message: string | null | undefined
): boolean {
  if (!message) return false;
  const lower = message.toLowerCase();
  return (
    lower.includes('reconnect google classroom') ||
    lower.includes('authorization expired') ||
    lower.includes(GOOGLE_CLASSROOM_REAUTH_REQUIRED.toLowerCase())
  );
}

function normalizeCourse(
  course: Partial<GoogleClassroomCourse> & { id: string; name: string }
): GoogleClassroomCourse {
  return {
    id: course.id,
    name: course.name,
    section: course.section ?? null,
    descriptionHeading: course.descriptionHeading ?? null,
    room: course.room ?? null,
    courseState: course.courseState ?? null,
    enrollmentState: course.enrollmentState ?? null,
    alternateLink: course.alternateLink ?? null,
    linked: Boolean(course.linked),
    mappingId: course.mappingId ?? null,
    classId: course.classId ?? null,
    className: course.className ?? null,
    archived: Boolean(course.archived),
    lastRosterSyncedAt: course.lastRosterSyncedAt ?? null,
  };
}

export const fetchGoogleClassroomConnection = createAsyncThunk<
  GoogleConnectionStatus,
  { schoolId: string },
  { rejectValue: string }
>('googleClassroom/fetchConnection', async ({ schoolId }, thunkAPI) => {
  try {
    const res = await api.get(
      `${config.GoogleClassroomConnectionAPI}/${schoolId}/connection`
    );
    const data = res.data?.data as GoogleConnectionStatus | undefined;
    if (!data) {
      return thunkAPI.rejectWithValue(
        'Google Classroom connection response was empty'
      );
    }
    return data;
  } catch (err) {
    return thunkAPI.rejectWithValue(
      apiErrorMessage(err, 'Failed to load Google Classroom connection')
    );
  }
});

export const initiateGoogleClassroomConnect = createAsyncThunk<
  { authorizationUrl: string; schoolId: string },
  { schoolId: string },
  { rejectValue: string }
>('googleClassroom/initiateConnect', async ({ schoolId }, thunkAPI) => {
  try {
    const res = await api.post(
      `${config.GoogleClassroomConnectionAPI}/${schoolId}/connect`,
      {}
    );
    const authorizationUrl = res.data?.data?.authorizationUrl as
      string | undefined;
    if (!authorizationUrl) {
      return thunkAPI.rejectWithValue(
        'Google authorization URL missing from response'
      );
    }
    if (!isAllowedGoogleAuthorizationUrl(authorizationUrl)) {
      return thunkAPI.rejectWithValue('Invalid Google authorization URL');
    }
    return {
      authorizationUrl,
      schoolId: (res.data?.data?.schoolId as string) || schoolId,
    };
  } catch (err) {
    return thunkAPI.rejectWithValue(
      apiErrorMessage(err, 'Failed to start Google Classroom connect')
    );
  }
});

export const disconnectGoogleClassroom = createAsyncThunk<
  GoogleConnectionStatus,
  { schoolId: string },
  { rejectValue: string }
>('googleClassroom/disconnect', async ({ schoolId }, thunkAPI) => {
  try {
    const res = await api.delete(
      `${config.GoogleClassroomConnectionAPI}/${schoolId}/connection`
    );
    return (
      (res.data?.data as GoogleConnectionStatus) ?? {
        connected: false,
        schoolId,
        status: null,
        googleAccountEmail: null,
        googleAccountId: null,
        scopes: null,
        tokenExpiresAt: null,
        connectedByEducatorId: null,
      }
    );
  } catch (err) {
    return thunkAPI.rejectWithValue(
      apiErrorMessage(err, 'Failed to disconnect Google Classroom')
    );
  }
});

export const fetchGoogleClassroomCourses = createAsyncThunk<
  GoogleClassroomCourse[],
  { schoolId: string },
  { rejectValue: string }
>('googleClassroom/fetchCourses', async ({ schoolId }, thunkAPI) => {
  try {
    const res = await api.get(
      `${config.GoogleClassroomConnectionAPI}/${schoolId}/courses`
    );
    const courses = (res.data?.data?.courses ?? []) as GoogleClassroomCourse[];
    return courses.map((course) => normalizeCourse(course));
  } catch (err) {
    return thunkAPI.rejectWithValue(
      apiErrorMessage(err, 'Failed to load Google Classroom courses')
    );
  }
});

export const provisionGoogleClassroomCourses = createAsyncThunk<
  GoogleProvisionResult,
  { schoolId: string },
  { rejectValue: string }
>('googleClassroom/provisionCourses', async ({ schoolId }, thunkAPI) => {
  try {
    const res = await api.post(
      `${config.GoogleClassroomConnectionAPI}/${schoolId}/courses/provision`,
      {}
    );
    const data = res.data?.data as GoogleProvisionResult | undefined;
    if (!data?.items) {
      return thunkAPI.rejectWithValue(
        'Google Classroom provision response was empty'
      );
    }
    return data;
  } catch (err) {
    return thunkAPI.rejectWithValue(
      apiErrorMessage(err, 'Failed to provision Google Classroom courses')
    );
  }
});

export const fetchArchivedGoogleClasses = createAsyncThunk<
  GoogleArchivedClass[],
  { schoolId: string },
  { rejectValue: string }
>('googleClassroom/fetchArchived', async ({ schoolId }, thunkAPI) => {
  try {
    const res = await api.get(
      `${config.GoogleClassroomConnectionAPI}/${schoolId}/archived-google-classes`
    );
    return (res.data?.data?.classes ?? []) as GoogleArchivedClass[];
  } catch (err) {
    return thunkAPI.rejectWithValue(
      apiErrorMessage(err, 'Failed to load archived Google Classroom classes')
    );
  }
});

export const linkGoogleClassroomCourse = createAsyncThunk<
  GoogleCourseMapping,
  {
    schoolId: string;
    googleCourseId: string;
    googleCourseName: string;
    googleCourseSection?: string;
    googleCourseOwnerId?: string;
  },
  { rejectValue: string }
>('googleClassroom/linkCourse', async (payload, thunkAPI) => {
  try {
    const res = await api.post(
      `${config.GoogleClassroomConnectionAPI}/${payload.schoolId}/course-mappings`,
      {
        googleCourseId: payload.googleCourseId,
        googleCourseName: payload.googleCourseName,
        googleCourseSection: payload.googleCourseSection,
        googleCourseOwnerId: payload.googleCourseOwnerId,
      }
    );
    const mapping = res.data?.data as GoogleCourseMapping | undefined;
    if (!mapping?.id) {
      return thunkAPI.rejectWithValue('Google course link response was empty');
    }
    return mapping;
  } catch (err) {
    return thunkAPI.rejectWithValue(
      apiErrorMessage(err, 'Failed to link Google Classroom course')
    );
  }
});

export const bulkLinkGoogleClassroomCourses = createAsyncThunk<
  GoogleBulkLinkResult,
  {
    schoolId: string;
    courses: Array<{
      googleCourseId: string;
      googleCourseName: string;
      googleCourseSection?: string;
      googleCourseOwnerId?: string;
    }>;
  },
  { rejectValue: string }
>('googleClassroom/bulkLink', async ({ schoolId, courses }, thunkAPI) => {
  try {
    const res = await api.post(
      `${config.GoogleClassroomConnectionAPI}/${schoolId}/course-mappings/bulk-link`,
      { courses }
    );
    const data = res.data?.data as GoogleBulkLinkResult | undefined;
    if (!data?.results) {
      return thunkAPI.rejectWithValue(
        'Google Classroom bulk link response was empty'
      );
    }
    return data;
  } catch (err) {
    return thunkAPI.rejectWithValue(
      apiErrorMessage(err, 'Failed to link Google Classroom courses')
    );
  }
});

export const unlinkGoogleClassroomCourse = createAsyncThunk<
  { mappingId: string; classId: string | null; className: string | null },
  {
    schoolId: string;
    mappingId: string;
    classId?: string | null;
    className?: string | null;
  },
  { rejectValue: string }
>(
  'googleClassroom/unlinkCourse',
  async ({ schoolId, mappingId, classId, className }, thunkAPI) => {
    try {
      await api.delete(
        `${config.GoogleClassroomConnectionAPI}/${schoolId}/course-mappings/${mappingId}`
      );
      return {
        mappingId,
        classId: classId ?? null,
        className: className ?? null,
      };
    } catch (err) {
      return thunkAPI.rejectWithValue(
        apiErrorMessage(err, 'Failed to unlink Google Classroom course')
      );
    }
  }
);

export const syncGoogleClassroomRoster = createAsyncThunk<
  GoogleRosterSyncResult,
  { schoolId: string; mappingId: string },
  { rejectValue: string }
>('googleClassroom/syncRoster', async ({ schoolId, mappingId }, thunkAPI) => {
  try {
    const res = await api.post(
      `${config.GoogleClassroomConnectionAPI}/${schoolId}/course-mappings/${mappingId}/sync-roster`
    );
    const data = res.data?.data as GoogleRosterSyncResult | undefined;
    if (!data?.mappingId || !data.lastRosterSyncedAt) {
      return thunkAPI.rejectWithValue(
        'Google Classroom roster sync response was empty'
      );
    }
    return data;
  } catch (err) {
    const message = apiErrorMessage(
      err,
      'Failed to sync Google Classroom roster'
    );
    // Preserve REAUTH_REQUIRED wording so UI can show reconnect instead of a generic error.
    if (isGoogleClassroomReauthMessage(message)) {
      return thunkAPI.rejectWithValue(GOOGLE_CLASSROOM_REAUTH_REQUIRED);
    }
    return thunkAPI.rejectWithValue(message);
  }
});

const googleClassroomSlice = createSlice({
  name: 'googleClassroom',
  initialState,
  reducers: {
    resetGoogleClassroomError(state) {
      state.error = null;
    },
    clearGoogleClassroomStatus(state) {
      state.status = null;
      state.statusState = IDLE;
      state.courses = [];
      state.coursesState = IDLE;
      state.provisionState = IDLE;
      state.provisionResult = null;
      state.archivedClasses = [];
      state.archivedState = IDLE;
      state.linkState = IDLE;
      state.unlinkState = IDLE;
      state.bulkLinkState = IDLE;
      state.linkingCourseId = null;
      state.unlinkingMappingId = null;
      state.rosterSyncState = IDLE;
      state.syncingMappingId = null;
      state.error = null;
    },
    clearGoogleProvisionResult(state) {
      state.provisionResult = null;
      state.provisionState = IDLE;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchGoogleClassroomConnection.pending, (state, action) => {
        state.statusState = LOADING;
        state.error = null;
        if (
          state.status?.schoolId &&
          state.status.schoolId !== action.meta.arg.schoolId
        ) {
          state.status = null;
        }
      })
      .addCase(fetchGoogleClassroomConnection.fulfilled, (state, action) => {
        state.statusState = SUCCEEDED;
        state.status = action.payload;
      })
      .addCase(fetchGoogleClassroomConnection.rejected, (state, action) => {
        state.statusState = FAILED;
        state.error =
          action.payload ?? 'Failed to load Google Classroom connection';
      })
      .addCase(initiateGoogleClassroomConnect.pending, (state) => {
        state.connectState = LOADING;
        state.error = null;
      })
      .addCase(initiateGoogleClassroomConnect.fulfilled, (state) => {
        state.connectState = SUCCEEDED;
      })
      .addCase(initiateGoogleClassroomConnect.rejected, (state, action) => {
        state.connectState = FAILED;
        state.error =
          action.payload ?? 'Failed to start Google Classroom connect';
      })
      .addCase(disconnectGoogleClassroom.pending, (state) => {
        state.disconnectState = LOADING;
        state.error = null;
      })
      .addCase(disconnectGoogleClassroom.fulfilled, (state, action) => {
        state.disconnectState = SUCCEEDED;
        state.status = action.payload;
        state.courses = [];
        state.coursesState = IDLE;
        state.provisionResult = null;
        state.provisionState = IDLE;
        state.rosterSyncState = IDLE;
        state.syncingMappingId = null;
      })
      .addCase(disconnectGoogleClassroom.rejected, (state, action) => {
        state.disconnectState = FAILED;
        state.error = action.payload ?? 'Failed to disconnect Google Classroom';
      })
      .addCase(fetchGoogleClassroomCourses.pending, (state) => {
        state.coursesState = LOADING;
        state.error = null;
      })
      .addCase(fetchGoogleClassroomCourses.fulfilled, (state, action) => {
        state.coursesState = SUCCEEDED;
        state.courses = action.payload;
      })
      .addCase(fetchGoogleClassroomCourses.rejected, (state, action) => {
        state.coursesState = FAILED;
        state.courses = [];
        state.error =
          action.payload ?? 'Failed to load Google Classroom courses';
      })
      .addCase(provisionGoogleClassroomCourses.pending, (state) => {
        state.provisionState = LOADING;
        state.error = null;
      })
      .addCase(provisionGoogleClassroomCourses.fulfilled, (state, action) => {
        state.provisionState = SUCCEEDED;
        state.provisionResult = action.payload;
        state.courses = action.payload.items.map((item) =>
          normalizeCourse({
            ...item.course,
            linked: item.linked,
            mappingId: item.mappingId,
            classId: item.classId,
            className: item.className,
            archived: item.archived,
            lastRosterSyncedAt: item.lastRosterSyncedAt ?? null,
          })
        );
        state.coursesState = SUCCEEDED;
      })
      .addCase(provisionGoogleClassroomCourses.rejected, (state, action) => {
        state.provisionState = FAILED;
        state.error =
          action.payload ?? 'Failed to provision Google Classroom courses';
      })
      .addCase(fetchArchivedGoogleClasses.pending, (state) => {
        state.archivedState = LOADING;
      })
      .addCase(fetchArchivedGoogleClasses.fulfilled, (state, action) => {
        state.archivedState = SUCCEEDED;
        state.archivedClasses = action.payload;
      })
      .addCase(fetchArchivedGoogleClasses.rejected, (state, action) => {
        state.archivedState = FAILED;
        state.archivedClasses = [];
        state.error =
          action.payload ?? 'Failed to load archived Google Classroom classes';
      })
      .addCase(linkGoogleClassroomCourse.pending, (state, action) => {
        state.linkState = LOADING;
        state.linkingCourseId = action.meta.arg.googleCourseId;
        state.error = null;
      })
      .addCase(linkGoogleClassroomCourse.fulfilled, (state, action) => {
        state.linkState = SUCCEEDED;
        state.linkingCourseId = null;
        const mapping = action.payload;
        state.courses = state.courses.map((course) =>
          course.id === mapping.googleCourseId
            ? {
                ...course,
                linked: true,
                archived: false,
                mappingId: mapping.id,
                classId: mapping.classId,
                className: mapping.googleCourseName ?? course.className,
                lastRosterSyncedAt:
                  mapping.lastRosterSyncedAt ??
                  mapping.roster?.lastRosterSyncedAt ??
                  course.lastRosterSyncedAt ??
                  null,
              }
            : course
        );
        state.archivedClasses = state.archivedClasses.filter(
          (cls) => cls.classId !== mapping.classId
        );
      })
      .addCase(linkGoogleClassroomCourse.rejected, (state, action) => {
        state.linkState = FAILED;
        state.linkingCourseId = null;
        state.error =
          action.payload ?? 'Failed to link Google Classroom course';
      })
      .addCase(bulkLinkGoogleClassroomCourses.pending, (state) => {
        state.bulkLinkState = LOADING;
        state.error = null;
      })
      .addCase(bulkLinkGoogleClassroomCourses.fulfilled, (state, action) => {
        state.bulkLinkState = SUCCEEDED;
        for (const result of action.payload.results) {
          if (!result.success || !result.mapping) continue;
          const mapping = result.mapping;
          state.courses = state.courses.map((course) =>
            course.id === mapping.googleCourseId
              ? {
                  ...course,
                  linked: true,
                  archived: false,
                  mappingId: mapping.id,
                  classId: mapping.classId,
                  className: mapping.googleCourseName ?? course.className,
                  lastRosterSyncedAt:
                    mapping.lastRosterSyncedAt ??
                    course.lastRosterSyncedAt ??
                    null,
                }
              : course
          );
        }
      })
      .addCase(bulkLinkGoogleClassroomCourses.rejected, (state, action) => {
        state.bulkLinkState = FAILED;
        state.error =
          action.payload ?? 'Failed to link Google Classroom courses';
      })
      .addCase(unlinkGoogleClassroomCourse.pending, (state, action) => {
        state.unlinkState = LOADING;
        state.unlinkingMappingId = action.meta.arg.mappingId;
        state.error = null;
      })
      .addCase(unlinkGoogleClassroomCourse.fulfilled, (state, action) => {
        state.unlinkState = SUCCEEDED;
        state.unlinkingMappingId = null;
        const { mappingId, classId, className } = action.payload;
        const matched = state.courses.find(
          (course) => course.mappingId === mappingId
        );
        state.courses = state.courses.map((course) =>
          course.mappingId === mappingId
            ? {
                ...course,
                linked: false,
                mappingId: null,
                classId: classId ?? course.classId,
                className: className ?? course.className,
                archived: true,
                lastRosterSyncedAt: null,
              }
            : course
        );
        const archivedClassId = classId ?? matched?.classId ?? null;
        if (archivedClassId) {
          const exists = state.archivedClasses.some(
            (c) => c.classId === archivedClassId
          );
          if (!exists) {
            state.archivedClasses = [
              {
                classId: archivedClassId,
                className:
                  className ??
                  matched?.className ??
                  matched?.name ??
                  archivedClassId,
                googleCourseId: matched?.id ?? null,
                googleCourseName: matched?.name ?? null,
                courseExists: true,
                archivedAt: new Date().toISOString(),
              },
              ...state.archivedClasses,
            ];
          }
        }
      })
      .addCase(unlinkGoogleClassroomCourse.rejected, (state, action) => {
        state.unlinkState = FAILED;
        state.unlinkingMappingId = null;
        state.error =
          action.payload ?? 'Failed to unlink Google Classroom course';
      })
      .addCase(syncGoogleClassroomRoster.pending, (state, action) => {
        state.rosterSyncState = LOADING;
        state.syncingMappingId = action.meta.arg.mappingId;
        state.error = null;
      })
      .addCase(syncGoogleClassroomRoster.fulfilled, (state, action) => {
        state.rosterSyncState = SUCCEEDED;
        state.syncingMappingId = null;
        const result = action.payload;
        state.courses = state.courses.map((course) =>
          course.mappingId === result.mappingId
            ? {
                ...course,
                lastRosterSyncedAt: result.lastRosterSyncedAt,
              }
            : course
        );
      })
      .addCase(syncGoogleClassroomRoster.rejected, (state, action) => {
        state.rosterSyncState = FAILED;
        state.syncingMappingId = null;
        state.error =
          action.payload ?? 'Failed to sync Google Classroom roster';
        // Token expired mid-sync → mark connection so UI shows reconnect prompt.
        if (
          isGoogleClassroomReauthMessage(action.payload) &&
          state.status?.connected
        ) {
          state.status = {
            ...state.status,
            status: 'error',
          };
        }
      });
  },
});

export const {
  resetGoogleClassroomError,
  clearGoogleClassroomStatus,
  clearGoogleProvisionResult,
} = googleClassroomSlice.actions;

export const selectGoogleClassroomStatus = (state: RootState) =>
  state.GoogleClassroom.status;
export const selectGoogleClassroomStatusState = (state: RootState) =>
  state.GoogleClassroom.statusState;
export const selectGoogleClassroomConnectState = (state: RootState) =>
  state.GoogleClassroom.connectState;
export const selectGoogleClassroomDisconnectState = (state: RootState) =>
  state.GoogleClassroom.disconnectState;
export const selectGoogleClassroomError = (state: RootState) =>
  state.GoogleClassroom.error;
export const selectGoogleClassroomCourses = (state: RootState) =>
  state.GoogleClassroom.courses;
export const selectGoogleClassroomCoursesState = (state: RootState) =>
  state.GoogleClassroom.coursesState;
export const selectGoogleProvisionState = (state: RootState) =>
  state.GoogleClassroom.provisionState;
export const selectGoogleArchivedClasses = (state: RootState) =>
  state.GoogleClassroom.archivedClasses;
export const selectGoogleArchivedState = (state: RootState) =>
  state.GoogleClassroom.archivedState;
export const selectGoogleClassroomLinkState = (state: RootState) =>
  state.GoogleClassroom.linkState;
export const selectGoogleClassroomUnlinkState = (state: RootState) =>
  state.GoogleClassroom.unlinkState;
export const selectGoogleBulkLinkState = (state: RootState) =>
  state.GoogleClassroom.bulkLinkState;
export const selectGoogleLinkingCourseId = (state: RootState) =>
  state.GoogleClassroom.linkingCourseId;
export const selectGoogleUnlinkingMappingId = (state: RootState) =>
  state.GoogleClassroom.unlinkingMappingId;
export const selectGoogleClassroomRosterSyncState = (state: RootState) =>
  state.GoogleClassroom.rosterSyncState;
export const selectGoogleSyncingMappingId = (state: RootState) =>
  state.GoogleClassroom.syncingMappingId;

export default googleClassroomSlice.reducer;
