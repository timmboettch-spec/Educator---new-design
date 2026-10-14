import { useEffect, useRef, type MouseEvent } from 'react';
import { cn } from '@/lib/utils';

interface SelectCheckboxProps {
  checked: boolean;
  // Some selected but not all: the native indeterminate state, announced as "mixed".
  indeterminate?: boolean;
  onChange: () => void;
  label: string;
  disabled?: boolean;
  className?: string;
}

/** Row / select-all checkbox for report tables, with a partial-selection state. */
export function SelectCheckbox({
  checked,
  indeterminate = false,
  onChange,
  label,
  disabled = false,
  className,
}: SelectCheckboxProps) {
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);

  return (
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      onChange={onChange}
      // Rows open on click; ticking the box must not.
      onClick={(e: MouseEvent) => e.stopPropagation()}
      aria-label={label}
      disabled={disabled}
      className={cn(
        'w-4 h-4 cursor-pointer align-middle accent-primary-500 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-40',
        className
      )}
    />
  );
}
