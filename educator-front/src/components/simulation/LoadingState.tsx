import React from 'react';

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
}

const LoadingState: React.FC<LoadingStateProps> = ({ count = 6 }) => (
  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
    {Array.from({ length: count }).map((_, i) => (
      <SkeletonCard key={i} />
    ))}
  </div>
);

export default LoadingState;
