import { useEffect, useMemo, useRef, useState } from 'react';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import {
  fetchPreferences,
  savePreferences,
  selectPreferences,
  selectPreferencesStatus,
  type NotificationChannel,
  type NotificationFrequency,
  type NotificationPreference,
  type NotificationType,
} from '../../redux/notifications/NotificationsRedux';
import { toast } from '../common/Toast';
import loginEn from '../../locales/auth/login/en.json';
import loginEs from '../../locales/auth/login/es.json';

type SupportedLang = 'en' | 'es';

const FREQUENCY_OPTIONS: { value: NotificationFrequency; labelKey: string }[] =
  [
    { value: 'IMMEDIATE', labelKey: 'freqImmediate' },
    { value: 'DAILY', labelKey: 'freqDaily' },
    { value: 'WEEKLY', labelKey: 'freqWeekly' },
    { value: 'BIWEEKLY', labelKey: 'freqBiweekly' },
    { value: 'MONTHLY', labelKey: 'freqMonthly' },
  ];

/** Rows shown in the In-App column for Educators. */
const EDUCATOR_ROWS: { type: NotificationType; labelKey: string }[] = [
  { type: 'STUDENT_REPORT_AVAILABLE', labelKey: 'prefStudentReport' },
  { type: 'SIMULATION_DUE_DATE_REMINDER', labelKey: 'prefSimDueDate' },
  { type: 'SIMULATION_START_DATE_REMINDER', labelKey: 'prefSimStartDate' },
  { type: 'SIMULATION_END_DATE_REMINDER', labelKey: 'prefSimEndDate' },
  { type: 'CLASS_START_DATE_REMINDER', labelKey: 'prefClassStartDate' },
  { type: 'CLASS_END_DATE_REMINDER', labelKey: 'prefClassEndDate' },
  { type: 'CLASS_TRANSFERRED', labelKey: 'prefClassTransferred' },
  { type: 'TOKENS_ALLOCATED', labelKey: 'prefTokensAllocated' },
];

/** Educator in-app rows shown to dual-role admins — only the report notification. */
const EDUCATOR_ROWS_DUAL_ADMIN: { type: NotificationType; labelKey: string }[] =
  [{ type: 'STUDENT_REPORT_AVAILABLE', labelKey: 'prefStudentReport' }];

/** Rows shown in the Email column for Educators. */
const EDUCATOR_EMAIL_ROWS: {
  type: NotificationType;
  labelKey: string;
  emailFrequency?: boolean;
}[] = [
  { type: 'EMAIL_REPORT', labelKey: 'prefEmailReport' },
  // STUDENT_REPORT_AVAILABLE renders as a sub-item inside EMAIL_REPORT when that toggle is on
];

/** Rows shown in the In-App column for Administrators. */
const ADMIN_ROWS: { type: NotificationType; labelKey: string }[] = [
  { type: 'EDUCATOR_REGISTERED', labelKey: 'prefEducatorRegistered' },
  { type: 'EDUCATOR_LOW_SEAT_WARNING', labelKey: 'prefLowSeatWarning' },
  { type: 'EDUCATOR_SEAT_REQUEST', labelKey: 'prefSeatRequest' },
];

/** Rows shown in the Email column for Administrators. */
const ADMIN_EMAIL_ROWS: {
  type: NotificationType;
  labelKey: string;
  emailFrequency?: boolean;
}[] = [{ type: 'EDUCATOR_SEAT_REQUEST', labelKey: 'prefSeatRequest' }];

interface Props {
  role: 'educator' | 'admin';
  isDualRole?: boolean;
  language?: SupportedLang;
}

function lookupPref(
  prefs: NotificationPreference[],
  type: NotificationType,
  channel: NotificationChannel
): NotificationPreference | undefined {
  return prefs.find(
    (p) => p.notificationType === type && p.channel === channel
  );
}

function isEnabled(
  prefs: NotificationPreference[],
  type: NotificationType,
  channel: NotificationChannel
): boolean {
  return lookupPref(prefs, type, channel)?.enabled ?? false;
}

function getFrequency(
  prefs: NotificationPreference[],
  type: NotificationType
): NotificationFrequency {
  return lookupPref(prefs, type, 'EMAIL')?.frequency ?? 'IMMEDIATE';
}

/** Builds a normalized snapshot keyed by type+channel, filling in defaults for absent entries. */
function effectivePrefMap(
  prefs: NotificationPreference[]
): Map<string, { enabled: boolean; frequency: NotificationFrequency }> {
  const map = new Map<
    string,
    { enabled: boolean; frequency: NotificationFrequency }
  >();
  for (const p of prefs) {
    map.set(`${p.notificationType}|${p.channel}`, {
      enabled: p.enabled,
      frequency: p.frequency ?? 'IMMEDIATE',
    });
  }
  return map;
}

// Compares by effective value (not array identity/order) so an edit reverted to its saved
// value is treated as clean again, instead of relying on a "touched" flag.
function arePreferencesEqual(
  a: NotificationPreference[],
  b: NotificationPreference[]
): boolean {
  const mapA = effectivePrefMap(a);
  const mapB = effectivePrefMap(b);
  const keys = new Set([...mapA.keys(), ...mapB.keys()]);
  for (const key of keys) {
    const va = mapA.get(key) ?? {
      enabled: false,
      frequency: 'IMMEDIATE' as NotificationFrequency,
    };
    const vb = mapB.get(key) ?? {
      enabled: false,
      frequency: 'IMMEDIATE' as NotificationFrequency,
    };
    if (va.enabled !== vb.enabled) return false;
    // Frequency only matters while the toggle is on; a stale frequency on a disabled row shouldn't count.
    if (va.enabled && va.frequency !== vb.frequency) return false;
  }
  return true;
}

function Toggle({
  id,
  on,
  label,
  onChange,
}: {
  id: string;
  on: boolean;
  label: string;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      role="switch"
      id={id}
      aria-checked={on}
      aria-label={`${on ? 'Disable' : 'Enable'} ${label}`}
      onClick={() => onChange(!on)}
      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-500 ${
        on ? 'bg-[#F97316]' : 'bg-gray-200'
      }`}
    >
      <span
        aria-hidden="true"
        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
          on ? 'translate-x-4' : 'translate-x-0'
        }`}
      />
      <span className="sr-only">{on ? 'Enabled' : 'Disabled'}</span>
    </button>
  );
}

export default function NotificationSettings({
  role,
  isDualRole = false,
  language = 'en',
}: Props) {
  const dispatch = useAppDispatch();
  const preferences = useAppSelector(selectPreferences);
  const status = useAppSelector(selectPreferencesStatus);
  const [local, setLocal] = useState<NotificationPreference[]>([]);
  const [saving, setSaving] = useState(false);
  const fetchedRef = useRef(false);
  // Dirty is derived by value, not a "touched" flag, so reverting a toggle re-disables the button.
  const isDirty = useMemo(
    () => !arePreferencesEqual(local, preferences),
    [local, preferences]
  );

  const locale = language === 'es' ? loginEs : loginEn;
  const copy = locale.notificationSettings;

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    void dispatch(fetchPreferences());
  }, [dispatch]);

  useEffect(() => {
    setLocal(preferences);
  }, [preferences]);

  function setToggle(
    type: NotificationType,
    channel: NotificationChannel,
    enabled: boolean
  ) {
    setLocal((prev) => {
      let next = prev.find(
        (p) => p.notificationType === type && p.channel === channel
      )
        ? prev.map((p) =>
            p.notificationType === type && p.channel === channel
              ? { ...p, enabled }
              : p
          )
        : [...prev, { notificationType: type, channel, enabled }];

      // Disabling Email Report also disables Report Available; re-enabling restores it
      if (type === 'EMAIL_REPORT' && channel === 'EMAIL') {
        const hasReport = next.find(
          (p) =>
            p.notificationType === 'STUDENT_REPORT_AVAILABLE' &&
            p.channel === 'EMAIL'
        );
        next = hasReport
          ? next.map((p) =>
              p.notificationType === 'STUDENT_REPORT_AVAILABLE' &&
              p.channel === 'EMAIL'
                ? { ...p, enabled }
                : p
            )
          : [
              ...next,
              {
                notificationType:
                  'STUDENT_REPORT_AVAILABLE' as NotificationType,
                channel: 'EMAIL' as NotificationChannel,
                enabled,
              },
            ];
      }

      return next;
    });
  }

  function setFrequency(
    type: NotificationType,
    frequency: NotificationFrequency
  ) {
    setLocal((prev) => {
      const existing = prev.find(
        (p) => p.notificationType === type && p.channel === 'EMAIL'
      );
      if (existing) {
        return prev.map((p) =>
          p.notificationType === type && p.channel === 'EMAIL'
            ? { ...p, frequency }
            : p
        );
      }
      return [
        ...prev,
        { notificationType: type, channel: 'EMAIL', enabled: true, frequency },
      ];
    });
  }

  async function handleSave() {
    setSaving(true);
    try {
      await dispatch(savePreferences(local)).unwrap();
      toast.success(copy.saveSuccess ?? 'Preferences saved.');
    } catch {
      toast.error(copy.saveError ?? 'Failed to save preferences.');
    } finally {
      setSaving(false);
    }
  }

  if (status === 'loading') {
    return (
      <div className="py-4 text-sm text-gray-500" aria-live="polite">
        {copy.loading ?? 'Loading preferences…'}
      </div>
    );
  }

  // Dual-role admins see admin rows + only the student report row from educator rows
  const isAdminWithEducator = role === 'admin' && isDualRole;
  const rows =
    role === 'educator'
      ? EDUCATOR_ROWS
      : isAdminWithEducator
        ? [...ADMIN_ROWS, ...EDUCATOR_ROWS_DUAL_ADMIN]
        : ADMIN_ROWS;
  const emailRows =
    role === 'educator'
      ? EDUCATOR_EMAIL_ROWS
      : isAdminWithEducator
        ? [...ADMIN_EMAIL_ROWS, ...EDUCATOR_EMAIL_ROWS]
        : ADMIN_EMAIL_ROWS;

  return (
    <section aria-labelledby="notif-settings-heading">
      {/* overflow-hidden only on the card wrapper causes grid content to be clipped — use rounded-t/b instead */}
      <div className="bg-white border border-gray-300 rounded-md shadow-xl">
        {/* Header needs overflow-hidden to clip bg color within its own rounded top corners */}
        <div className="flex justify-between items-center bg-[#F0F6FB] px-4 py-3 rounded-t-md overflow-hidden">
          <h2
            id="notif-settings-heading"
            className="text-[20px] font-semibold text-[#F97316]"
          >
            {copy.sectionTitle ?? 'Notification Settings'}
          </h2>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={!isDirty || saving}
            className="rounded-full bg-gradient-to-r from-orange-400 to-orange-500 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving
              ? (copy.saving ?? 'Saving…')
              : (copy.save ?? 'Save Preferences')}
          </button>
        </div>

        {/* Two-column grid: In-App | Email */}
        <div className="grid grid-cols-2">
          {/* ── In-App Notifications column ── */}
          <div className="border-r border-gray-100">
            <div className="px-4 py-2 border-b border-gray-100 bg-gray-50">
              <p className="text-sm font-semibold uppercase tracking-wide text-gray-600">
                {copy.inAppTitle ?? 'In-App Notifications'}
              </p>
            </div>
            <ul className="divide-y divide-gray-100" role="list">
              {rows.map(({ type, labelKey }) => {
                const on = isEnabled(local, type, 'IN_APP');
                const labelText =
                  copy[labelKey as keyof typeof copy] ??
                  type.replace(/_/g, ' ').toLowerCase();
                return (
                  <li
                    key={type}
                    className="flex items-center justify-between px-4 py-3 min-h-[52px]"
                  >
                    <label
                      htmlFor={`notif-inapp-${type}`}
                      className="text-sm text-gray-800 cursor-pointer select-none pr-3"
                    >
                      {labelText}
                    </label>
                    <Toggle
                      id={`notif-inapp-${type}`}
                      on={on}
                      label={labelText}
                      onChange={(next) => setToggle(type, 'IN_APP', next)}
                    />
                  </li>
                );
              })}
            </ul>
          </div>

          {/* ── Email Notifications column ── */}
          <div>
            <div className="px-4 py-2 border-b border-gray-100 bg-gray-50">
              <p className="text-sm font-semibold uppercase tracking-wide text-gray-600">
                {copy.emailTitle ?? 'Email Notifications'}
              </p>
            </div>
            <ul className="divide-y divide-gray-100" role="list">
              {emailRows.map(({ type, labelKey }) => {
                const on = isEnabled(local, type, 'EMAIL');
                const labelText =
                  copy[labelKey as keyof typeof copy] ??
                  type.replace(/_/g, ' ').toLowerCase();

                // EMAIL_REPORT row: renders its own toggle, then conditionally shows
                // "Report Available" as an indented sub-item when enabled
                if (type === 'EMAIL_REPORT') {
                  const showAll = on;
                  const reportLabel =
                    copy['prefStudentReportEmail' as keyof typeof copy] ??
                    'Report Available';
                  return (
                    <li key={type} className="px-4 py-3 min-h-[52px]">
                      {/* Email Report toggle with optional Educator role badge */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 pr-3">
                          <label
                            htmlFor={`notif-email-${type}`}
                            className="text-sm text-gray-800 cursor-pointer select-none"
                          >
                            {labelText}
                          </label>
                          {isAdminWithEducator && (
                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-600 leading-none">
                              {copy.roleBadgeEducator ?? 'Educator'}
                            </span>
                          )}
                        </div>
                        <Toggle
                          id={`notif-email-${type}`}
                          on={on}
                          label={labelText}
                          onChange={(next) => setToggle(type, 'EMAIL', next)}
                        />
                      </div>

                      {/* Report Available sub-item — only visible when Email Report is ON */}
                      {on && (
                        <div className="mt-3 ml-4 pl-3 border-l-2 border-orange-200">
                          <div className="flex items-center justify-between mb-2">
                            <label
                              htmlFor="notif-freq-STUDENT_REPORT_AVAILABLE"
                              className="text-xs text-gray-600 select-none"
                            >
                              {reportLabel}
                            </label>
                          </div>
                          {/* Frequency dropdown — active when Email Report is on */}
                          <label
                            htmlFor="notif-freq-STUDENT_REPORT_AVAILABLE"
                            className="sr-only"
                          >
                            {copy.frequencyLabel ?? 'Delivery frequency'}
                          </label>
                          <select
                            id="notif-freq-STUDENT_REPORT_AVAILABLE"
                            value={
                              showAll
                                ? getFrequency(
                                    local,
                                    'STUDENT_REPORT_AVAILABLE'
                                  )
                                : 'IMMEDIATE'
                            }
                            disabled={!showAll}
                            onChange={(e) =>
                              setFrequency(
                                'STUDENT_REPORT_AVAILABLE',
                                e.target.value as NotificationFrequency
                              )
                            }
                            className="block w-full rounded-md border border-gray-300 bg-white px-2 py-1 text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-orange-400"
                          >
                            {FREQUENCY_OPTIONS.map(
                              ({ value, labelKey: fk }) => (
                                <option key={value} value={value}>
                                  {copy[fk as keyof typeof copy] ?? value}
                                </option>
                              )
                            )}
                          </select>
                        </div>
                      )}
                    </li>
                  );
                }

                // All other email rows render normally (no sub-items, no frequency)
                return (
                  <li key={type} className="px-4 py-3 min-h-[52px]">
                    <div className="flex items-center justify-between">
                      <label
                        htmlFor={`notif-email-${type}`}
                        className="text-sm text-gray-800 cursor-pointer select-none pr-3"
                      >
                        {labelText}
                      </label>
                      <Toggle
                        id={`notif-email-${type}`}
                        on={on}
                        label={labelText}
                        onChange={(next) => setToggle(type, 'EMAIL', next)}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
