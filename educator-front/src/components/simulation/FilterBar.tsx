import React from 'react';

import type { FilterType } from '../../types/simulation.types';

interface FilterBarProps {
  activeFilter: FilterType;
  onFilterChange: (filter: FilterType) => void;
  onFiltersClick?: () => void;
  isFilterPanelOpen?: boolean;
  /** Optional search control rendered next to the filter icon (right-aligned). */
  search?: React.ReactNode;
  labels?: {
    all?: string;
    recentlyUsed?: string;
    recentlyAdded?: string;
    filters?: string;
  };
}

const FILTERS: FilterType[] = ['All', 'Recently Added'];

const FilterBar: React.FC<FilterBarProps> = ({
  activeFilter,
  onFilterChange,
  onFiltersClick,
  isFilterPanelOpen = false,
  search,
  labels,
}) => (
  <div className="flex items-center gap-2 flex-wrap">
    {FILTERS.map((filter) => {
      const isActive = activeFilter === filter;
      const displayLabel =
        filter === 'All'
          ? labels?.all ?? 'All'
          : filter === 'Recently Used'
            ? labels?.recentlyUsed ?? 'Recently Used'
            : labels?.recentlyAdded ?? 'Recently Added';
      return (
        <button
          key={filter}
          onClick={() => onFilterChange(filter)}
          className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-[13px] font-semibold transition-all duration-150 ${
            isActive
              ? 'bg-primary-500 text-white shadow-sm'
              : 'bg-white text-slate-500 border border-slate-200 hover:border-primary-300 hover:text-primary-500'
          }`}
        >
          {filter === 'Recently Used' && (
            <svg
              width="11"
              height="11"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
          )}
          {filter === 'Recently Added' && (
            <svg
              width="11"
              height="11"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
            >
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          )}
          {displayLabel}
        </button>
      );
    })}

    {/* Search + icon-only filter button, right-aligned (matches the sim catalog). */}
    <div className="ml-auto flex items-center gap-2 min-w-0">
      {search}
      <button
        onClick={onFiltersClick}
        aria-label={labels?.filters ?? 'Filters'}
        aria-pressed={isFilterPanelOpen}
        className={`w-9 h-9 flex-shrink-0 flex items-center justify-center rounded-full border transition-colors ${
          isFilterPanelOpen
            ? 'bg-[#5f6060] border-[#5f6060] text-white'
            : 'bg-white text-slate-500 border-slate-300 hover:border-primary-300 hover:text-primary-500'
        }`}
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
        </svg>
      </button>
    </div>
  </div>
);

export default FilterBar;
