import { useTranslation } from 'react-i18next';
import { ClassAttentionMeasure } from '../../redux/api/classes/classes.types';

export type ClassListFilterMeasure = ClassAttentionMeasure;

const LABEL_KEYS = {
  [ClassAttentionMeasure.ACTIVE]: 'attentionCard.activeLabel',
  [ClassAttentionMeasure.CLOSING_SOON]: 'attentionCard.closingSoonLabel',
  [ClassAttentionMeasure.NEAR_AVATAR_LIMIT]:
    'attentionCard.nearAvatarLimitLabel',
  [ClassAttentionMeasure.UNREAD_REPORTS]: 'attentionCard.unreadReportsLabel',
  [ClassAttentionMeasure.NO_STUDENTS]: 'attentionCard.noStudentsLabel',
  [ClassAttentionMeasure.NO_ASSIGNED_SIMS]: 'attentionCard.noSimsLabel',
} as const satisfies Record<ClassListFilterMeasure, string>;

/** Narrows an arbitrary string (e.g. a URL param) to a measure the class list can filter by. */
export const isClassListFilterMeasure = (
  value: string | null
): value is ClassListFilterMeasure =>
  value !== null && Object.hasOwn(LABEL_KEYS, value);

interface AttentionFilterChipProps {
  measure: ClassListFilterMeasure;
  /** Omitted while the count is still loading. */
  count?: number;
  onClear: () => void;
}

export function AttentionFilterChip({
  measure,
  count,
  onClear,
}: AttentionFilterChipProps) {
  const { t } = useTranslation('classManagement');

  return (
    <div
      role="status"
      aria-live="polite"
      className="px-3 sm:px-4 py-2 flex items-center gap-2"
    >
      <span className="text-xs text-gray-500">{t('toolbar.showing')}</span>
      <span className="inline-flex items-center gap-2 bg-[#5f6060] text-white text-xs font-medium rounded-full px-3 py-1">
        {t(LABEL_KEYS[measure])}
        {count !== undefined && ` (${count})`}
        <button
          type="button"
          onClick={onClear}
          aria-label={t('toolbar.clearFilter')}
          className="hover:text-gray-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70 rounded"
        >
          ×
        </button>
      </span>
    </div>
  );
}
