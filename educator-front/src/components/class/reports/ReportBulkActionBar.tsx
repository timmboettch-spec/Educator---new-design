import { useTranslation } from 'react-i18next';

interface ReportBulkActionBarProps {
  selectedCount: number;
  totalCount: number;
  onMarkSelected: (reviewed: boolean) => void;
  onMarkAll: (reviewed: boolean) => void;
  busy?: boolean;
  disabled?: boolean;
}

const BUTTON_CLASSES =
  'text-xs font-semibold px-3 py-1.5 rounded-full border border-gray-300 text-[#5f6060] hover:bg-[#e9e9e9] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors';

/** "N selected · Mark reviewed · Mark unreviewed | Mark all reviewed · Mark all unreviewed". */
export function ReportBulkActionBar({
  selectedCount,
  totalCount,
  onMarkSelected,
  onMarkAll,
  busy = false,
  disabled = false,
}: ReportBulkActionBarProps) {
  const { t } = useTranslation('classManagement');
  const noneSelected = selectedCount === 0;
  const off = busy || disabled;

  return (
    <div
      role="toolbar"
      aria-label={t('reportReview.bulkLabel')}
      aria-busy={busy}
      className="flex flex-wrap items-center gap-2 mb-2"
    >
      <span className="text-xs text-gray-500 mr-auto" aria-live="polite">
        {t('reportReview.selected', { count: selectedCount })}
      </span>
      <button
        type="button"
        className={BUTTON_CLASSES}
        disabled={off || noneSelected}
        onClick={() => onMarkSelected(true)}
      >
        {t('reportReview.markReviewed')}
      </button>
      <button
        type="button"
        className={BUTTON_CLASSES}
        disabled={off || noneSelected}
        onClick={() => onMarkSelected(false)}
      >
        {t('reportReview.markUnreviewed')}
      </button>
      <span className="mx-1 h-5 w-px bg-gray-300" aria-hidden="true" />
      <button
        type="button"
        className={BUTTON_CLASSES}
        disabled={off || totalCount === 0}
        onClick={() => onMarkAll(true)}
      >
        {t('reportReview.markAllReviewed')}
      </button>
      <button
        type="button"
        className={BUTTON_CLASSES}
        disabled={off || totalCount === 0}
        onClick={() => onMarkAll(false)}
      >
        {t('reportReview.markAllUnreviewed')}
      </button>
    </div>
  );
}
