import { useEffect, useRef, useState } from 'react';
import { Check, Copy, ExternalLink } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from '../common/Toast';
import { STUDENT_APP_URL } from '../../utils/constants/studentApp';

const COPIED_FEEDBACK_MS = 1500;

interface StudentAppLinkProps {
  collapsed: boolean;
  onShowTooltip: (label: string, el: HTMLElement) => void;
  onHideTooltip: () => void;
}

/** Sidebar quick link to the student app, so educators can share it with their class. */
export function StudentAppLink({
  collapsed,
  onShowTooltip,
  onHideTooltip,
}: StudentAppLinkProps) {
  const { t } = useTranslation('common');
  const [isCopied, setIsCopied] = useState(false);
  const resetTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(resetTimer.current), []);

  const copyStudentAppUrl = async () => {
    try {
      await navigator.clipboard.writeText(STUDENT_APP_URL);
      setIsCopied(true);
      clearTimeout(resetTimer.current);
      resetTimer.current = setTimeout(
        () => setIsCopied(false),
        COPIED_FEEDBACK_MS
      );
    } catch {
      // Clipboard can be unavailable (insecure context, denied permission); the link still works.
      clearTimeout(resetTimer.current);
      setIsCopied(false);
      toast.error(t('sidebar.studentApp.copyFailed'));
    }
  };

  if (collapsed) {
    return (
      <div
        className="px-2 pb-4"
        onMouseEnter={(e) =>
          onShowTooltip(t('sidebar.studentApp.title'), e.currentTarget)
        }
        onMouseLeave={onHideTooltip}
      >
        <a
          href={STUDENT_APP_URL}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={t('sidebar.studentApp.open')}
          className="flex items-center justify-center w-full h-10 rounded-xl border border-gray-200 text-primary-500 hover:bg-neutral-active hover:border-primary-300 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400"
        >
          <ExternalLink size={18} aria-hidden="true" />
        </a>
      </div>
    );
  }

  return (
    <div className="px-3 pb-4 pt-1">
      <div className="rounded-xl border border-gray-200 p-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-1.5">
          {t('sidebar.studentApp.title')}
        </p>
        <div className="flex items-center gap-2">
          <a
            href={STUDENT_APP_URL}
            target="_blank"
            rel="noopener noreferrer"
            title={STUDENT_APP_URL}
            className="inline-flex items-center gap-1 text-xs text-primary-600 hover:text-primary-700 hover:underline truncate min-w-0 flex-1"
          >
            <ExternalLink size={13} className="shrink-0" aria-hidden="true" />
            <span className="truncate">{STUDENT_APP_URL}</span>
          </a>
          <button
            type="button"
            onClick={() => void copyStudentAppUrl()}
            aria-label={t('sidebar.studentApp.copy')}
            title={
              isCopied
                ? t('sidebar.studentApp.copied')
                : t('sidebar.studentApp.copyLink')
            }
            className="p-1.5 rounded-md text-gray-500 hover:text-primary-500 hover:bg-neutral-active transition-colors flex-shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400"
          >
            {isCopied ? (
              <Check size={15} className="text-green-600" aria-hidden="true" />
            ) : (
              <Copy size={15} aria-hidden="true" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
