import React from 'react';
import { cn } from '@/lib/utils';

interface CatalogEmptyStateProps {
  title: string;
  body?: string;
  /** Grey box, as the design uses for "no simulations match the filters". */
  boxed?: boolean;
}

/** Message shown in place of a catalogue view that has nothing to list. */
export const CatalogEmptyState: React.FC<CatalogEmptyStateProps> = ({
  title,
  body,
  boxed = false,
}) => (
  <div
    role="status"
    className={cn(
      'py-16 text-center text-gray-500',
      boxed && 'px-4 bg-gray-50 border border-gray-200 rounded-xl'
    )}
  >
    <p className={cn(body && 'text-lg font-semibold')}>{title}</p>
    {body && <p className="mt-2 text-[13px]">{body}</p>}
  </div>
);
