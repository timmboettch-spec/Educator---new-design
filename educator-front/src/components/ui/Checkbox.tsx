import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

interface Props {
  label?: string;
  checked?: boolean;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  name?: string;
  /** Shows a dash and reports "mixed" to assistive tech (e.g. a partly-selected list). */
  indeterminate?: boolean;
  disabled?: boolean;
  /** Accessible name when there is no visible `label`. */
  ariaLabel?: string;
  /** `sm` 16px (dense tables), `md` 20px (default), `lg` 24px (over card images). */
  size?: 'sm' | 'md' | 'lg';
  /** Extra classes for the visible box, e.g. a light style over an image. */
  boxClassName?: string;
  className?: string;
}

const SIZE_CLASS = {
  sm: 'w-4 h-4',
  md: 'w-5 h-5',
  lg: 'w-6 h-6 rounded-md',
} as const;

export default function Checkbox({
  label,
  checked,
  onChange,
  name,
  indeterminate = false,
  disabled = false,
  size = 'md',
  ariaLabel,
  boxClassName,
  className,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  // `indeterminate` is a DOM property only; it has no HTML attribute.
  useEffect(() => {
    if (inputRef.current) inputRef.current.indeterminate = indeterminate;
  }, [indeterminate]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !disabled) {
      e.preventDefault();
      onChange?.({
        target: { checked: !checked },
      } as React.ChangeEvent<HTMLInputElement>);
    }
  };

  const isMarked = checked || indeterminate;

  return (
    <label
      className={cn(
        'flex items-center gap-2 select-none',
        disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
        className
      )}
    >
      <input
        ref={inputRef}
        type="checkbox"
        name={name}
        checked={checked}
        disabled={disabled}
        aria-label={ariaLabel}
        onChange={onChange}
        onKeyDown={handleKeyDown}
        className="sr-only peer"
      />
      <span
        aria-hidden="true"
        className={cn(
          'rounded border-2 flex items-center justify-center shrink-0 transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-[#b45e20] peer-focus-visible:ring-offset-1',
          SIZE_CLASS[size],
          isMarked
            ? 'bg-primary-500 border-primary-500'
            : 'bg-white border-gray-300',
          boxClassName
        )}
      >
        {indeterminate && !checked ? (
          <svg width="10" height="2" viewBox="0 0 10 2" fill="none">
            <path
              d="M1 1H9"
              stroke="white"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        ) : (
          checked &&
          (size === 'lg' ? (
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="white"
              strokeWidth="3"
            >
              <path d="M5 13l4 4L19 7" />
            </svg>
          ) : (
            <svg width="11" height="9" viewBox="0 0 11 9" fill="none">
              <path
                d="M1 4L4 7.5L10 1"
                stroke="white"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          ))
        )}
      </span>
      {label && <span className="text-sm text-gray-500">{label}</span>}
    </label>
  );
}
