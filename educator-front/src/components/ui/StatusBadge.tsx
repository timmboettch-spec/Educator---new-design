import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';

import { cn } from '../../lib/utils';

/**
 * Shared status/lifecycle indicator. Tone conveys meaning via the badge's
 * background/text colour together with the text label.
 */
const statusBadgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-caption font-medium leading-[16px] whitespace-nowrap',
  {
    variants: {
      tone: {
        success: 'bg-green-50 text-green-700',
        warning: 'bg-yellow-50 text-yellow-700',
        danger: 'bg-red-50 text-feedback-error',
        info: 'bg-blue-50 text-feedback-info',
        neutral: 'bg-neutral-100 text-text-secondary',
      },
    },
    defaultVariants: {
      tone: 'neutral',
    },
  }
);

export interface StatusBadgeProps
  extends
    React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof statusBadgeVariants> {
  /** Visible text label — always required, since colour alone never carries meaning. */
  label: string;
}

const StatusBadge = React.forwardRef<HTMLSpanElement, StatusBadgeProps>(
  ({ className, tone, label, ...props }, ref) => (
    <span
      ref={ref}
      role="status"
      className={cn(statusBadgeVariants({ tone }), className)}
      {...props}
    >
      {label}
    </span>
  )
);
StatusBadge.displayName = 'StatusBadge';

export default StatusBadge;
export { statusBadgeVariants };
