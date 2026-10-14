import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { ClassAvailability } from '../../utils/classUtils';
import { HoverTip } from '../ui/HoverTip';

interface ClassAvailabilityTipProps {
  availability: ClassAvailability;
  /** Why the action is blocked once the class has ended. */
  endedTip: string;
  /** The action's button; disable it yourself when `availability` is `ended`. */
  children: ReactNode;
}

/**
 * Explains a class action on hover/focus: why it's disabled once the class has
 * ended, or a note that the class is inactive. Open classes get no tooltip.
 */
export function ClassAvailabilityTip({
  availability,
  endedTip,
  children,
}: ClassAvailabilityTipProps) {
  const { t } = useTranslation('classManagement');

  if (availability === 'open') return <>{children}</>;

  // A disabled button can't take focus or hover, so the wrapper does both.
  return availability === 'ended' ? (
    <HoverTip tip={endedTip} className="inline-flex rounded-full">
      {children}
    </HoverTip>
  ) : (
    <HoverTip
      tip={t('classAvailability.inactive')}
      childFocusable
      className="inline-flex"
    >
      {children}
    </HoverTip>
  );
}
