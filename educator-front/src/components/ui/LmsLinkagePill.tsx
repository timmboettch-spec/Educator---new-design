import { Link2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { HoverTip } from './HoverTip';
import { LMS_PILL_TONE } from '../../utils/lmsLinkage';
import type { ClassLmsLinkageSummary } from '../../types/Class_types';

interface LmsLinkagePillProps {
  linkage: ClassLmsLinkageSummary;
  fallbackCourseName: string;
  className?: string;
}

export function LmsLinkagePill({
  linkage,
  fallbackCourseName,
  className,
}: LmsLinkagePillProps) {
  const { t } = useTranslation('classManagement');
  const provider = t(`table.lmsProvider.${linkage.provider}`);

  return (
    <HoverTip
      tip={t('table.lmsLinkedTo', {
        provider,
        course: `“${linkage.courseName ?? fallbackCourseName}”`,
      })}
      className={`flex w-fit items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${LMS_PILL_TONE} ${className ?? ''}`}
    >
      <Link2 size={11} aria-hidden="true" />
      {provider}
    </HoverTip>
  );
}
