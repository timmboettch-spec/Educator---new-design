import React from 'react';
import { X } from 'lucide-react';

export interface ActiveFilter {
  key: string;
  label: string;
  value: string;
  displayValue: string;
}

interface FilterChipsProps {
  filters: ActiveFilter[];
  onRemoveFilter: (key: string) => void;
  onClearAll: () => void;
  clearAllLabel?: string;
}

const FilterChips: React.FC<FilterChipsProps> = ({
  filters,
  onRemoveFilter,
  onClearAll,
  clearAllLabel = 'Clear All',
}) => {
  if (filters.length === 0) return null;

  return (
    <div className="mt-4 mb-4 flex flex-wrap items-center justify-between gap-2" role="region" aria-label="Active filters">
      <div className="flex flex-wrap items-center gap-2">
        {filters.map((filter) => (
          <div
            key={filter.key}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary-50 border border-primary-200 rounded-full text-sm text-primary-700"
          >
            <span className="font-medium">{filter.label}:</span>
            <span>{filter.displayValue}</span>
            <button
              onClick={() => onRemoveFilter(filter.key)}
              className="ml-1 p-0.5 hover:bg-primary-100 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary-400 focus:ring-offset-1"
              aria-label={`Remove ${filter.label} filter: ${filter.displayValue}`}
              type="button"
            >
              <X size={14} strokeWidth={2.5} />
            </button>
          </div>
        ))}
      </div>
      {filters.length > 0 && (
        <button
          onClick={onClearAll}
          className="px-3 py-1.5 text-sm font-medium text-slate-600 hover:text-primary-600 hover:bg-[#e9e9e9] rounded-full border border-slate-300 hover:border-primary-300 transition-colors focus:outline-none focus:ring-2 focus:ring-primary-400 focus:ring-offset-1"
          type="button"
          aria-label="Clear all filters"
        >
          {clearAllLabel}
        </button>
      )}
    </div>
  );
};

export default FilterChips;
