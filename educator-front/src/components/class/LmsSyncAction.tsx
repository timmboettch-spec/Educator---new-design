import { useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, RefreshCw } from 'lucide-react';
import loginEn from '../../locales/auth/login/en.json';
import loginEs from '../../locales/auth/login/es.json';
import {
  type LmsGradeSync,
  type LmsSyncFailureReason,
  lmsSyncKey,
} from '../../hooks/useLmsGradeSync';
import { toast } from '../common/Toast';

interface Props {
  sync: LmsGradeSync;
  mode?: string | null;
  simulationId?: string | null;
  studentId?: string | null;
}

const pillClass =
  'inline-flex items-center justify-center gap-1 px-2 py-1 border text-[11px] rounded-full font-medium whitespace-nowrap';

function FailedBadge({ label, reason }: { label: string; reason: string }) {
  const [tip, setTip] = useState<{ top: number; left: number } | null>(null);
  const show = (el: HTMLElement) => {
    const rect = el.getBoundingClientRect();
    setTip({ top: rect.top - 6, left: rect.left + rect.width / 2 });
  };

  return (
    <span
      tabIndex={0}
      aria-label={`${label}: ${reason}`}
      onMouseEnter={(e) => show(e.currentTarget)}
      onMouseLeave={() => setTip(null)}
      onFocus={(e) => show(e.currentTarget)}
      onBlur={() => setTip(null)}
      className={`${pillClass} cursor-help bg-red-50 border-red-200 text-red-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-300`}
    >
      <AlertCircle size={12} aria-hidden="true" />
      {label}
      {tip &&
        createPortal(
          <span
            role="tooltip"
            style={{ top: tip.top, left: tip.left }}
            className="fixed z-[1000] max-w-[240px] -translate-x-1/2 -translate-y-full whitespace-normal rounded-md bg-gray-900 px-2.5 py-1.5 text-[11px] font-normal leading-snug text-white shadow-lg pointer-events-none"
          >
            {reason}
          </span>,
          document.body
        )}
    </span>
  );
}

export default function LmsSyncAction({
  sync,
  mode,
  simulationId,
  studentId,
}: Props) {
  if (mode?.toLowerCase() !== 'assessment' || !simulationId || !studentId) {
    return null;
  }
  const key = lmsSyncKey(simulationId, studentId);
  const entry = sync.statuses[key];
  if (!entry) return null;

  const t = (
    localStorage.getItem('app_language')?.toLowerCase() === 'es'
      ? loginEs
      : loginEn
  ).reportsModal;

  if (entry.status === 'sent') {
    return (
      <span
        className={`${pillClass} bg-green-50 border-green-200 text-green-700`}
      >
        {t.lmsSynced}
      </span>
    );
  }

  const reasonText: Record<LmsSyncFailureReason, string> = {
    lms_configuration: t.lmsReasonConfiguration,
    lms_authentication: t.lmsReasonAuthentication,
    lms_assignment_not_found: t.lmsReasonAssignmentNotFound,
    lms_rejected_grade: t.lmsReasonRejectedGrade,
    lms_unreachable: t.lmsReasonUnreachable,
    unknown: t.lmsReasonUnknown,
  };
  const isResyncing = !!sync.resyncing[key];
  const handleResync = async () => {
    const ok = await sync.resync(simulationId, studentId);
    if (ok) toast.success(t.lmsResyncSuccess);
    else toast.error(t.lmsResyncError);
  };

  return (
    <>
      <FailedBadge
        label={
          entry.failureReason === 'lms_assignment_not_found'
            ? t.lmsSyncAssignmentDeleted
            : t.lmsSyncFailed
        }
        reason={reasonText[entry.failureReason ?? 'unknown']}
      />
      <button
        type="button"
        disabled={isResyncing}
        onClick={() => void handleResync()}
        className={`${pillClass} transition-colors ${
          isResyncing
            ? 'bg-gray-100 border-gray-200 text-gray-400 cursor-not-allowed'
            : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100 cursor-pointer'
        }`}
      >
        <RefreshCw
          size={12}
          aria-hidden="true"
          className={isResyncing ? 'animate-spin' : undefined}
        />
        {isResyncing ? t.lmsResyncing : t.lmsResync}
      </button>
    </>
  );
}
