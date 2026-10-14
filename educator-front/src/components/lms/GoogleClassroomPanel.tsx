import {
  cloneElement,
  isValidElement,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  Archive,
  BookOpen,
  Link2,
  Loader2,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { toast } from '../common/Toast';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { patchLoginUser } from '../../redux/auth/LoginRedux';
import {
  isGoogleClassroomFeatureDisabledMessage,
  markGoogleClassroomDisabledLocally,
  resolveEducatorGcSchoolOptions,
} from '../../utils/googleClassroomAccess';
import {
  bulkLinkGoogleClassroomCourses,
  clearGoogleClassroomStatus,
  resetGoogleClassroomError,
  clearGoogleProvisionResult,
  disconnectGoogleClassroom,
  fetchArchivedGoogleClasses,
  fetchGoogleClassroomConnection,
  initiateGoogleClassroomConnect,
  linkGoogleClassroomCourse,
  provisionGoogleClassroomCourses,
  selectGoogleArchivedClasses,
  selectGoogleArchivedState,
  selectGoogleBulkLinkState,
  selectGoogleClassroomConnectState,
  selectGoogleClassroomCourses,
  selectGoogleClassroomCoursesState,
  selectGoogleClassroomDisconnectState,
  selectGoogleClassroomError,
  selectGoogleClassroomStatus,
  selectGoogleClassroomStatusState,
  selectGoogleLinkingCourseId,
  selectGoogleProvisionState,
  selectGoogleSyncingMappingId,
  selectGoogleUnlinkingMappingId,
  syncGoogleClassroomRoster,
  unlinkGoogleClassroomCourse,
  type GoogleArchivedClass,
  type GoogleClassroomCourse,
  type GoogleProvisionItem,
} from '../../redux/lms/GoogleClassroomRedux';
import { selectCurrentUser } from '../../redux/auth/LoginRedux';
import {
  GetSchoolRequest,
  selectSortedSchools,
} from '../../redux/schools/GetSchoolsRedux';
import { getParsedUser } from '../../utils/storage';
import { FAILED } from '../../utils/constants';
import loginEn from '../../locales/auth/login/en.json';
import loginEs from '../../locales/auth/login/es.json';
import GoogleCourseLinkModal from './GoogleCourseLinkModal';

type SupportedLang = 'en' | 'es';
const LANGUAGE_STORAGE_KEY = 'app_language';

const GOOGLE_OAUTH_REASON_MESSAGES: Record<
  string,
  keyof typeof loginEn.lmsIntegration
> = {
  provider_denied: 'googleClassroomErrorProviderDenied',
  missing_code: 'googleClassroomErrorMissingCode',
  invalid_or_expired_state: 'googleClassroomErrorInvalidState',
  token_exchange_failed: 'googleClassroomErrorTokenExchange',
  callback_failed: 'googleClassroomErrorCallback',
  google_email_mismatch: 'googleClassroomErrorEmailMismatch',
};

const getStoredLanguage = (): SupportedLang => {
  if (typeof window === 'undefined') return 'en';
  const saved = localStorage.getItem(LANGUAGE_STORAGE_KEY)?.toLowerCase();
  return saved === 'es' ? 'es' : 'en';
};

const formatLocaleText = (
  template: string,
  vars: Record<string, string | number>
) =>
  template.replace(/\{\{(\w+)\}\}/g, (_m, key: string) =>
    String(vars[key] ?? '')
  );

function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  const fieldId = useId();
  const hintId = `${fieldId}-hint`;

  return (
    <div className="flex flex-col gap-2.5">
      <div className="space-y-1">
        <label
          htmlFor={fieldId}
          className="block text-sm leading-5 font-semibold text-stone-800"
        >
          {label}
          {required ? (
            <span aria-hidden="true" className="ml-0.5 text-[#ED621F]">
              *
            </span>
          ) : null}
        </label>
        {hint ? (
          <p id={hintId} className="text-xs leading-5 text-stone-500">
            {hint}
          </p>
        ) : null}
      </div>
      {isValidElement(children)
        ? cloneElement(
            children as React.ReactElement<Record<string, unknown>>,
            {
              id: fieldId,
              'aria-required': required ? true : undefined,
              'aria-describedby': hint ? hintId : undefined,
            }
          )
        : children}
    </div>
  );
}

const inputClassName =
  'w-full rounded-lg border border-stone-200 bg-white px-3.5 py-3 text-sm leading-5 text-stone-900 placeholder:text-stone-400 shadow-sm transition focus:border-[#ED621F] focus:outline-none focus:ring-2 focus:ring-[#ED621F]/20';

type PanelTab = 'courses' | 'archived';

type GoogleClassroomPanelProps = {
  /** When true, show the admin school dropdown. Educators use their school automatically. */
  showSchoolSelector?: boolean;
};

export default function GoogleClassroomPanel({
  showSchoolSelector = false,
}: GoogleClassroomPanelProps) {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const currentUser = useAppSelector(selectCurrentUser);
  const schools = useAppSelector(selectSortedSchools);
  const googleStatus = useAppSelector(selectGoogleClassroomStatus);
  const googleStatusState = useAppSelector(selectGoogleClassroomStatusState);
  const googleConnectState = useAppSelector(selectGoogleClassroomConnectState);
  const googleDisconnectState = useAppSelector(
    selectGoogleClassroomDisconnectState
  );
  const googleError = useAppSelector(selectGoogleClassroomError);
  const googleCourses = useAppSelector(selectGoogleClassroomCourses);
  const googleCoursesState = useAppSelector(selectGoogleClassroomCoursesState);
  const googleProvisionState = useAppSelector(selectGoogleProvisionState);
  const googleArchivedClasses = useAppSelector(selectGoogleArchivedClasses);
  const googleArchivedState = useAppSelector(selectGoogleArchivedState);
  const googleBulkLinkState = useAppSelector(selectGoogleBulkLinkState);
  const googleLinkingCourseId = useAppSelector(selectGoogleLinkingCourseId);
  const googleUnlinkingMappingId = useAppSelector(
    selectGoogleUnlinkingMappingId
  );
  const googleSyncingMappingId = useAppSelector(selectGoogleSyncingMappingId);

  const [googleSelectedSchoolId, setGoogleSelectedSchoolId] = useState('');
  const [activeTab, setActiveTab] = useState<PanelTab>('courses');
  const [linkModalOpen, setLinkModalOpen] = useState(false);
  const [linkModalItems, setLinkModalItems] = useState<GoogleProvisionItem[]>(
    []
  );
  const handledGoogleReturnRef = useRef<string | null>(null);
  const provisionedForSchoolRef = useRef<string | null>(null);

  const language = getStoredLanguage();
  const locale = language === 'es' ? loginEs : loginEn;
  const lmsLocale = locale.lmsIntegration;

  useEffect(() => {
    dispatch(resetGoogleClassroomError());
  }, [dispatch]);

  const role = useMemo(() => {
    const user = (currentUser as Record<string, unknown> | null) ?? null;
    const roleValue = user?.role;
    if (typeof roleValue === 'string') {
      return roleValue.toLowerCase();
    }
    if (roleValue && typeof roleValue === 'object') {
      const roleName = (roleValue as Record<string, unknown>).role_name;
      return typeof roleName === 'string' ? roleName.toLowerCase() : '';
    }
    return '';
  }, [currentUser]);

  const isAdmin = role === 'district admin' || role === 'admin';
  const cookieUser = getParsedUser() as {
    school?: {
      id?: string;
      school_name?: string;
      google_classroom_enabled?: boolean;
    };
    schools?: Array<{
      id?: string;
      school_name?: string;
      google_classroom_enabled?: boolean;
      googleClassroomEnabled?: boolean;
    }>;
  } | null;
  const educatorSchoolId =
    (currentUser as { school?: { id?: string } } | null)?.school?.id ??
    cookieUser?.school?.id ??
    '';
  const educatorGcSchools = useMemo(
    () =>
      resolveEducatorGcSchoolOptions(
        currentUser as Record<string, unknown> | null,
        cookieUser as Record<string, unknown> | null
      ),
    [cookieUser, currentUser]
  );
  const adminGcSchools = useMemo(
    () => schools.filter((school) => school.google_classroom_enabled === true),
    [schools]
  );
  const googleSchoolOptions = isAdmin ? adminGcSchools : educatorGcSchools;
  const showGoogleSchoolSelector =
    showSchoolSelector || isAdmin || educatorGcSchools.length > 1;
  const googleSchoolId = googleSelectedSchoolId.trim();
  const googleConnected = Boolean(
    googleStatus?.connected &&
    (!googleSchoolId || googleStatus.schoolId === googleSchoolId)
  );
  const googleEmail = googleStatus?.googleAccountEmail?.trim() || '';
  const educatorLoginEmail =
    typeof currentUser?.email === 'string' ? currentUser.email.trim() : '';
  const googleConnectedEmailMismatch =
    googleConnected &&
    Boolean(googleEmail) &&
    Boolean(educatorLoginEmail) &&
    googleEmail.toLowerCase() !== educatorLoginEmail.toLowerCase();
  const googleNeedsReauth = googleStatus?.status === 'error';
  const googleStatusLoading = googleStatusState === 'loading';
  const googleConnecting = googleConnectState === 'loading';
  const googleDisconnecting = googleDisconnectState === 'loading';
  const googleCoursesLoading =
    googleCoursesState === 'loading' || googleProvisionState === 'loading';
  const googleBulkLinking = googleBulkLinkState === 'loading';
  const canConnectGoogle =
    Boolean(googleSchoolId) && !googleConnecting && !googleStatusLoading;

  const visibleCourses = useMemo(
    () => googleCourses.filter((course) => !course.archived),
    [googleCourses]
  );

  useEffect(() => {
    if (!isGoogleClassroomFeatureDisabledMessage(googleError)) {
      return;
    }
    if (!googleSchoolId || googleStatusState !== FAILED) {
      return;
    }
    const updates = markGoogleClassroomDisabledLocally(googleSchoolId);
    dispatch(patchLoginUser(updates));
    if (!showSchoolSelector && updates.google_classroom_enabled === false) {
      navigate('/educator-dashboard', { replace: true });
    }
  }, [
    dispatch,
    googleError,
    googleSchoolId,
    googleStatusState,
    navigate,
    showSchoolSelector,
  ]);

  useEffect(() => {
    if (isAdmin) {
      void dispatch(GetSchoolRequest());
    }
  }, [dispatch, isAdmin]);

  useEffect(() => {
    if (!isAdmin) {
      if (!googleSelectedSchoolId && educatorGcSchools.length > 0) {
        const preferred =
          educatorGcSchools.find((s) => s.id === educatorSchoolId)?.id ??
          educatorGcSchools[0]?.id ??
          '';
        if (preferred) {
          setGoogleSelectedSchoolId(preferred);
        }
      }
      return;
    }
    if (adminGcSchools.length > 0 && !googleSelectedSchoolId) {
      const firstAdminSchoolId = adminGcSchools[0]?.id ?? '';
      if (firstAdminSchoolId) {
        setGoogleSelectedSchoolId(firstAdminSchoolId);
      }
    }
  }, [
    adminGcSchools,
    educatorGcSchools,
    educatorSchoolId,
    googleSelectedSchoolId,
    isAdmin,
  ]);

  useEffect(() => {
    if (!googleSelectedSchoolId || googleSchoolOptions.length === 0) {
      return;
    }
    const stillValid = googleSchoolOptions.some(
      (school) => school.id === googleSelectedSchoolId
    );
    if (!stillValid) {
      setGoogleSelectedSchoolId(googleSchoolOptions[0]?.id ?? '');
    }
  }, [googleSchoolOptions, googleSelectedSchoolId]);

  useEffect(() => {
    if (!googleSchoolId) {
      dispatch(clearGoogleClassroomStatus());
      provisionedForSchoolRef.current = null;
      return;
    }
    provisionedForSchoolRef.current = null;
    void dispatch(fetchGoogleClassroomConnection({ schoolId: googleSchoolId }));
  }, [dispatch, googleSchoolId]);

  const runProvisionAndMaybeOpenModal = useCallback(
    async (options?: { fromResync?: boolean }) => {
      if (!googleSchoolId) return;
      try {
        const result = await dispatch(
          provisionGoogleClassroomCourses({ schoolId: googleSchoolId })
        ).unwrap();
        void dispatch(fetchArchivedGoogleClasses({ schoolId: googleSchoolId }));

        const linkableNew = result.items.filter(
          (item) => !item.linked && !item.archived && item.isNew
        );
        // Auto-open only for newly provisioned classes (connect / re-sync).
        // Pending unlinked classes stay linkable from the courses list without a modal every visit.
        if (linkableNew.length > 0) {
          setLinkModalItems(linkableNew);
          setLinkModalOpen(true);
        } else if (options?.fromResync) {
          toast.success(lmsLocale.googleClassroomCoursesUpToDate);
        }

        if (result.archivedMatchCount > 0) {
          toast.success(
            formatLocaleText(lmsLocale.googleClassroomArchivedMatchesHint, {
              count: result.archivedMatchCount,
            })
          );
        }
      } catch (err) {
        if (isGoogleReauthError(err)) {
          handleGoogleReauthError();
          return;
        }
        toast.error(
          typeof err === 'string'
            ? err
            : lmsLocale.googleClassroomProvisionFailed
        );
      }
    },
    [dispatch, googleSchoolId, lmsLocale]
  );

  useEffect(() => {
    if (!googleSchoolId) {
      return;
    }
    // Archived Google classes are available with or without an active OAuth connection.
    void dispatch(fetchArchivedGoogleClasses({ schoolId: googleSchoolId }));
  }, [dispatch, googleSchoolId]);

  useEffect(() => {
    if (!googleSchoolId || !googleConnected || googleNeedsReauth) {
      return;
    }
    if (provisionedForSchoolRef.current === googleSchoolId) {
      return;
    }
    provisionedForSchoolRef.current = googleSchoolId;
    void runProvisionAndMaybeOpenModal();
  }, [
    googleConnected,
    googleNeedsReauth,
    googleSchoolId,
    runProvisionAndMaybeOpenModal,
  ]);

  useEffect(() => {
    const googleClassroom = searchParams.get('googleClassroom');
    if (!googleClassroom) return;

    const reason = searchParams.get('reason') ?? '';
    const returnedSchoolId = searchParams.get('schoolId') ?? '';
    const handleKey = `${googleClassroom}|${reason}|${returnedSchoolId}`;
    if (handledGoogleReturnRef.current === handleKey) return;
    handledGoogleReturnRef.current = handleKey;

    if (returnedSchoolId) {
      setGoogleSelectedSchoolId(returnedSchoolId);
      provisionedForSchoolRef.current = null;
    }

    if (googleClassroom === 'connected') {
      toast.success(lmsLocale.googleClassroomConnectSuccess);
      const schoolIdForStatus = returnedSchoolId || googleSchoolId;
      if (schoolIdForStatus) {
        void dispatch(
          fetchGoogleClassroomConnection({ schoolId: schoolIdForStatus })
        );
      }
    } else if (googleClassroom === 'error') {
      const messageKey = GOOGLE_OAUTH_REASON_MESSAGES[reason];
      const message = messageKey
        ? String(
            lmsLocale[messageKey as keyof typeof lmsLocale] ??
              lmsLocale.googleClassroomErrorCallback
          )
        : lmsLocale.googleClassroomErrorCallback;
      toast.error(message);
    }

    const next = new URLSearchParams(searchParams);
    next.delete('googleClassroom');
    next.delete('reason');
    next.delete('schoolId');
    setSearchParams(next, { replace: true });
  }, [dispatch, googleSchoolId, lmsLocale, searchParams, setSearchParams]);

  const isGoogleReauthError = (err: unknown) => {
    const message = typeof err === 'string' ? err : '';
    return /reconnect google classroom|authorization expired/i.test(message);
  };

  const handleGoogleReauthError = () => {
    toast.error(lmsLocale.googleClassroomTokenExpired);
    if (googleSchoolId) {
      void dispatch(
        fetchGoogleClassroomConnection({ schoolId: googleSchoolId })
      );
    }
  };

  const handleGoogleConnect = async () => {
    if (!googleSchoolId) {
      toast.error(lmsLocale.googleClassroomSelectSchool);
      return;
    }
    try {
      const result = await dispatch(
        initiateGoogleClassroomConnect({ schoolId: googleSchoolId })
      ).unwrap();
      window.location.assign(result.authorizationUrl);
    } catch (err) {
      toast.error(
        typeof err === 'string' ? err : lmsLocale.googleClassroomConnectFailed
      );
    }
  };

  const handleGoogleDisconnect = async () => {
    if (!googleSchoolId) {
      toast.error(lmsLocale.googleClassroomSelectSchool);
      return;
    }
    try {
      await dispatch(
        disconnectGoogleClassroom({ schoolId: googleSchoolId })
      ).unwrap();
      setLinkModalOpen(false);
      setLinkModalItems([]);
      provisionedForSchoolRef.current = null;
      void dispatch(fetchArchivedGoogleClasses({ schoolId: googleSchoolId }));
      setActiveTab('archived');
      toast.success(lmsLocale.googleClassroomDisconnectSuccess);
    } catch (err) {
      toast.error(
        typeof err === 'string'
          ? err
          : lmsLocale.googleClassroomDisconnectFailed
      );
    }
  };

  const handleResyncCourses = async () => {
    await runProvisionAndMaybeOpenModal({ fromResync: true });
  };

  const handleCloseLinkModal = () => {
    setLinkModalOpen(false);
    dispatch(clearGoogleProvisionResult());
  };

  const handleBulkLinkSelected = async (
    courses: Array<{
      googleCourseId: string;
      googleCourseName: string;
      googleCourseSection?: string;
      googleCourseOwnerId?: string;
    }>
  ) => {
    if (!googleSchoolId || courses.length === 0) {
      handleCloseLinkModal();
      return;
    }
    try {
      const result = await dispatch(
        bulkLinkGoogleClassroomCourses({
          schoolId: googleSchoolId,
          courses,
        })
      ).unwrap();
      const successCount = result.results.filter((r) => r.success).length;
      const failCount = result.results.length - successCount;
      if (successCount > 0) {
        toast.success(
          formatLocaleText(lmsLocale.googleClassroomBulkLinkSuccess, {
            count: successCount,
          })
        );
      }
      if (failCount > 0) {
        toast.error(
          formatLocaleText(lmsLocale.googleClassroomBulkLinkPartialFail, {
            count: failCount,
          })
        );
      }
      handleCloseLinkModal();
      void dispatch(fetchArchivedGoogleClasses({ schoolId: googleSchoolId }));
    } catch (err) {
      if (isGoogleReauthError(err)) {
        handleGoogleReauthError();
        return;
      }
      toast.error(
        typeof err === 'string' ? err : lmsLocale.googleClassroomLinkFailed
      );
    }
  };

  const handleLinkGoogleCourse = async (course: GoogleClassroomCourse) => {
    if (!googleSchoolId) {
      return;
    }
    try {
      await dispatch(
        linkGoogleClassroomCourse({
          schoolId: googleSchoolId,
          googleCourseId: course.id,
          googleCourseName: course.name,
          googleCourseSection: course.section ?? undefined,
        })
      ).unwrap();
      toast.success(lmsLocale.googleClassroomLinkSuccess);
    } catch (err) {
      if (isGoogleReauthError(err)) {
        handleGoogleReauthError();
        return;
      }
      toast.error(
        typeof err === 'string' ? err : lmsLocale.googleClassroomLinkFailed
      );
    }
  };

  const handleUnlinkGoogleCourse = async (course: GoogleClassroomCourse) => {
    if (!googleSchoolId || !course.mappingId) return;
    try {
      await dispatch(
        unlinkGoogleClassroomCourse({
          schoolId: googleSchoolId,
          mappingId: course.mappingId,
          classId: course.classId,
          className: course.className,
        })
      ).unwrap();
      toast.success(lmsLocale.googleClassroomUnlinkSuccess);
      void dispatch(fetchArchivedGoogleClasses({ schoolId: googleSchoolId }));
    } catch (err) {
      if (isGoogleReauthError(err)) {
        handleGoogleReauthError();
        return;
      }
      toast.error(
        typeof err === 'string' ? err : lmsLocale.googleClassroomUnlinkFailed
      );
    }
  };

  const formatRosterSyncedAt = (iso: string | null) => {
    if (!iso) return lmsLocale.googleClassroomRosterNeverSynced;
    const parsed = new Date(iso);
    if (Number.isNaN(parsed.getTime())) {
      return lmsLocale.googleClassroomRosterNeverSynced;
    }
    return formatLocaleText(lmsLocale.googleClassroomRosterLastSynced, {
      time: parsed.toLocaleString(language === 'es' ? 'es' : 'en'),
    });
  };

  const handleSyncGoogleRoster = async (course: GoogleClassroomCourse) => {
    if (!googleSchoolId || !course.mappingId) return;
    try {
      await dispatch(
        syncGoogleClassroomRoster({
          schoolId: googleSchoolId,
          mappingId: course.mappingId,
        })
      ).unwrap();
      toast.success(lmsLocale.googleClassroomRosterSyncSuccess);
    } catch (err) {
      if (isGoogleReauthError(err)) {
        handleGoogleReauthError();
        return;
      }
      toast.error(
        typeof err === 'string'
          ? err
          : lmsLocale.googleClassroomRosterSyncFailed
      );
    }
  };

  const handleRelinkArchived = async (cls: GoogleArchivedClass) => {
    if (!googleSchoolId || !cls.googleCourseId) return;
    if (!googleConnected || googleNeedsReauth) {
      toast.error(lmsLocale.googleClassroomRelinkNeedsConnection);
      return;
    }
    try {
      await dispatch(
        linkGoogleClassroomCourse({
          schoolId: googleSchoolId,
          googleCourseId: cls.googleCourseId,
          googleCourseName: cls.googleCourseName ?? cls.className,
        })
      ).unwrap();
      toast.success(lmsLocale.googleClassroomRelinkSuccess);
      void dispatch(
        provisionGoogleClassroomCourses({ schoolId: googleSchoolId })
      );
      void dispatch(fetchArchivedGoogleClasses({ schoolId: googleSchoolId }));
      setActiveTab('courses');
    } catch (err) {
      if (isGoogleReauthError(err)) {
        handleGoogleReauthError();
        return;
      }
      toast.error(
        typeof err === 'string' ? err : lmsLocale.googleClassroomRelinkFailed
      );
    }
  };

  return (
    <section
      aria-labelledby="google-classroom-heading"
      className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm"
    >
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-stone-100 bg-stone-50/80 px-6 py-6">
        <div className="flex items-start gap-3.5">
          <div className="rounded-xl bg-emerald-600/10 p-2.5 text-emerald-700">
            <BookOpen size={20} aria-hidden="true" />
          </div>
          <div>
            <h2
              id="google-classroom-heading"
              className="text-lg leading-7 font-bold text-stone-900"
            >
              {lmsLocale.googleClassroomTitle}
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-500">
              {lmsLocale.googleClassroomDescription}
            </p>
          </div>
        </div>
        {googleStatusLoading ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-stone-100 px-3 py-1.5 text-xs leading-4 font-semibold text-stone-600 ring-1 ring-stone-200">
            <Loader2 size={13} aria-hidden="true" className="animate-spin" />
            {lmsLocale.googleClassroomLoadingStatus}
          </span>
        ) : googleConnected ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-xs leading-4 font-semibold text-emerald-700 ring-1 ring-emerald-200">
            <ShieldCheck size={13} aria-hidden="true" />
            {lmsLocale.googleClassroomConnected}
          </span>
        ) : (
          <span className="inline-flex items-center rounded-full bg-amber-50 px-3 py-1.5 text-xs leading-4 font-semibold text-amber-800 ring-1 ring-amber-200">
            {lmsLocale.googleClassroomNotConnected}
          </span>
        )}
      </div>

      <div className="space-y-4 px-6 py-6">
        {showGoogleSchoolSelector ? (
          <Field
            label={lmsLocale.googleClassroomSchool}
            required
            hint={lmsLocale.googleClassroomSchoolHint}
          >
            <select
              value={googleSelectedSchoolId}
              onChange={(e) => setGoogleSelectedSchoolId(e.target.value)}
              className={inputClassName}
            >
              <option value="">{lmsLocale.selectSchool}</option>
              {googleSchoolOptions.map((school) => (
                <option key={school.id} value={school.id}>
                  {school.school_name}
                </option>
              ))}
            </select>
          </Field>
        ) : null}

        {!googleSchoolId ? (
          <p className="text-sm leading-5 text-amber-800">
            {lmsLocale.googleClassroomSelectSchool}
          </p>
        ) : null}

        {googleStatusState === 'failed' && googleError ? (
          <p
            role="alert"
            className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
          >
            {googleError || lmsLocale.googleClassroomStatusFailed}
          </p>
        ) : null}

        {googleNeedsReauth ? (
          <p
            role="status"
            className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
          >
            {lmsLocale.googleClassroomTokenExpired}
          </p>
        ) : null}

        {googleConnectedEmailMismatch ? (
          <p
            role="alert"
            className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
          >
            {formatLocaleText(lmsLocale.googleClassroomConnectedEmailMismatch, {
              googleEmail,
              educatorEmail: educatorLoginEmail,
            })}
          </p>
        ) : null}

        {!googleConnected && !googleNeedsReauth && educatorLoginEmail ? (
          <p className="text-sm leading-5 text-stone-500">
            {formatLocaleText(lmsLocale.googleClassroomConnectEmailHint, {
              email: educatorLoginEmail,
            })}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-4">
          <p className="text-sm leading-5 text-stone-600">
            {googleStatusLoading
              ? lmsLocale.googleClassroomLoadingStatus
              : googleConnected
                ? googleEmail
                  ? formatLocaleText(lmsLocale.googleClassroomConnectedAs, {
                      email: googleEmail,
                    })
                  : lmsLocale.googleClassroomConnected
                : lmsLocale.googleClassroomNotConnected}
          </p>

          {googleConnected ? (
            <button
              type="button"
              onClick={handleGoogleDisconnect}
              disabled={
                googleDisconnecting || googleStatusLoading || !googleSchoolId
              }
              aria-busy={googleDisconnecting}
              className="inline-flex items-center gap-2 rounded-lg border border-stone-300 bg-white px-5 py-3 text-sm leading-5 font-semibold text-stone-800 shadow-sm transition hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {googleDisconnecting ? (
                <Loader2
                  size={16}
                  aria-hidden="true"
                  className="animate-spin"
                />
              ) : null}
              {googleDisconnecting
                ? lmsLocale.googleClassroomDisconnecting
                : lmsLocale.googleClassroomDisconnect}
            </button>
          ) : (
            <button
              type="button"
              onClick={handleGoogleConnect}
              disabled={!canConnectGoogle}
              aria-busy={googleConnecting}
              className="inline-flex items-center gap-2 rounded-lg bg-[#ED621F] px-5 py-3 text-sm leading-5 font-semibold text-white shadow-sm transition hover:bg-[#d45518] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {googleConnecting ? (
                <Loader2
                  size={16}
                  aria-hidden="true"
                  className="animate-spin"
                />
              ) : null}
              {googleConnecting
                ? lmsLocale.googleClassroomConnecting
                : lmsLocale.googleClassroomConnect}
            </button>
          )}
        </div>

        {googleSchoolId ? (
          <div className="space-y-4 border-t border-stone-100 pt-5">
            <div
              role="tablist"
              aria-label={lmsLocale.googleClassroomTabsLabel}
              className="flex flex-wrap gap-2 border-b border-stone-100 pb-3"
            >
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'courses'}
                onClick={() => setActiveTab('courses')}
                className={
                  activeTab === 'courses'
                    ? 'rounded-lg bg-stone-900 px-3.5 py-2 text-sm font-semibold text-white'
                    : 'rounded-lg bg-stone-100 px-3.5 py-2 text-sm font-semibold text-stone-700 hover:bg-stone-200'
                }
              >
                {lmsLocale.googleClassroomTabCourses}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'archived'}
                onClick={() => setActiveTab('archived')}
                className={
                  activeTab === 'archived'
                    ? 'inline-flex items-center gap-1.5 rounded-lg bg-stone-900 px-3.5 py-2 text-sm font-semibold text-white'
                    : 'inline-flex items-center gap-1.5 rounded-lg bg-stone-100 px-3.5 py-2 text-sm font-semibold text-stone-700 hover:bg-stone-200'
                }
              >
                <Archive size={14} aria-hidden="true" />
                {lmsLocale.googleClassroomTabArchived}
                {googleArchivedClasses.length > 0
                  ? ` (${googleArchivedClasses.length})`
                  : ''}
              </button>
            </div>

            {activeTab === 'courses' &&
            googleConnected &&
            !googleNeedsReauth ? (
              <div className="space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-sm leading-5 font-semibold text-stone-900">
                      {lmsLocale.googleClassroomCoursesTitle}
                    </h3>
                    <p className="mt-1 text-sm leading-5 text-stone-500">
                      {lmsLocale.googleClassroomCoursesHint}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleResyncCourses()}
                    disabled={googleCoursesLoading}
                    aria-busy={googleCoursesLoading}
                    className="inline-flex items-center gap-2 rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm leading-5 font-semibold text-stone-800 shadow-sm transition hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {googleCoursesLoading ? (
                      <Loader2
                        size={14}
                        aria-hidden="true"
                        className="animate-spin"
                      />
                    ) : null}
                    {lmsLocale.googleClassroomResyncCourses}
                  </button>
                </div>

                {googleCoursesLoading && visibleCourses.length === 0 ? (
                  <p className="text-sm leading-5 text-stone-600">
                    {lmsLocale.googleClassroomCoursesLoading}
                  </p>
                ) : null}

                {googleCoursesState === 'failed' ? (
                  <p
                    role="alert"
                    className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
                  >
                    {googleError || lmsLocale.googleClassroomCoursesFailed}
                  </p>
                ) : null}

                {!googleCoursesLoading &&
                googleCoursesState === 'succeeded' &&
                visibleCourses.length === 0 ? (
                  <p className="text-sm leading-5 text-stone-600">
                    {lmsLocale.googleClassroomCoursesEmpty}
                  </p>
                ) : null}

                {visibleCourses.length > 0 ? (
                  <ul className="divide-y divide-stone-100 overflow-hidden rounded-xl border border-stone-200">
                    {visibleCourses.map((course) => {
                      const isLinking = googleLinkingCourseId === course.id;
                      const isUnlinking =
                        Boolean(course.mappingId) &&
                        googleUnlinkingMappingId === course.mappingId;
                      const isSyncingRoster =
                        Boolean(course.mappingId) &&
                        googleSyncingMappingId === course.mappingId;
                      const classLabel =
                        course.className?.trim() || course.classId || '—';

                      return (
                        <li
                          key={course.id}
                          className="space-y-3 bg-white px-4 py-4 sm:px-5"
                        >
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate text-sm leading-5 font-semibold text-stone-900">
                                {course.name}
                              </p>
                              {course.section ? (
                                <p className="mt-1 text-xs leading-4 text-stone-500">
                                  {course.section}
                                </p>
                              ) : null}
                              {course.classId ? (
                                <p className="mt-1 text-xs leading-4 text-stone-500">
                                  {formatLocaleText(
                                    lmsLocale.googleClassroomAppClassLabel,
                                    { className: classLabel }
                                  )}
                                </p>
                              ) : null}
                            </div>
                            <span
                              className={
                                course.linked
                                  ? 'inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-1 text-xs leading-4 font-semibold text-emerald-700 ring-1 ring-emerald-200'
                                  : 'inline-flex items-center rounded-full bg-stone-100 px-2.5 py-1 text-xs leading-4 font-semibold text-stone-600 ring-1 ring-stone-200'
                              }
                            >
                              {course.linked
                                ? lmsLocale.googleClassroomCourseLinked
                                : lmsLocale.googleClassroomCourseNotLinked}
                            </span>
                          </div>

                          {course.linked ? (
                            <div className="flex flex-wrap items-center justify-between gap-3">
                              <div className="min-w-0 space-y-1">
                                <p className="text-sm leading-5 text-stone-600">
                                  {formatLocaleText(
                                    lmsLocale.googleClassroomLinkedToClass,
                                    { className: classLabel }
                                  )}
                                </p>
                                <p className="text-xs leading-4 text-stone-500">
                                  {formatRosterSyncedAt(
                                    course.lastRosterSyncedAt
                                  )}
                                </p>
                              </div>
                              <div className="flex flex-wrap items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() =>
                                    void handleSyncGoogleRoster(course)
                                  }
                                  disabled={
                                    isSyncingRoster ||
                                    isUnlinking ||
                                    Boolean(googleSyncingMappingId) ||
                                    !course.mappingId
                                  }
                                  aria-busy={isSyncingRoster}
                                  className="inline-flex items-center gap-2 rounded-lg bg-[#ED621F] px-4 py-2 text-sm leading-5 font-semibold text-white shadow-sm transition hover:bg-[#d45518] disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  {isSyncingRoster ? (
                                    <Loader2
                                      size={14}
                                      aria-hidden="true"
                                      className="animate-spin"
                                    />
                                  ) : (
                                    <Users size={14} aria-hidden="true" />
                                  )}
                                  {isSyncingRoster
                                    ? lmsLocale.googleClassroomSyncingRoster
                                    : lmsLocale.googleClassroomSyncRoster}
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    void handleUnlinkGoogleCourse(course)
                                  }
                                  disabled={
                                    isUnlinking ||
                                    isSyncingRoster ||
                                    !course.mappingId
                                  }
                                  aria-busy={isUnlinking}
                                  className="inline-flex items-center gap-2 rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm leading-5 font-semibold text-stone-800 shadow-sm transition hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  {isUnlinking ? (
                                    <Loader2
                                      size={14}
                                      aria-hidden="true"
                                      className="animate-spin"
                                    />
                                  ) : null}
                                  {isUnlinking
                                    ? lmsLocale.googleClassroomUnlinking
                                    : lmsLocale.googleClassroomUnlink}
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex flex-wrap items-center justify-end gap-2">
                              <button
                                type="button"
                                onClick={() =>
                                  void handleLinkGoogleCourse(course)
                                }
                                disabled={isLinking}
                                aria-busy={isLinking}
                                className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#ED621F] px-4 py-2.5 text-sm leading-5 font-semibold text-white shadow-sm transition hover:bg-[#d45518] disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                {isLinking ? (
                                  <Loader2
                                    size={14}
                                    aria-hidden="true"
                                    className="animate-spin"
                                  />
                                ) : (
                                  <Link2 size={14} aria-hidden="true" />
                                )}
                                {isLinking
                                  ? lmsLocale.googleClassroomLinking
                                  : lmsLocale.googleClassroomLink}
                              </button>
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                ) : null}
              </div>
            ) : null}

            {activeTab === 'courses' &&
            (!googleConnected || googleNeedsReauth) ? (
              <p className="text-sm leading-5 text-stone-600">
                {lmsLocale.googleClassroomConnectToManageCourses}
              </p>
            ) : null}

            {activeTab === 'archived' ? (
              <div className="space-y-4">
                <div>
                  <h3 className="text-sm leading-5 font-semibold text-stone-900">
                    {lmsLocale.googleClassroomArchivedTitle}
                  </h3>
                  <p className="mt-1 text-sm leading-5 text-stone-500">
                    {lmsLocale.googleClassroomArchivedHint}
                  </p>
                </div>

                {googleArchivedState === 'loading' &&
                googleArchivedClasses.length === 0 ? (
                  <p className="text-sm leading-5 text-stone-600">
                    {lmsLocale.googleClassroomArchivedLoading}
                  </p>
                ) : null}

                {googleArchivedState === 'succeeded' &&
                googleArchivedClasses.length === 0 ? (
                  <p className="text-sm leading-5 text-stone-600">
                    {lmsLocale.googleClassroomArchivedEmpty}
                  </p>
                ) : null}

                {googleArchivedClasses.length > 0 ? (
                  <ul className="divide-y divide-stone-100 overflow-hidden rounded-xl border border-stone-200">
                    {googleArchivedClasses.map((cls) => {
                      const isRelinking =
                        Boolean(cls.googleCourseId) &&
                        googleLinkingCourseId === cls.googleCourseId;
                      const canRelink =
                        googleConnected &&
                        !googleNeedsReauth &&
                        Boolean(cls.googleCourseId) &&
                        cls.courseExists !== false;

                      return (
                        <li
                          key={cls.classId}
                          className="flex flex-wrap items-center justify-between gap-3 bg-white px-4 py-4 sm:px-5"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-stone-900">
                              {cls.className}
                            </p>
                            {cls.googleCourseName ? (
                              <p className="mt-1 text-xs text-stone-500">
                                {formatLocaleText(
                                  lmsLocale.googleClassroomWasCourse,
                                  { courseName: cls.googleCourseName }
                                )}
                              </p>
                            ) : null}
                            {!googleConnected || googleNeedsReauth ? (
                              <p className="mt-1 text-xs text-amber-800">
                                {lmsLocale.googleClassroomRelinkNeedsConnection}
                              </p>
                            ) : cls.courseExists === false ? (
                              <p className="mt-1 text-xs text-amber-800">
                                {lmsLocale.googleClassroomCourseNoLongerExists}
                              </p>
                            ) : null}
                          </div>
                          <button
                            type="button"
                            onClick={() => void handleRelinkArchived(cls)}
                            disabled={!canRelink || isRelinking}
                            aria-busy={isRelinking}
                            className="inline-flex items-center gap-2 rounded-lg bg-[#ED621F] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#d45518] disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {isRelinking ? (
                              <Loader2
                                size={14}
                                aria-hidden="true"
                                className="animate-spin"
                              />
                            ) : (
                              <Link2 size={14} aria-hidden="true" />
                            )}
                            {isRelinking
                              ? lmsLocale.googleClassroomRelinking
                              : lmsLocale.googleClassroomRelink}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      <GoogleCourseLinkModal
        isOpen={linkModalOpen}
        items={linkModalItems}
        linking={googleBulkLinking}
        title={lmsLocale.googleClassroomLinkModalTitle}
        subtitle={lmsLocale.googleClassroomLinkModalSubtitle}
        googleCourseLabel={lmsLocale.googleClassroomModalGoogleCourse}
        appClassLabel={lmsLocale.googleClassroomModalAppClass}
        selectAllLabel={lmsLocale.googleClassroomSelectAll}
        selectNoneLabel={lmsLocale.googleClassroomSelectNone}
        linkSelectedLabel={lmsLocale.googleClassroomLinkSelected}
        notNowLabel={lmsLocale.googleClassroomNotNow}
        emptyLabel={lmsLocale.googleClassroomLinkModalEmpty}
        onClose={handleCloseLinkModal}
        onLinkSelected={(courses) => void handleBulkLinkSelected(courses)}
      />
    </section>
  );
}
