import React from 'react';

import type { ViewMode } from '../../types/simulation.types';

interface ViewToggleProps {
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
}

const ViewToggle: React.FC<ViewToggleProps> = ({ viewMode, onViewModeChange }) => (
  <div className="flex items-center gap-0.5 bg-white border border-slate-200 rounded-lg p-0.5">
    <button
      onClick={() => onViewModeChange('grid')}
      title="Grid View"
      aria-label="Grid View"
      aria-pressed={viewMode === 'grid'}
      className={`p-2 rounded-md transition-all duration-150 ${
        viewMode === 'grid'
          ? 'bg-primary-500 text-white shadow-sm'
          : 'text-slate-400 hover:text-slate-600'
      }`}
    >
      <svg
        width="15"
        height="15"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <rect x="3" y="3" width="7" height="7" />
        <rect x="14" y="3" width="7" height="7" />
        <rect x="14" y="14" width="7" height="7" />
        <rect x="3" y="14" width="7" height="7" />
      </svg>
    </button>
    <button
      onClick={() => onViewModeChange('list')}
      title="List View"
      aria-label="List View"
      aria-pressed={viewMode === 'list'}
      className={`p-2 rounded-md transition-all duration-150 ${
        viewMode === 'list'
          ? 'bg-primary-500 text-white shadow-sm'
          : 'text-slate-400 hover:text-slate-600'
      }`}
    >
      <svg
        width="15"
        height="15"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <line x1="8" y1="6" x2="21" y2="6" />
        <line x1="8" y1="12" x2="21" y2="12" />
        <line x1="8" y1="18" x2="21" y2="18" />
        <line x1="3" y1="6" x2="3.01" y2="6" />
        <line x1="3" y1="12" x2="3.01" y2="12" />
        <line x1="3" y1="18" x2="3.01" y2="18" />
      </svg>
    </button>
  </div>
);

export default ViewToggle;
