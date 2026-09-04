import { ChevronDown, ChevronsUpDown, ChevronUp } from "lucide-react";

type SortDirection = "asc" | "desc" | null;

interface SortableHeaderProps {
  label: string;
  field: string;
  sortField: string | null;
  sortDirection: SortDirection;
  onSort: (field: string) => void;
  className?: string;
}

export default function SortableHeader({
  label,
  field,
  sortField,
  sortDirection,
  onSort,
  className = "",
}: SortableHeaderProps) {
  const isActive = sortField === field;

  return (
    <button
      type="button"
      onClick={() => onSort(field)}
      aria-label={`Sort by ${label}${
        isActive ? (sortDirection === 'asc' ? ', sorted ascending' : ', sorted descending') : ''
      }`}
      className={`flex items-center gap-1 font-medium transition-colors rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:ring-offset-1 focus-visible:ring-offset-primary-500 ${className}`}
    >
      {label}
      <span className="flex flex-col">
        {isActive ? (
          sortDirection === "asc" ? (
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
