import React from 'react';
import { SkeletonRows } from '../ui/Skeleton';
import type { ViewMode } from '../../types/simulation.types';

const SkeletonCard: React.FC = () => (
  <div className="bg-white rounded-2xl overflow-hidden border border-slate-100 animate-pulse">
    <div className="h-44 bg-slate-200" />
    <div className="p-4 space-y-3">
      <div className="h-4 w-24 bg-slate-200 rounded-md" />
      <div className="h-4 w-3/4 bg-slate-200 rounded" />
      <div className="h-3 w-full bg-slate-100 rounded" />
      <div className="h-3 w-2/3 bg-slate-100 rounded" />
      <div className="flex gap-2 pt-2">
        <div className="flex-1 h-8 bg-slate-200 rounded-lg" />
        <div className="flex-1 h-8 bg-slate-200 rounded-lg" />
      </div>
    </div>
  </div>
);

interface LoadingStateProps {
  count?: number;
  /** Mirror the layout that will replace the skeleton. */
  layout?: ViewMode;
  /** Screen-reader text announced while loading. */
  label?: string;
}

const LIST_COLUMNS = 9;

const LoadingState: React.FC<LoadingStateProps> = ({
  count = 6,
  layout = 'grid',
  label,
}) => {
  if (layout === 'list') {
    return (
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <table className="w-full">
          <thead aria-hidden="true">
            <tr className="bg-primary-500 h-11">
              <th colSpan={LIST_COLUMNS} />
            </tr>
          </thead>
          <tbody>
            <SkeletonRows
              rows={count}
              columns={LIST_COLUMNS}
              label={label}
              cellClassName="px-4 py-4"
            />
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div role="status" aria-live="polite">
      {label && <span className="sr-only">{label}</span>}
      <div
        aria-hidden="true"
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
      >
        {Array.from({ length: count }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    </div>
  );
};

export default LoadingState;
