import {
  cloneElement,
  isValidElement,
  useEffect,
  useId,
  useMemo,
  useState,
  useCallback,
} from 'react';
import {
  Copy,
  Check,
  GraduationCap,
  ShieldCheck,
  BookOpen,
  Settings,
  Save,
  Loader2,
} from 'lucide-react';
import { PageHeader } from '../../../components/common/PageHeader';
import { toast } from '../../../components/common/Toast';
import { useAppDispatch, useAppSelector } from '../../../store/hooks';
import {
  fetchLtiMetadata,
  selectLtiMetadata,
  fetchEducatorLmsConfig,
  saveEducatorLmsConfig,
  selectSchoolLmsConfig,
  selectSaveConfigState,
  selectLmsError,
  resetSaveConfigState,
  type LmsPlatformType,
  type LmsToolType,
  type ConfigureLmsPayload,
} from '../../../redux/lms/LmsRedux';
import { selectCurrentUser } from '../../../redux/auth/LoginRedux';
import {
  GetSchoolRequest,
  selectSortedSchools,
} from '../../../redux/schools/GetSchoolsRedux';
import loginEn from '../../../locales/auth/login/en.json';
import loginEs from '../../../locales/auth/login/es.json';
import {
  buildCanvasEndpoints,
  buildMoodleEndpoints,
  lmsConfigFingerprint,
  normalizeLmsBaseUrl,
} from '../../../utils/lmsEndpoints';

type SupportedLang = 'en' | 'es';
const LANGUAGE_STORAGE_KEY = 'app_language';

const getStoredLanguage = (): SupportedLang => {
  if (typeof window === 'undefined') return 'en';
  const saved = localStorage.getItem(LANGUAGE_STORAGE_KEY)?.toLowerCase();
  return saved === 'es' ? 'es' : 'en';
};

function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  groupLabel,
}: {
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (next: T) => void;
  groupLabel: string;
}) {
  return (
    <div
      role="group"
      aria-label={groupLabel}
      className="inline-flex w-full max-w-md rounded-lg border border-stone-200 bg-stone-100/80 p-1.5"
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={`flex-1 rounded-md px-3.5 py-2.5 text-sm leading-5 font-semibold transition ${
              active
                ? 'bg-[#ED621F] text-white shadow-sm'
                : 'text-stone-600 hover:bg-white/70 hover:text-stone-900'
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

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

function CopyField({
  label,
  value,
  hint,
  failedToCopyMessage,
}: {
  label: string;
  value: string;
  hint?: string;
  failedToCopyMessage: string;
}) {
  const [copied, setCopied] = useState(false);
  const fieldId = useId();
  const labelId = `${fieldId}-label`;
  const hintId = `${fieldId}-hint`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      const locale = getStoredLanguage() === 'es' ? loginEs : loginEn;
      toast.success(`${label} ${locale.lmsIntegration.copied}`);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error(failedToCopyMessage);
    }
  };

  return (
    <div className="flex flex-col gap-2.5">
      <div className="space-y-1">
        <p
          id={labelId}
          className="block text-sm leading-5 font-semibold text-stone-800"
        >
          {label}
        </p>
        {hint ? (
          <p id={hintId} className="text-xs leading-5 text-stone-500">
            {hint}
          </p>
        ) : null}
      </div>

      <div
        role="group"
        aria-labelledby={labelId}
        aria-describedby={hint ? hintId : undefined}
        className="relative"
      >
        <div className="rounded-lg border border-stone-200 bg-stone-50 px-3.5 py-3 pr-12 font-mono text-xs leading-5 break-all text-stone-700">
          {value}
        </div>

        <button
          type="button"
          onClick={handleCopy}
          aria-label={copied ? `${label} copied` : `Copy ${label}`}
          className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md border border-stone-200 bg-white text-stone-600 transition hover:border-[#ED621F]/40 hover:text-[#ED621F]"
        >
          {copied ? (
            <Check size={15} aria-hidden="true" className="text-emerald-600" />
          ) : (
            <Copy size={15} aria-hidden="true" />
          )}
        </button>
      </div>
    </div>
  );
}

function PortalCard({
  title,
  description,
  icon,
  children,
  ready,
  copyAll,
  onCopyAll,
}: {
  title: string;
  description: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  ready: string;
  copyAll: string;
  onCopyAll: () => void;
}) {
  const accentStyles = 'from-[#ED621F]/12 to-orange-50 border-[#ED621F]/25';

  return (
    <div
      className={`overflow-hidden rounded-2xl border bg-white shadow-sm ${accentStyles.split(' ').pop()}`}
    >
      <div
        className={`border-b border-stone-100 bg-gradient-to-br ${accentStyles} px-6 py-5`}
      >
        <div className="flex items-start gap-3.5">
          <div className="rounded-xl bg-[#ED621F] p-2.5 text-white">{icon}</div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base leading-6 font-bold text-stone-900">
                {title}
              </h2>
              <span className="inline-flex items-center gap-1 rounded-full bg-white/80 px-2.5 py-1 text-[11px] leading-4 font-semibold text-emerald-700 ring-1 ring-emerald-200">
                <ShieldCheck size={12} aria-hidden="true" />
                {ready}
              </span>
            </div>
            <p className="mt-1.5 text-sm leading-5 text-stone-600">
              {description}
            </p>
          </div>
          <button
            type="button"
            onClick={onCopyAll}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs leading-4 font-semibold text-stone-700 transition hover:border-stone-300 hover:bg-stone-50"
          >
            <Copy size={14} aria-hidden="true" />
            {copyAll}
          </button>
        </div>
      </div>
      <div className="space-y-5 px-6 py-6">{children}</div>
    </div>
  );
}

function SkeletonCard() {
  return (
    <div
      aria-hidden="true"
      className="rounded-2xl border border-stone-200 bg-white p-6"
    >
      <div className="animate-pulse space-y-3">
        <div className="h-5 w-36 rounded bg-stone-200" />
        <div className="h-12 rounded-lg bg-stone-100" />
        <div className="h-12 rounded-lg bg-stone-100" />
        <div className="h-12 rounded-lg bg-stone-100" />
      </div>
    </div>
  );
}

export default function LMSIntegration() {
  const dispatch = useAppDispatch();
  const metadata = useAppSelector(selectLtiMetadata);
  const schoolConfig = useAppSelector(selectSchoolLmsConfig);
  const saveState = useAppSelector(selectSaveConfigState);
  const lmsError = useAppSelector(selectLmsError);
  const currentUser = useAppSelector(selectCurrentUser);
  const schools = useAppSelector(selectSortedSchools);
  const [clientId, setClientId] = useState('');
  const [issuerUrl, setIssuerUrl] = useState('');
  const [canvasBaseUrl, setCanvasBaseUrl] = useState('');
  const [deploymentId, setDeploymentId] = useState('');
  const [lmsApiToken, setLmsApiToken] = useState('');
  const [selectedSchoolId, setSelectedSchoolId] = useState('');
  const [lmsTab, setLmsTab] = useState<LmsPlatformType>('moodle');
  const isSaving = saveState === 'loading';

  const language = getStoredLanguage();
  const locale = language === 'es' ? loginEs : loginEn;
  const lmsLocale = locale.lmsIntegration;

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
  const isEducator = role === 'educator';
  const roleReady = isAdmin || isEducator;
  const educatorSchoolId =
    (currentUser as { school?: { id?: string } } | null)?.school?.id ?? '';

  useEffect(() => {
    if (!roleReady) return;
    void getMetadata();
  }, [dispatch, isAdmin, roleReady]);

  useEffect(() => {
    if (!schoolConfig) {
      setIssuerUrl('');
      setCanvasBaseUrl('');
      setClientId('');
      setDeploymentId('');
      setLmsApiToken('');
      return;
    }

    const type = (schoolConfig.lmsType || 'moodle').toLowerCase();
    const matchesTab =
      (lmsTab === 'canvas' && type === 'canvas') ||
      (lmsTab === 'moodle' && type !== 'canvas');

    if (!matchesTab) {
      setIssuerUrl('');
      setCanvasBaseUrl('');
      setClientId('');
      setDeploymentId('');
      setLmsApiToken('');
      return;
    }

    setIssuerUrl(
      schoolConfig.issuer ??
        schoolConfig.lmsBaseUrl ??
        schoolConfig.moodleUrl ??
        ''
    );
    setCanvasBaseUrl(schoolConfig.lmsBaseUrl ?? schoolConfig.moodleUrl ?? '');
    setClientId(schoolConfig.clientId ?? '');
    setDeploymentId(schoolConfig.deploymentId ?? '');
    setLmsApiToken('');
  }, [schoolConfig, lmsTab]);

  useEffect(() => {
    if (!roleReady) return;

    if (!isAdmin) {
      if (educatorSchoolId) {
        setSelectedSchoolId(educatorSchoolId);
      }
      void dispatch(
        fetchEducatorLmsConfig({
          toolType: 'educator',
        })
      ).unwrap();
      return;
    }

    if (isAdmin && schools.length > 0 && !selectedSchoolId) {
      const firstSchoolId = schools[0]?.id;
      if (firstSchoolId) {
        setSelectedSchoolId(firstSchoolId);
      }
    }
  }, [
    dispatch,
    educatorSchoolId,
    isAdmin,
    lmsTab,
    roleReady,
    schools,
    selectedSchoolId,
  ]);

  useEffect(() => {
    if (!roleReady || !isAdmin || !selectedSchoolId) {
      return;
    }

    void dispatch(
      fetchEducatorLmsConfig({
        schoolId: selectedSchoolId,
        toolType: 'educator',
      })
    ).unwrap();
  }, [dispatch, isAdmin, lmsTab, roleReady, selectedSchoolId]);

  useEffect(() => {
    if (saveState === 'succeeded') {
      toast.success(locale.toast.lmsSettingsSaved);
      if (lmsTab === 'canvas' && deploymentId.trim() && !lmsApiToken.trim()) {
        toast.warning(lmsLocale.canvasDeploymentVerifiedOnLaunch);
      }
      dispatch(resetSaveConfigState());
    } else if (saveState === 'failed') {
      toast.error(lmsError || locale.toast.failedToSaveLmsSettings);
      dispatch(resetSaveConfigState());
    }
  }, [
    deploymentId,
    dispatch,
    lmsApiToken,
    lmsLocale.canvasDeploymentVerifiedOnLaunch,
    lmsTab,
    locale.toast,
    saveState,
  ]);

  const buildConfigurePayload = useCallback((): ConfigureLmsPayload | null => {
    if (!selectedSchoolId) {
      toast.error(locale.toast.schoolRequired);
      return null;
    }
    if (!issuerUrl.trim()) {
      toast.error(locale.toast.issuerUrlRequired);
      return null;
    }
    if (!clientId.trim()) {
      toast.error(locale.toast.clientIdRequired);
      return null;
    }

    const normalizedIssuerUrl = normalizeLmsBaseUrl(issuerUrl);

    if (lmsTab === 'canvas') {
      if (!canvasBaseUrl.trim()) {
        toast.error(lmsLocale.canvasBaseUrlRequired);
        return null;
      }
      if (!deploymentId.trim()) {
        toast.error(lmsLocale.deploymentIdRequired);
        return null;
      }
      try {
        const endpoints = buildCanvasEndpoints(
          canvasBaseUrl,
          normalizedIssuerUrl
        );
        return {
          schoolId: selectedSchoolId,
          lmsType: 'canvas',
          toolType: 'educator',
          issuer: normalizedIssuerUrl,
          clientId: clientId.trim(),
          deploymentId: deploymentId.trim() || undefined,
          sharePii: schoolConfig?.sharePii ?? true,
          lmsApiToken: lmsApiToken.trim() || undefined,
          ...endpoints,
        };
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : lmsLocale.invalidCanvasIssuerUrl
        );
        return null;
      }
    }

    const endpoints = buildMoodleEndpoints(normalizedIssuerUrl);
    return {
      schoolId: selectedSchoolId,
      lmsType: 'moodle',
      toolType: 'educator',
      issuer: normalizedIssuerUrl,
      clientId: clientId.trim(),
      sharePii: schoolConfig?.sharePii ?? true,
      lmsApiToken: lmsApiToken.trim() || undefined,
      ...endpoints,
    };
  }, [
    canvasBaseUrl,
    clientId,
    deploymentId,
    issuerUrl,
    lmsApiToken,
    lmsLocale.canvasBaseUrlRequired,
    lmsLocale.invalidCanvasIssuerUrl,
    lmsTab,
    locale.toast.clientIdRequired,
    locale.toast.issuerUrlRequired,
    locale.toast.schoolRequired,
    schoolConfig?.sharePii,
    selectedSchoolId,
  ]);

  const currentFingerprint = useMemo(() => {
    try {
      if (!selectedSchoolId || !issuerUrl.trim() || !clientId.trim()) {
        return null;
      }
      if (lmsTab === 'canvas') {
        if (!canvasBaseUrl.trim()) {
          return null;
        }
        const endpoints = buildCanvasEndpoints(
          canvasBaseUrl,
          normalizeLmsBaseUrl(issuerUrl)
        );
        return lmsConfigFingerprint({
          schoolId: selectedSchoolId,
          lmsType: 'canvas',
          issuer: normalizeLmsBaseUrl(issuerUrl),
          clientId: clientId.trim(),
          deploymentId: deploymentId.trim(),
          lmsApiToken: lmsApiToken.trim() || undefined,
          ...endpoints,
        });
      }
      const endpoints = buildMoodleEndpoints(normalizeLmsBaseUrl(issuerUrl));
      return lmsConfigFingerprint({
        schoolId: selectedSchoolId,
        lmsType: 'moodle',
        issuer: normalizeLmsBaseUrl(issuerUrl),
        clientId: clientId.trim(),
        lmsApiToken: lmsApiToken.trim() || undefined,
        ...endpoints,
      });
    } catch {
      return null;
    }
  }, [
    canvasBaseUrl,
    clientId,
    deploymentId,
    issuerUrl,
    lmsApiToken,
    lmsTab,
    selectedSchoolId,
  ]);

  const savedFingerprint = useMemo(() => {
    if (!schoolConfig?.clientId || !selectedSchoolId) {
      return null;
    }
    const type = (schoolConfig.lmsType || 'moodle').toLowerCase();
    const matchesTab =
      (lmsTab === 'canvas' && type === 'canvas') ||
      (lmsTab === 'moodle' && type !== 'canvas');
    if (!matchesTab) {
      return null;
    }
    try {
      if (lmsTab === 'canvas') {
        const base = schoolConfig.lmsBaseUrl ?? schoolConfig.moodleUrl ?? '';
        if (!base) {
          return null;
        }
        const endpoints = buildCanvasEndpoints(
          base,
          normalizeLmsBaseUrl(schoolConfig.issuer)
        );
        return lmsConfigFingerprint({
          schoolId: selectedSchoolId,
          lmsType: 'canvas',
          issuer: normalizeLmsBaseUrl(schoolConfig.issuer),
          clientId: schoolConfig.clientId,
          deploymentId: schoolConfig.deploymentId ?? undefined,
          ...endpoints,
        });
      }
      const endpoints = buildMoodleEndpoints(
        normalizeLmsBaseUrl(schoolConfig.issuer)
      );
      return lmsConfigFingerprint({
        schoolId: selectedSchoolId,
        lmsType: 'moodle',
        issuer: normalizeLmsBaseUrl(schoolConfig.issuer),
        clientId: schoolConfig.clientId,
        ...endpoints,
      });
    } catch {
      return null;
    }
  }, [lmsTab, schoolConfig, selectedSchoolId]);

  /**
   * Verified = saved config exists for this platform tab and the form still matches it.
   * (One school stores Moodle OR Canvas — switching tabs to the other platform is Unverified.)
   */
  const savedConfigMatchesTab = useMemo(() => {
    if (!schoolConfig?.clientId) return false;
    const type = (schoolConfig.lmsType || 'moodle').toLowerCase();
    return (
      (lmsTab === 'canvas' && type === 'canvas') ||
      (lmsTab === 'moodle' && type !== 'canvas')
    );
  }, [lmsTab, schoolConfig]);

  const connectionVerified =
    savedConfigMatchesTab &&
    Boolean(currentFingerprint) &&
    Boolean(savedFingerprint) &&
    currentFingerprint === savedFingerprint;

  const getMetadata = async () => {
    try {
      await dispatch(fetchLtiMetadata()).unwrap();
      if (isAdmin) {
        await dispatch(GetSchoolRequest()).unwrap();
      } else {
        await dispatch(
          fetchEducatorLmsConfig({
            toolType: 'educator',
          })
        ).unwrap();
      }
    } catch {
      return;
    }
  };

  const handleSaveLmsSettings = async () => {
    const payload = buildConfigurePayload();
    if (!payload) return;

    try {
      // Save verifies on the backend; a new school's keys only exist after save, so no pre-test.
      await dispatch(saveEducatorLmsConfig(payload)).unwrap();

      const refreshParams = {
        schoolId: isAdmin ? selectedSchoolId : undefined,
        toolType: 'educator' as LmsToolType,
      };
      await dispatch(fetchEducatorLmsConfig(refreshParams)).unwrap();
    } catch {
      // Rejection is surfaced via test/save state + lms.error (useEffect toast).
    }
  };

  const copyEducatorConfig = async () => {
    if (!metadata) return;
    await navigator.clipboard.writeText(
      `${lmsLocale.initiateLoginUrl}: ${metadata.initiateLoginUrl}
     ${lmsLocale.redirectUri}: ${metadata.redirectUris?.[0]}
     ${lmsLocale.jwksUrl}: ${metadata.jwksUrl}
     ${lmsLocale.toolUri}: ${metadata.targetLinkUri}`
    );
    toast.success(lmsLocale.educatorConfigCopied);
  };

  return (
    <div className="relative min-h-full">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top_right,_rgba(237,98,31,0.08),_transparent_45%),radial-gradient(ellipse_at_bottom_left,_rgba(120,113,108,0.06),_transparent_40%)]"
      />

      <div className="mx-auto max-w-6xl space-y-8 p-6">
        <PageHeader title={lmsLocale.pageTitle} />

        <section className="overflow-hidden rounded-2xl border border-[#ED621F]/20 bg-gradient-to-br from-[#C2521A] via-[#B85A1C] to-[#A26807] text-white shadow-md">
          <div className="p-7">
            <div className="grid items-start gap-6 md:grid-cols-2 md:gap-8">
              <div className="space-y-3">
                <div className="inline-flex items-center gap-2 rounded-full bg-black/20 px-3 py-1 text-xs font-semibold tracking-wide uppercase">
                  <BookOpen size={14} aria-hidden="true" />
                  {lmsLocale.lti13Configuration}
                </div>
                <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
                  {lmsLocale.connectLmsMinutes}
                </h1>
                <p className="text-sm leading-6 text-orange-50/95">
                  {lmsLocale.registerPortalsDescription}
                </p>
              </div>

              <div className="rounded-xl bg-black/20 p-4 backdrop-blur-sm">
                <ol className="m-0 list-none space-y-3 p-0 text-sm leading-6 text-orange-50">
                  {[
                    lmsLocale.setupStep1,
                    lmsLocale.setupStep2,
                    lmsLocale.setupStep3,
                    lmsLocale.setupStep4,
                  ].map((step, index) => (
                    <li key={step} className="flex gap-3">
                      <span
                        aria-hidden="true"
                        className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/15 text-xs font-bold text-white"
                      >
                        {index + 1}
                      </span>
                      <span>{step}</span>
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          </div>
        </section>

        <p role="status" aria-live="polite" className="sr-only">
          {metadata
            ? 'LMS configuration loaded'
            : 'Loading LMS configuration, please wait'}
        </p>

        {!metadata ? (
          <div aria-busy="true">
            <SkeletonCard />
          </div>
        ) : (
          <div>
            <PortalCard
              title={lmsLocale.educatorPortal}
              description={lmsLocale.educatorPortalDescription}
              icon={<GraduationCap size={20} aria-hidden="true" />}
              ready={lmsLocale.ready}
              copyAll={lmsLocale.copyAll}
              onCopyAll={copyEducatorConfig}
            >
              <CopyField
                label={lmsLocale.toolUri}
                value={metadata.targetLinkUri}
                failedToCopyMessage={lmsLocale.failedToCopy}
                hint={lmsLocale.toolUriHintEducator}
              />
              <CopyField
                label={lmsLocale.initiateLoginUrl}
                value={metadata.initiateLoginUrl}
                failedToCopyMessage={lmsLocale.failedToCopy}
              />
              <CopyField
                label={lmsLocale.redirectUri}
                value={metadata.redirectUris?.[0] ?? ''}
                failedToCopyMessage={lmsLocale.failedToCopy}
              />
              <CopyField
                label={lmsLocale.jwksUrl}
                value={metadata.jwksUrl}
                hint={lmsLocale.jwksHintEducator}
                failedToCopyMessage={lmsLocale.failedToCopy}
              />
            </PortalCard>
          </div>
        )}

        <section className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-stone-100 bg-stone-50/80 px-6 py-6">
            <div className="flex items-start gap-3.5">
              <div className="rounded-xl bg-[#ED621F]/10 p-2.5 text-[#ED621F]">
                <Settings size={20} aria-hidden="true" />
              </div>
              <div>
                <h2 className="text-lg leading-7 font-bold text-stone-900">
                  {lmsLocale.lmsSettings}
                </h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-500">
                  {lmsLocale.lmsSettingsDescription}
                </p>
              </div>
            </div>
            {connectionVerified ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-xs leading-4 font-semibold text-emerald-700 ring-1 ring-emerald-200">
                <ShieldCheck size={13} aria-hidden="true" />
                {lmsLocale.verified}
              </span>
            ) : (
              <span className="inline-flex items-center rounded-full bg-amber-50 px-3 py-1.5 text-xs leading-4 font-semibold text-amber-800 ring-1 ring-amber-200">
                {lmsLocale.unverified}
              </span>
            )}
          </div>

          <div className="space-y-7 px-6 py-7">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
              <div className="space-y-2.5">
                <p className="text-xs leading-4 font-semibold tracking-wide text-stone-500 uppercase">
                  {lmsLocale.platform}
                </p>
                <SegmentedControl
                  groupLabel={lmsLocale.platform}
                  value={lmsTab}
                  onChange={setLmsTab}
                  options={[
                    { value: 'moodle', label: 'Moodle' },
                    { value: 'canvas', label: 'Canvas' },
                  ]}
                />
              </div>
            </div>

            <div className="grid items-start gap-6 md:grid-cols-2">
              {isAdmin ? (
                <Field
                  label={lmsLocale.school}
                  required
                  hint={
                    lmsTab === 'canvas'
                      ? lmsLocale.schoolHintCanvas
                      : lmsLocale.schoolHint
                  }
                >
                  <select
                    value={selectedSchoolId}
                    onChange={(e) => setSelectedSchoolId(e.target.value)}
                    className={inputClassName}
                  >
                    <option value="">{lmsLocale.selectSchool}</option>
                    {schools.map((school) => (
                      <option key={school.id} value={school.id}>
                        {school.school_name}
                      </option>
                    ))}
                  </select>
                </Field>
              ) : (
                <div className="md:col-span-2" />
              )}

              <Field
                label={lmsLocale.issuerUrl}
                required
                hint={
                  lmsTab === 'canvas'
                    ? lmsLocale.issuerUrlHintCanvas
                    : lmsLocale.issuerUrlHint
                }
              >
                <input
                  type="url"
                  value={issuerUrl}
                  onChange={(e) => setIssuerUrl(e.target.value)}
                  placeholder={
                    lmsTab === 'canvas'
                      ? 'https://canvas.instructure.com'
                      : lmsLocale.placeholderIssuerUrl
                  }
                  className={inputClassName}
                />
              </Field>

              {lmsTab === 'canvas' ? (
                <Field
                  label={lmsLocale.canvasBaseUrlLabel}
                  required
                  hint={lmsLocale.canvasBaseUrlHint}
                >
                  <input
                    type="url"
                    value={canvasBaseUrl}
                    onChange={(e) => setCanvasBaseUrl(e.target.value)}
                    placeholder={lmsLocale.canvasBaseUrlPlaceholder}
                    className={inputClassName}
                  />
                </Field>
              ) : null}

              <Field
                label={lmsLocale.clientId}
                required
                hint={
                  lmsTab === 'canvas'
                    ? lmsLocale.clientIdHintCanvas
                    : lmsLocale.clientIdHint
                }
              >
                <input
                  type="text"
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  placeholder={
                    lmsTab === 'canvas'
                      ? lmsLocale.clientIdPlaceholderCanvas
                      : lmsLocale.placeholderClientId
                  }
                  className={`${inputClassName} font-mono`}
                />
              </Field>

              {lmsTab === 'canvas' ? (
                <Field
                  label={lmsLocale.deploymentIdLabel}
                  required
                  hint={lmsLocale.deploymentIdHint}
                >
                  <input
                    type="text"
                    value={deploymentId}
                    onChange={(e) => setDeploymentId(e.target.value)}
                    placeholder={lmsLocale.deploymentIdPlaceholder}
                    className={`${inputClassName} font-mono`}
                  />
                </Field>
              ) : null}

              <Field
                label={
                  lmsTab === 'canvas'
                    ? lmsLocale.canvasApiTokenLabel
                    : lmsLocale.lmsWebServiceToken
                }
                hint={
                  lmsTab === 'canvas'
                    ? lmsLocale.canvasApiTokenHint
                    : lmsLocale.lmsWebServiceTokenHint
                }
              >
                <input
                  type="password"
                  value={lmsApiToken}
                  onChange={(e) => setLmsApiToken(e.target.value)}
                  placeholder={
                    lmsTab === 'canvas'
                      ? lmsLocale.canvasApiTokenPlaceholder
                      : lmsLocale.placeholderLmsToken
                  }
                  className={inputClassName}
                />
              </Field>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-4 border-t border-stone-100 pt-6">
              <div className="max-w-md space-y-1">
                <p className="text-xs leading-5 text-stone-500">
                  {lmsTab === 'canvas'
                    ? lmsLocale.savingAsCanvasEducator
                    : lmsLocale.savingAsMoodleEducator}
                </p>
                <p className="text-xs leading-5 text-stone-500">
                  {connectionVerified
                    ? lmsLocale.connectionVerifiedHint
                    : schoolConfig?.clientId && !savedConfigMatchesTab
                      ? lmsLocale.otherPlatformSavedHint
                      : lmsLocale.saveVerifiesHint}
                </p>
              </div>
              <p role="status" aria-live="polite" className="sr-only">
                {isSaving ? 'Verifying and saving LMS settings' : ''}
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={handleSaveLmsSettings}
                  disabled={isSaving}
                  aria-busy={isSaving}
                  className="inline-flex items-center gap-2 rounded-lg bg-[#ED621F] px-5 py-3 text-sm leading-5 font-semibold text-white shadow-sm transition hover:bg-[#d45518] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isSaving ? (
                    <Loader2
                      size={16}
                      aria-hidden="true"
                      className="animate-spin"
                    />
                  ) : (
                    <Save size={16} aria-hidden="true" />
                  )}
                  {lmsLocale.saveLmsSettings}
                </button>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
