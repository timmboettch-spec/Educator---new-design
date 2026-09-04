import { useEffect, useId, useMemo, useState } from 'react';
import {
  Copy,
  Check,
  ShieldCheck,
} from 'lucide-react';
import { Button } from '../../../components/ui/Button';
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
  resetSaveConfigState,
} from '../../../redux/lms/LmsRedux';
import { selectCurrentUser } from '../../../redux/auth/LoginRedux';
import { GetSchoolRequest, selectSortedSchools } from '../../../redux/schools/GetSchoolsRedux';

function CopyField({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success(`${label} copied`);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Failed to copy');
    }
  };

  const labelId = useId();
  const hintId = useId();

  return (
    <div className="space-y-2">
      <div>
        <span id={labelId} className="text-sm font-medium text-gray-700">{label}</span>
        {hint && (
          <p id={hintId} className="text-xs text-gray-500 mt-1">
            {hint}
          </p>
        )}
      </div>

      <div className="relative">
        <div
          role="textbox"
          aria-readonly="true"
          tabIndex={0}
          aria-labelledby={labelId}
          aria-describedby={hint ? hintId : undefined}
          className="rounded-xl border border-gray-200 bg-[#e9e9e9] px-4 py-3 pr-14 text-sm font-mono break-all"
        >
          {value}
        </div>

        <button
          onClick={handleCopy}
          aria-label={`Copy ${label}`}
          className="absolute right-2 top-2 flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 bg-white hover:bg-gray-50"
        >
          {copied ? (
            <Check size={16} className="text-primary-600" aria-hidden="true" />
          ) : (
            <Copy size={16} aria-hidden="true" />
          )}
        </button>
      </div>
    </div>
  );
}

function PortalCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white shadow-sm">
      <div className="border-b border-gray-100 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
            <p className="mt-1 text-sm text-gray-500">{description}</p>
          </div>

          {/* Green is a deliberate, meaningful exception to the brand palette — it signals "ready/OK". */}
          <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-700">
            <ShieldCheck size={14} aria-hidden="true" />
            Ready
          </span>
        </div>
      </div>

      <div className="space-y-6 p-5">{children}</div>
    </div>
  );
}

function SkeletonCard() {
  return (
    <div aria-hidden="true" className="rounded-2xl border border-gray-100 bg-white p-6">
      <div className="animate-pulse space-y-4">
        <div className="h-6 w-40 rounded bg-gray-200" />
        <div className="h-14 rounded-xl bg-gray-100" />
        <div className="h-14 rounded-xl bg-gray-100" />
        <div className="h-14 rounded-xl bg-gray-100" />
        <div className="h-14 rounded-xl bg-gray-100" />
      </div>
    </div>
  );
}

export default function LMSIntegration() {
  const dispatch = useAppDispatch();
  const metadata = useAppSelector(selectLtiMetadata);
  const schoolConfig = useAppSelector(selectSchoolLmsConfig);
  const saveState = useAppSelector(selectSaveConfigState);
  const currentUser = useAppSelector(selectCurrentUser);
  const schools = useAppSelector(selectSortedSchools);
  const [clientId, setClientId] = useState('');
  const [issuerUrl, setIssuerUrl] = useState('');
  const [lmsApiToken, setLmsApiToken] = useState('');
  const [selectedSchoolId, setSelectedSchoolId] = useState('');

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
  const educatorSchoolId =
    (currentUser as { school?: { id?: string } } | null)?.school?.id ?? '';

  useEffect(() => {
    void getMetadata();
  }, [dispatch, isAdmin]);

  useEffect(() => {
    if (schoolConfig) {
      setIssuerUrl(
        schoolConfig.issuer ?? schoolConfig.lmsBaseUrl ?? schoolConfig.moodleUrl ?? '',
      );
      setClientId(schoolConfig.clientId ?? '');
      setLmsApiToken('');
      return;
    }

    setIssuerUrl('');
    setClientId('');
    setLmsApiToken('');
  }, [schoolConfig]);

  useEffect(() => {
    if (!isAdmin && educatorSchoolId) {
      setSelectedSchoolId(educatorSchoolId);
      void dispatch(fetchEducatorLmsConfig(undefined)).unwrap();
      return;
    }

    if (isAdmin && schools.length > 0 && !selectedSchoolId) {
      setSelectedSchoolId(schools[0].id);
    }
  }, [dispatch, educatorSchoolId, isAdmin, schools, selectedSchoolId]);

  useEffect(() => {
    if (!isAdmin || !selectedSchoolId) {
      return;
    }

    void dispatch(fetchEducatorLmsConfig(selectedSchoolId)).unwrap();
  }, [dispatch, isAdmin, selectedSchoolId]);

  useEffect(() => {
    if (saveState === 'succeeded') {
      toast.success('LMS settings saved');
      dispatch(resetSaveConfigState());
    } else if (saveState === 'failed') {
      toast.error('Failed to save LMS settings');
      dispatch(resetSaveConfigState());
    }
  }, [dispatch, saveState]);

  const getMetadata = async () => {
    try {
      await dispatch(fetchLtiMetadata()).unwrap();
      if (isAdmin) {
        await dispatch(GetSchoolRequest()).unwrap();
      } else {
        await dispatch(fetchEducatorLmsConfig(undefined)).unwrap();
      }
    } catch  {
      return;
    }
  };

  const handleSaveMoodleSettings = async () => {
    if (!selectedSchoolId) {
      toast.error('School is required');
      return;
    }
    if (!issuerUrl.trim()) {
      toast.error('Issuer URL is required');
      return;
    }
    if (!clientId.trim()) {
      toast.error('Client ID is required');
      return;
    }
    const normalizedIssuerUrl = issuerUrl.trim().replace(/\/$/, '');

    await dispatch(
      saveEducatorLmsConfig({
        schoolId: selectedSchoolId,
        lmsType: schoolConfig?.lmsType || 'moodle',
        issuer: normalizedIssuerUrl,
        clientId: clientId.trim(),
        authEndpoint: `${normalizedIssuerUrl}/mod/lti/auth.php`,
        tokenEndpoint: `${normalizedIssuerUrl}/mod/lti/token.php`,
        jwksUrl: `${normalizedIssuerUrl}/mod/lti/certs.php`,
        sharePii: schoolConfig?.sharePii ?? true,
        lmsBaseUrl: normalizedIssuerUrl,
        lmsApiToken: lmsApiToken.trim(),
      }),
    ).unwrap();

    if (isAdmin) {
      await dispatch(fetchEducatorLmsConfig(selectedSchoolId)).unwrap();
    } else {
      await dispatch(fetchEducatorLmsConfig(undefined)).unwrap();
    }
  };


  const copyEducatorConfig = async () => {
    if (!metadata) return;
    await navigator.clipboard.writeText(`Initiate Login URL:${metadata.initiateLoginUrl}
     Redirect URI: ${metadata.redirectUris?.[0]}
     JWKS URL: ${metadata.jwksUrl}
     Target Link URI: ${metadata.targetLinkUri}`);
    toast.success('Educator configuration copied');
  };

  const copyStudentConfig = async () => {
    if (!metadata) return;
    await navigator.clipboard.writeText(`Initiate Login URL:${metadata.studentinitiateLoginUrl}
    Redirect URI: ${metadata.studentredirectUris?.[0]}
    JWKS URL: ${metadata.studentjwksUrl}
    Target Link URI: ${metadata.studenttargetLinkUri}`);
    toast.success('Student configuration copied');
  };

  return (
    <div className="p-4 sm:p-6">
      <PageHeader
        title="LMS Integration"
        sub_text="LTI 1.3 — register the Educator and Student Portal as external LTI tools in Canvas, Blackboard, D2L, or other LMS platforms."
      />

      {/* Setup Guide */}
      <div className="mb-6 rounded-2xl border border-gray-100 bg-[#e9e9e9] p-5 sm:p-6">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-gray-900">
            Setup Guide
          </h3>
        </div>

        <ol className="mt-4 space-y-2 text-sm text-gray-700">
          <li>1. Create a new LTI 1.3 Tool in your LMS.</li>
          <li>2. Copy the values below.</li>
          <li>3. Paste them into the LMS registration form.</li>
          <li>4. Save the registration.</li>
          <li>5. Launch the tool from your LMS.</li>
        </ol>
      </div>

      {!metadata ? (
        <div className="grid gap-6 xl:grid-cols-2" role="status" aria-busy="true">
          <span className="sr-only">Loading LMS registration values…</span>
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : (
        <div className="grid gap-6 xl:grid-cols-2">
          {/* Educator */}
          <PortalCard
            title="Educator Portal"
            description="Tool registration values for instructors and administrators."
          >
            <div className="flex justify-end">
              <button
                onClick={copyEducatorConfig}
                className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium hover:bg-gray-50"
              >
                <Copy size={16} aria-hidden="true" />
                Copy All
              </button>
            </div>
              <CopyField
              label="Tool URI / Target Link URI"
              value={metadata.targetLinkUri}
            />
            <CopyField
              label="Initiate Login URL"
              value={metadata.initiateLoginUrl}
            />
            <CopyField
              label="Redirect URI"
              value={metadata.redirectUris?.[0] ?? ''}
            />
            <CopyField
              label="Public keyset (JWKS) URL"
              value={metadata.jwksUrl}
              hint="Used by the LMS to verify Educator Portal JWT signatures."
            />
          </PortalCard>

          {/* Student */}
          <PortalCard
            title="Student Portal"
            description="Tool registration values for learners and student access."
          >
            <div className="flex justify-end">
              <button
                onClick={copyStudentConfig}
                className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium hover:bg-gray-50"
              >
                <Copy size={16} aria-hidden="true" />
                Copy All
              </button>
            </div>
            <CopyField
              label="Tool URI / Target Link URI"
              value={metadata.studenttargetLinkUri}
            />
            <CopyField
              label="Initiate Login URL"
              value={metadata.studentinitiateLoginUrl}
            />
            <CopyField
              label="Redirect URI"
              value={metadata.studentredirectUris?.[0] ?? ''}
            />
            <CopyField
              label="Public keyset (JWKS) URL"
              value={metadata.studentjwksUrl}
              hint="Used by the LMS to verify Student Portal JWT signatures."
            />
          </PortalCard>
        </div>
      )}

      {/* LMS Settings */}
      <div className="mt-6 rounded-2xl border border-gray-100 bg-white shadow-sm">
        <div className="border-b border-gray-100 p-5">
          <div className="flex items-start gap-3">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">LMS Settings</h2>
              <p className="mt-1 text-sm text-gray-500">
                Configure LMS Web Service URL and Token for your school. These are stored
                securely per school and used automatically during LTI launch to create classes
                and enroll students.
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-5 p-5">
          {isAdmin && (
            <div className="space-y-2">
              <label htmlFor="lms-school" className="text-sm font-medium text-gray-700">
                School <span className="text-red-500" aria-hidden="true">*</span>
              </label>
              <select
                id="lms-school"
                aria-required="true"
                value={selectedSchoolId}
                onChange={(e) => setSelectedSchoolId(e.target.value)}
                className="w-full rounded-xl border border-gray-200 bg-[#e9e9e9] px-4 py-3 text-sm focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-100"
              >
                <option value="">Select School</option>
                {schools.map((school) => (
                  <option key={school.id} value={school.id}>
                    {school.school_name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* LMS Site URL */}
          <div className="space-y-2">
            <label htmlFor="lms-issuer" className="text-sm font-medium text-gray-700">
              Issuer URL <span className="text-red-500" aria-hidden="true">*</span>
            </label>
            <p id="lms-issuer-hint" className="text-xs text-gray-500">
              The LMS issuer/base URL for the selected school (e.g. <code className="bg-gray-100 px-1 rounded">https://realitywork.lms.com</code>).
            </p>
            <input
              id="lms-issuer"
              type="url"
              aria-required="true"
              aria-describedby="lms-issuer-hint"
              value={issuerUrl}
              onChange={(e) => setIssuerUrl(e.target.value)}
              placeholder="https://your-lms-site.com"
              autoComplete="off"
              className="w-full rounded-xl border border-gray-200 bg-[#e9e9e9] px-4 py-3 text-sm focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-100 autofill:shadow-[inset_0_0_0_1000px_#e9e9e9] autofill:[-webkit-text-fill-color:#374151]"
            />
          </div>

          {/* LMS WS Token */}
          <div className="space-y-2">
            <label htmlFor="lms-clientid" className="text-sm font-medium text-gray-700">
              Client ID <span className="text-red-500" aria-hidden="true">*</span>
            </label>
            <p id="lms-clientid-hint" className="text-xs text-gray-500">
              The Client ID from LMS tool registration (Site Admin → Plugins → External tool → Manage tools).
            </p>
            <input
              id="lms-clientid"
              type="text"
              aria-required="true"
              aria-describedby="lms-clientid-hint"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              placeholder="e.g. hYQXxdBIqGNNwVc"
              autoComplete="off"
              className="w-full rounded-xl border border-gray-200 bg-[#e9e9e9] px-4 py-3 text-sm focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-100 autofill:shadow-[inset_0_0_0_1000px_#e9e9e9] autofill:[-webkit-text-fill-color:#374151]"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="lms-token" className="text-sm font-medium text-gray-700">
              LMS Web Service Token (Optional)
            </label>
            <p id="lms-token-hint" className="text-xs text-gray-500">
              Token used for LMS API fallback calls during LMS sync.
            </p>
            <input
              id="lms-token"
              type="password"
              aria-describedby="lms-token-hint"
              value={lmsApiToken}
              onChange={(e) => setLmsApiToken(e.target.value)}
              placeholder="Paste LMS Web Service Token"
              autoComplete="new-password"
              className="w-full rounded-xl border border-gray-200 bg-[#e9e9e9] px-4 py-3 text-sm focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-100 autofill:shadow-[inset_0_0_0_1000px_#e9e9e9] autofill:[-webkit-text-fill-color:#374151]"
            />
          </div>


          <div className="flex items-center justify-end gap-3 pt-2">
            <span className="sr-only" role="status" aria-live="polite">
              {saveState === 'loading' ? 'Saving LMS settings…' : ''}
            </span>
            <Button
              variant="gradient"
              onClick={handleSaveMoodleSettings}
              loading={saveState === 'loading'}
              loadingText="Saving..."
            >
              Save LMS Settings
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}