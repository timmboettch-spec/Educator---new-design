import { useEffect, useRef, useState } from 'react';

import { cn } from '../../lib/utils';

export interface SelectOption {
  value: string;

  label: string;
}

interface CustomSelectProps {
  options: SelectOption[];

  value: string;

  onChange: (value: string) => void;

  onBlur?: () => void;

  placeholder?: string;

  disabled?: boolean;

  error?: string;

  className?: string;
}

export default function CustomSelect({
  options,

  value,

  onChange,

  onBlur,

  placeholder = 'Select...',

  disabled = false,

  error,

  className = '',
}: CustomSelectProps) {
  const [open, setOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);

  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const selectedLabel = options.find((o) => o.value === value)?.label;

  // Close on outside click — do NOT call onBlur here to avoid

  // triggering cross-field touched/validation on other fields

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', handler);

    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleToggle = () => {
    if (!disabled) {
      const nextOpen = !open;
      setOpen(nextOpen);
      if (nextOpen) setFocusedIndex(options.findIndex((o) => o.value === value));
      else setFocusedIndex(-1);
    }
  };

  const handleSelect = (val: string) => {
    onChange(val);
    setOpen(false);
    setFocusedIndex(-1);
    // Only mark this field touched after a selection is made
    onBlur?.();
    // Return focus to trigger
    triggerRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;
    const count = options.length;
    switch (e.key) {
      case 'Enter':
      case ' ':
        e.preventDefault();
        if (open && focusedIndex >= 0) {
          handleSelect(options[focusedIndex].value);
        } else {
          setOpen(true);
          setFocusedIndex(
            Math.max(
              0,
              options.findIndex((o) => o.value === value),
            ),
          );
        }
        break;
      case 'ArrowDown':
        e.preventDefault();
        if (!open) {
          setOpen(true);
          setFocusedIndex(
            Math.max(
              0,
              options.findIndex((o) => o.value === value),
            ),
          );
        } else {
          setFocusedIndex((prev) => Math.min(prev + 1, count - 1));
        }
        break;
      case 'ArrowUp':
        e.preventDefault();
        if (open) setFocusedIndex((prev) => Math.max(prev - 1, 0));
        break;
      case 'Escape':
        e.preventDefault();
        setOpen(false);
        setFocusedIndex(-1);
        break;
      case 'Tab':
        // Let Tab flow naturally but close the dropdown
        setOpen(false);
        setFocusedIndex(-1);
        break;
    }
  };

  // Scroll highlighted option into view
  useEffect(() => {
    if (!open || focusedIndex < 0 || !listRef.current) return;
    const el = listRef.current.children[focusedIndex] as HTMLElement | undefined;
    el?.scrollIntoView({ block: 'nearest' });
  }, [focusedIndex, open]);

  return (
    <div ref={ref} className={cn('relative w-full', className)}>
      {/* Trigger */}
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={handleToggle}
        onKeyDown={handleKeyDown}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cn(
          'h-11 px-4 rounded-xl border-2 bg-white text-sm w-full flex items-center justify-between transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 focus-border',
          !disabled && !open && !error && 'border-gray-300 cursor-pointer',
          disabled && 'cursor-not-allowed bg-gray-50 text-gray-500 border-gray-200',
          open && 'border-primary-500 cursor-pointer',
          !open && error && 'border-red-400',
          !open && !disabled && !error && 'focus-visible:border-primary-500',
        )}
      >
        <span className={selectedLabel ? 'text-gray-900' : 'text-gray-500'}>
          {selectedLabel || placeholder}
        </span>
        <svg
          className={cn(
            'w-4 h-4 text-gray-500 transition-transform duration-200 shrink-0',
            open && 'rotate-180',
          )}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown list */}
      {open && (
        <div
          ref={listRef}
          role="listbox"
          className="absolute top-full mt-1 w-full bg-white border border-gray-300 rounded-xl shadow-lg z-50 overflow-auto max-h-56"
        >
          {options.map((opt, idx) => (
            <div
              key={opt.value}
              role="option"
              aria-selected={opt.value === value}
              onClick={() => handleSelect(opt.value)}
              onMouseEnter={() => setFocusedIndex(idx)}
              className={cn(
                'px-4 py-2 text-sm cursor-pointer transition-colors duration-150',
                idx === focusedIndex
                  ? 'bg-[#e9e9e9] text-black'
                  : opt.value === value
                    ? 'bg-[#5f6060] text-white font-medium'
                    : 'text-gray-700 hover:bg-[#e9e9e9] hover:text-black',
              )}
            >
              {opt.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
