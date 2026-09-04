import { useCallback, useMemo, useState } from 'react';
import { Settings } from 'lucide-react';
import { getParsedUser } from '../../utils/storage';

/**
 * Notification preferences — in-app + email toggles shown under Profile Information
 * on the Account page. Role-aware: educators see educator notifications, admins see
 * admin notifications, and dual-role users see both. Everything defaults to OFF
 * (opt-in) except the locked Password reset email, which is always on.
 *
 * Preferences persist per-user in localStorage. Enforcing them (suppressing a
 * disabled in-app notification in the bell panel, and gating emails server-side)
 * is a follow-up — this delivers the configuration surface.
 */

interface NotifItem {
  id: string;
  label: string;
  desc: string;
  /**
   * `true` = a RECURRING notification that can happen many times / repeat as the
   * date approaches; `false`/undefined = a ONE-TIME notification sent once when
   * the event occurs. Surfaced as a small tag so users know what to expect.
   */
  recurring?: boolean;
  /** transactional/security notification that cannot be turned off */
  locked?: boolean;
}

const IN_APP_EDUCATOR: NotifItem[] = [
  { id: 'report_available', label: 'Student reports ready', recurring: true, desc: 'A student in one of your classes finished a simulation, so there’s a new report to review. To avoid flooding you, we send a single summary alert whenever you have unread reports — not one alert per student. You may see this more than once as new reports come in.' },
  { id: 'assignment_due', label: 'Assignment due date reminder', recurring: true, desc: 'A heads-up that a simulation you assigned to a class is getting close to its due date (the date you expect students to finish it). May be sent more than once as the date gets nearer.' },
  { id: 'assignment_start', label: 'Assignment start date reminder', recurring: true, desc: 'A heads-up that a simulation you assigned is about to open, so students will soon be able to start it. May be sent more than once as the start date gets nearer.' },
  { id: 'assignment_end', label: 'Assignment close date reminder', recurring: true, desc: 'A heads-up that a simulation assignment is about to close — after that, students can no longer start or submit it. May be sent more than once as the close date gets nearer.' },
  { id: 'class_start', label: 'Class start date reminder', recurring: true, desc: 'A heads-up that one of your classes is about to begin. May be sent more than once as the start date gets nearer.' },
  { id: 'class_end', label: 'Class end date reminder', recurring: true, desc: 'A heads-up that one of your classes is about to end. May be sent more than once as the end date gets nearer.' },
  { id: 'class_transferred', label: 'Class moved to or from you', desc: 'Sent once when an administrator moves a class (and the students in it) onto your account, or moves one of your classes to another educator.' },
  { id: 'seats_allocated', label: 'Avatar seats added to your account', desc: 'Sent once when an administrator gives you more avatar-simulation seats. A “seat” lets one student run an avatar simulation; only avatar products use seats (workstation/manikin products don’t).' },
  { id: 'products_associated', label: 'New product access granted', desc: 'Sent once when an administrator gives your account access to a new product, so you can start assigning its simulations to your classes.' },
];

const IN_APP_ADMIN: NotifItem[] = [
  { id: 'educator_registered', label: 'Educator activated their account', desc: 'Sent once when an educator you invited accepts the invitation and finishes setting up their account.' },
  { id: 'high_usage_warning', label: 'High hardware-hours usage warning', recurring: true, desc: 'A warning that a workstation (manikin) product is getting close to the total licensed hardware hours it’s allowed to use. May repeat as usage keeps climbing toward the limit.' },
  { id: 'low_seat_warning', label: 'Low avatar seat warning', recurring: true, desc: 'A warning that the pool of avatar-simulation seats still available to allocate on an active product is running low. Only avatar products use seats (workstation/manikin products don’t). May repeat as fewer seats remain.' },
  { id: 'seat_request', label: 'Educator requested more seats', desc: 'Sent once each time an educator asks you to allocate more avatar-simulation seats to them.' },
];

const EMAIL_EDUCATOR: NotifItem[] = [
  { id: 'forgot_password', label: 'Password reset', desc: 'The email that contains your password reset code, sent only when you ask to reset your password. Required for account security, so it can’t be turned off.', locked: true },
  { id: 'report_available', label: 'Report ready', recurring: true, desc: 'An email letting you know a student’s simulation report is ready to view. Sent each time a new report becomes available.' },
  { id: 'email_report', label: 'Report in the email body', recurring: true, desc: 'The full simulation report written right inside the email (no need to log in to read it). Sent each time a report is shared this way.' },
  { id: 'assessment_report', label: 'Assessment report (PDF)', recurring: true, desc: 'An assessment report delivered as a PDF file attached to the email. Sent each time an assessment report is ready.' },
  { id: 'batch_email', label: 'Bulk reports to students', recurring: true, desc: 'Reports emailed in bulk to your students, using the email addresses from your connected LMS (Learning Management System). Sent each time you send a batch.' },
  { id: 'send_student_code', label: 'Student access codes', recurring: true, desc: 'Student login codes emailed to your students, using the addresses from your connected LMS (Learning Management System). Sent each time codes are issued.' },
  { id: 'account_reactivated', label: 'Account reactivated', desc: 'Sent once to confirm your account has been turned back on after a period of being inactive.' },
  { id: 'products_associated', label: 'New product access granted', desc: 'An email, sent once, letting you know an administrator gave your account access to a new product.' },
];

const EMAIL_ADMIN: NotifItem[] = [
  { id: 'forgot_password', label: 'Password reset', desc: 'The email that contains your password reset code, sent only when you ask to reset your password. Required for account security, so it can’t be turned off.', locked: true },
  { id: 'educator_seat_request', label: 'Educator requested more seats', desc: 'An email, sent once each time an educator asks you to allocate more avatar-simulation seats to them.' },
  { id: 'account_reactivated', label: 'Account reactivated', desc: 'An email, sent once, confirming an account has been turned back on after being inactive.' },
];

const FREQUENCIES = [
  { value: 'immediate', label: 'Immediately' },
  { value: 'daily', label: 'Daily digest' },
  { value: 'weekly', label: 'Weekly digest' },
];

const readPrefs = (key: string): Record<string, boolean> => {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
  } catch {
    return {};
  }
};

function Toggle({
  on,
  locked,
  label,
  onToggle,
}: {
  on: boolean;
  locked?: boolean;
  label: string;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={locked}
      onClick={onToggle}
      className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 focus-visible:ring-offset-2 ${
        on ? 'bg-primary-500' : 'bg-gray-300'
      } ${locked ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
    >
      <span
        className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
          on ? 'translate-x-[22px]' : 'translate-x-0.5'
        }`}
      />
    </button>
  );
}

export default function NotificationPreferences({
  role,
  isDualRole = false,
}: {
  role?: string;
  isDualRole?: boolean;
}) {
  const user = getParsedUser();
  const userId = String((user?.id as string | undefined) ?? 'anon');
  const storageKey = `rw_notif_prefs_${userId}`;
  const freqKey = `rw_notif_freq_${userId}`;

  const [prefs, setPrefs] = useState<Record<string, boolean>>(() => readPrefs(storageKey));
  const [freq, setFreq] = useState<Record<string, string>>(() => {
    try {
      const raw = window.localStorage.getItem(freqKey);
      return raw ? (JSON.parse(raw) as Record<string, string>) : {};
    } catch {
      return {};
    }
  });

  const setFrequency = useCallback(
    (key: string, value: string) => {
      setFreq((prev) => {
        const next = { ...prev, [key]: value };
        try {
          window.localStorage.setItem(freqKey, JSON.stringify(next));
        } catch {
          /* storage unavailable — keep in-memory only */
        }
        return next;
      });
    },
    [freqKey],
  );

  const isEducator = role?.toLowerCase() === 'educator';
  const showEducator = isEducator || isDualRole;
  const showAdmin = !isEducator || isDualRole;

  // Opt-in: a notification is on only when explicitly enabled (absent = OFF).
  const isOn = useCallback((key: string) => prefs[key] === true, [prefs]);

  const toggle = useCallback(
    (key: string) => {
      setPrefs((prev) => {
        const next = { ...prev, [key]: prev[key] !== true };
        try {
          window.localStorage.setItem(storageKey, JSON.stringify(next));
        } catch {
          /* storage unavailable — keep in-memory only */
        }
        return next;
      });
    },
    [storageKey],
  );

  // Build the two channels from the role-appropriate catalogs.
  const inApp = useMemo(
    () => [
      ...(showEducator ? IN_APP_EDUCATOR.map((i) => ({ ...i, scope: 'educator' as const })) : []),
      ...(showAdmin ? IN_APP_ADMIN.map((i) => ({ ...i, scope: 'admin' as const })) : []),
    ],
    [showEducator, showAdmin],
  );
  const email = useMemo(() => {
    const items = [
      ...(showEducator ? EMAIL_EDUCATOR.map((i) => ({ ...i, scope: 'educator' as const })) : []),
      ...(showAdmin ? EMAIL_ADMIN.map((i) => ({ ...i, scope: 'admin' as const })) : []),
    ];
    // De-duplicate shared email types (e.g. Password reset) for dual-role users.
    const seen = new Set<string>();
    return items.filter((i) => (seen.has(i.id) ? false : (seen.add(i.id), true)));
  }, [showEducator, showAdmin]);

  const renderList = (channel: 'inapp' | 'email', items: (NotifItem & { scope: string })[]) => (
    <ul className="divide-y divide-gray-100">
      {items.map((item) => {
        const key = `${channel}:${item.scope}:${item.id}`;
        const on = item.locked ? true : isOn(key);
        return (
          <li key={key} className="flex items-start justify-between gap-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-gray-900">
                {item.label}
                {item.locked ? (
                  <span className="ml-2 align-middle text-[10px] uppercase tracking-wide text-gray-500">
                    Always on
                  </span>
                ) : (
                  <span
                    className={`ml-2 align-middle text-[10px] uppercase tracking-wide rounded px-1.5 py-0.5 ${
                      item.recurring
                        ? 'bg-amber-100 text-amber-700'
                        : 'bg-gray-100 text-gray-500'
                    }`}
                    title={
                      item.recurring
                        ? 'Recurring — you may receive this notification more than once'
                        : 'One-time — sent once when the event happens'
                    }
                  >
                    {item.recurring ? 'Recurring' : 'One-time'}
                  </span>
                )}
              </p>
              {/* Fixed 2-line height so single- and double-line descriptions align. */}
              <p className="text-sm text-gray-500 leading-snug mt-0.5 min-h-[2.5rem]">{item.desc}</p>
              {/* Always reserve the frequency-row height so rows line up across both columns. */}
              <div className="mt-1.5 h-[36px] flex items-center gap-2">
                {on && !item.locked && (
                  <>
                    <label className="text-sm text-gray-500">Frequency</label>
                    <select
                      value={freq[key] ?? 'immediate'}
                      onChange={(e) => setFrequency(key, e.target.value)}
                      aria-label={`${item.label} frequency`}
                      className="text-sm rounded-md border border-gray-300 bg-white px-2.5 py-1 text-gray-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400"
                    >
                      {FREQUENCIES.map((f) => (
                        <option key={f.value} value={f.value}>
                          {f.label}
                        </option>
                      ))}
                    </select>
                  </>
                )}
              </div>
            </div>
            <Toggle on={on} locked={item.locked} label={item.label} onToggle={() => toggle(key)} />
          </li>
        );
      })}
    </ul>
  );

  return (
    <div
      id="notification-preferences"
      className="mt-6 bg-white border border-gray-300 rounded-md shadow-xl overflow-hidden scroll-mt-4"
    >
      <div className="bg-[#e9e9e9] px-4 py-3">
        <p className="flex items-center gap-2 text-[20px] font-semibold text-primary-500">
          <Settings size={20} className="shrink-0" aria-hidden="true" />
          <span>Notification Preferences</span>
        </p>
      </div>

      {/* Legend: what the tags + frequency options mean, in plain language. */}
      <div className="px-4 pt-3 text-sm text-gray-600 space-y-1.5">
        <p>
          Turn a notification on with its switch, then choose how often you want
          it delivered:
        </p>
        <ul className="list-disc pl-5 space-y-0.5">
          <li>
            <span className="font-medium text-gray-800">Immediately</span> — sent
            as soon as it happens.
          </li>
          <li>
            <span className="font-medium text-gray-800">Daily digest</span> —
            bundled together and sent once a day.
          </li>
          <li>
            <span className="font-medium text-gray-800">Weekly digest</span> —
            bundled together and sent once a week.
          </li>
        </ul>
        <p>
          The{' '}
          <span className="align-middle text-[10px] uppercase tracking-wide rounded px-1.5 py-0.5 bg-amber-100 text-amber-700">
            Recurring
          </span>{' '}
          tag means you may receive that notification more than once (for example,
          a reminder that repeats as a date gets closer);{' '}
          <span className="align-middle text-[10px] uppercase tracking-wide rounded px-1.5 py-0.5 bg-gray-100 text-gray-500">
            One-time
          </span>{' '}
          means it&rsquo;s sent just once when the event happens.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 p-4">
        <section className="min-w-0">
          <h3 className="text-sm font-bold uppercase tracking-wide text-primary-500 border-b border-gray-200 pb-2 mb-3">
            In-app notifications
          </h3>
          {renderList('inapp', inApp)}
        </section>
        <section className="min-w-0">
          <h3 className="text-sm font-bold uppercase tracking-wide text-primary-500 border-b border-gray-200 pb-2 mb-3">
            Email notifications
          </h3>
          {renderList('email', email)}
        </section>
      </div>
    </div>
  );
}
