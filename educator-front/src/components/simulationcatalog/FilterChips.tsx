import { X } from 'lucide-react';

interface FilterChip {
  key: string;
  label: string;
  value: string;
  displayValue: string;
}

interface FilterChipsProps {
  filters: FilterChip[];
  onRemove: (key: string) => void;
  onClearAll: () => void;
  labels?: {
    clearAll?: string;
  };
}

export const FilterChips = ({ filters, onRemove, onClearAll, labels }: FilterChipsProps) => {
  if (filters.length === 0) return null;

  return (
    <div className="px-6 mt-4 mb-4 flex flex-wrap items-center justify-between gap-2" role="region" aria-label="Active filters">
      <div className="flex flex-wrap items-center gap-2">
        {filters.map((filter) => (
          <div
            key={filter.key}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#e9e9e9] border border-gray-300 rounded-full text-sm text-[#5f6060]"
          >
            <span className="font-medium">{filter.label}:</span>
            <span>{filter.displayValue}</span>
            <button
              onClick={() => onRemove(filter.key)}
              className="ml-1 p-0.5 hover:bg-gray-300 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary-400 focus:ring-offset-1"
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
          className="px-3 py-1.5 text-sm font-medium text-slate-600 hover:text-primary-600 hover:bg-[#e9e9e9] rounded-full border border-slate-300 hover:border-gray-400 transition-colors focus:outline-none focus:ring-2 focus:ring-primary-400 focus:ring-offset-1"
          type="button"
          aria-label="Clear all filters"
        >
          {labels?.clearAll ?? 'Clear All'}
        </button>
      )}
    </div>
  );
};
