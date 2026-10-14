import { AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import ProgressCard from '../ui/ProgressCard';
import CardSkeleton from '../ui/CardSkeleton';
import { useClassesNeedingAttention } from '../../hooks/useClassesNeedingAttention';
import { ClassAttentionMeasure } from '../../redux/api/classes/classes.types';
import type { ClassListFilterMeasure } from './AttentionFilterChip';

interface Props {
  onFilter: (measure: ClassListFilterMeasure) => void;
  /**
   * The quick filter currently applied (class list only). When passed, the
   * bucket buttons are toggles and the active one shows as pressed.
   */
  activeMeasure?: ClassListFilterMeasure | null;
}

export default function ClassesNeedingAttentionCard({
  onFilter,
  activeMeasure,
}: Props) {
  const { t } = useTranslation('classManagement');
  const attention = useClassesNeedingAttention();

  if (attention.status === 'loading') {
    return (
      <div role="status">
        <span className="sr-only">{t('attentionCard.loading')}</span>
        <CardSkeleton />
      </div>
    );
  }

  if (attention.status === 'failed') {
    return (
      <ProgressCard
        label={t('attentionCard.label')}
        value={t('attentionCard.error')}
        icon={AlertTriangle}
      />
    );
  }

  const bucketAction = (measure: ClassListFilterMeasure, label: string) => ({
    label,
    onClick: () => onFilter(measure),
    ...(activeMeasure !== undefined && {
      pressed: activeMeasure === measure,
    }),
  });

  if (attention.needingCount === 0) {
    return null;
  }

  return (
    <ProgressCard
      label={t('attentionCard.label')}
      value={t('attentionCard.value', { count: attention.needingCount })}
      progress={Math.min(attention.needingCount, attention.totalActive)}
      total={Math.max(attention.totalActive, 1)}
      subText={t('attentionCard.subText')}
      icon={AlertTriangle}
      largeActions
      actions={[
        bucketAction(
          ClassAttentionMeasure.UNREAD_REPORTS,
          t('attentionCard.unreadReportsAction', {
            count: attention.unreadCount,
          })
        ),
        bucketAction(
          ClassAttentionMeasure.NO_STUDENTS,
          t('attentionCard.noStudentsAction', {
            count: attention.noStudentsCount,
          })
        ),
        bucketAction(
          ClassAttentionMeasure.NO_ASSIGNED_SIMS,
          t('attentionCard.noSimsAction', { count: attention.noSimsCount })
        ),
      ]}
    />
  );
}
