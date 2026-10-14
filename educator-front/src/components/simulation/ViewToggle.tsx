import React from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import type { ViewMode } from '../../types/simulation.types';

interface ViewToggleProps {
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
}

const buttonClass = (active: boolean) =>
  cn(
    'p-2 rounded-md transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400',
    active
      ? 'bg-primary-500 text-white shadow-sm'
      : 'text-slate-400 hover:text-slate-600'
  );

const ViewToggle: React.FC<ViewToggleProps> = ({
  viewMode,
  onViewModeChange,
}) => {
  const { t } = useTranslation('simulationLibrary');

  return (
    <div
      role="group"
      aria-label={t('view.label')}
      className="flex items-center gap-0.5 bg-white border border-slate-200 rounded-lg p-0.5"
    >
      <button
        type="button"
        onClick={() => onViewModeChange('grid')}
        title={t('view.grid')}
        aria-label={t('view.grid')}
        aria-pressed={viewMode === 'grid'}
        className={buttonClass(viewMode === 'grid')}
      >
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden="true"
        >
          <rect x="3" y="3" width="7" height="7" />
          <rect x="14" y="3" width="7" height="7" />
          <rect x="14" y="14" width="7" height="7" />
          <rect x="3" y="14" width="7" height="7" />
        </svg>
      </button>
      <button
        type="button"
        onClick={() => onViewModeChange('list')}
        title={t('view.list')}
        aria-label={t('view.list')}
        aria-pressed={viewMode === 'list'}
        className={buttonClass(viewMode === 'list')}
      >
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden="true"
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
};

export default ViewToggle;
