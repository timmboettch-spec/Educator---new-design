import { ChevronDown, ChevronsUpDown, ChevronUp } from 'lucide-react';

type SortDirection = 'asc' | 'desc' | null;

interface SortableHeaderProps {
  label: string;
  field: string;
  sortField: string | null;
  sortDirection: SortDirection;
  onSort: (field: string) => void;
  className?: string;
  /** Puts the header in the tab order; off by default for existing tables. */
  focusable?: boolean;
  /** Accessible name carrying the sort state, e.g. "Class Name, sorted ascending". */
  ariaLabel?: string;
}

export default function SortableHeader({
  label,
  field,
  sortField,
  sortDirection,
  onSort,
  className = '',
  focusable = false,
  ariaLabel,
}: SortableHeaderProps) {
  const isActive = sortField === field;

  return (
    <button
      type="button"
      tabIndex={focusable ? undefined : -1}
      aria-label={ariaLabel}
      onClick={() => onSort(field)}
      className={`flex items-center gap-1 font-medium transition-colors ${
        focusable
          ? 'rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-white'
          : ''
      } ${className}`}
    >
      {label}
      <span className="flex flex-col" aria-hidden={focusable || undefined}>
        {isActive ? (
          sortDirection === 'asc' ? (
            <ChevronUp size={14} className="text-white-600" />
          ) : (
            <ChevronDown size={14} className="text-white-600" />
          )
        ) : (
          <ChevronsUpDown size={14} className="text-white-600" />
        )}
      </span>
    </button>
  );
}
