import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../../lib/utils';

interface Option {
  label: string;
  value: string;
  selectedLabel?: string;
  disabled?: boolean;
}

interface SelectFieldProps {
  label?: string;
  error?: string;
  options: Option[];
  value?: string;
  placeholder?: string;
  required?: boolean;
  onChange?: (value: string) => void;
  disabled?: boolean;
  searchable?: boolean;
}

export default function SelectField({
  label,
  error,
  options,
  value,
  placeholder = 'Select',
  required,
  onChange,
  disabled,
  searchable = false,
}: SelectFieldProps) {
  const [open, setOpen] = useState(false);

  const [search, setSearch] = useState('');

  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});

  const [focusedIndex, setFocusedIndex] = useState(-1);

  const containerRef = useRef<HTMLDivElement>(null);

  const triggerRef = useRef<HTMLDivElement>(null);

  const dropdownRef = useRef<HTMLDivElement>(null);

  const normalListRef = useRef<HTMLDivElement>(null);

  const searchListRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find((o) => o.value === value);
  const selectedLabel =
    selectedOption?.selectedLabel || selectedOption?.label || '';

  const filteredOptions = searchable
    ? options.filter((opt) =>
        opt.label.toLowerCase().includes(search.toLowerCase())
      )
    : options;

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node) &&
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const getPosition = (): React.CSSProperties => {
    const el = triggerRef.current;
    if (!el) return {};
    const rect = el.getBoundingClientRect();
    const itemCount = options.length > 0 ? options.length : 1;
    const estimatedHeight = Math.min(232, itemCount * 38 + 16);
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const openUpward =
      spaceBelow < estimatedHeight && spaceAbove >= estimatedHeight;
    return openUpward
      ? {
          position: 'fixed',
          bottom: window.innerHeight - rect.top + 6,
          left: rect.left,
          width: rect.width,
          // Must exceed Modal's z-[99999] — both portal directly to document.body as siblings.
          zIndex: 100000,
        }
      : {
          position: 'fixed',
          top: rect.bottom + 6,
          left: rect.left,
          width: rect.width,
          zIndex: 100000,
        };
  };

  useEffect(() => {
    if (!open) return;
    const onResize = () => setDropdownStyle(getPosition());
    const onScroll = (e: Event) => {
      const target = e.target as Node;
      // Don't reposition when the user is scrolling inside the dropdown list itself
      if (searchListRef.current && searchListRef.current.contains(target))
        return;
      if (normalListRef.current && normalListRef.current.contains(target))
        return;
      if (dropdownRef.current && dropdownRef.current.contains(target)) return;
      setDropdownStyle(getPosition());
    };
    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [open]);

  const openDropdown = () => {
    setDropdownStyle(getPosition());
    setFocusedIndex(options.findIndex((o) => o.value === value));
    setOpen(true);
  };

  useEffect(() => {
    if (!open || focusedIndex < 0) return;
    const activeList = searchable
      ? searchListRef.current
      : normalListRef.current;
    if (!activeList) return;
    const el = activeList.children[focusedIndex] as HTMLElement | undefined;
    if (el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ block: 'nearest' });
    }
  }, [focusedIndex, open, searchable]);

  const handleNormalKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;
    const count = options.length;
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        if (!open) {
          openDropdown();
        } else {
          let next = focusedIndex;
          do {
            next = Math.min(next + 1, count - 1);
          } while (next < count - 1 && options[next]?.disabled);
          const nextOption = options[next];
          if (nextOption && !nextOption.disabled) setFocusedIndex(next);
        }
        break;
      case 'ArrowUp':
        e.preventDefault();
        if (open) {
          let prev = focusedIndex;
          do {
            prev = Math.max(prev - 1, 0);
          } while (prev > 0 && options[prev]?.disabled);
          const prevOption = options[prev];
          if (prevOption && !prevOption.disabled) setFocusedIndex(prev);
        }
        break;
      case 'Enter':
      case ' ': {
        e.preventDefault();
        const focusedOption = options[focusedIndex];
        if (open && focusedOption && !focusedOption.disabled) {
          onChange?.(focusedOption.value);
          setOpen(false);
          setFocusedIndex(-1);
        } else {
          openDropdown();
        }
        break;
      }
      case 'Escape':
        e.preventDefault();
        setOpen(false);
        setFocusedIndex(-1);
        break;
      case 'Tab':
        setOpen(false);
        setFocusedIndex(-1);
        break;
    }
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const count = filteredOptions.length;
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        if (!open) {
          openDropdown();
        } else setFocusedIndex((p) => Math.min(p + 1, count - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        if (open) setFocusedIndex((p) => Math.max(p - 1, 0));
        break;
      case 'Enter': {
        e.preventDefault();
        const focusedOption = filteredOptions[focusedIndex];
        if (open && focusedOption) {
          onChange?.(focusedOption.value);
          setSearch(focusedOption.label);
          setOpen(false);
          setFocusedIndex(-1);
        }
        break;
      }
      case 'Escape':
        e.preventDefault();
        setOpen(false);
        setFocusedIndex(-1);
        break;
      case 'Tab':
        setOpen(false);
        setFocusedIndex(-1);
        break;
    }
  };

  return (
    <div ref={containerRef} className="flex flex-col w-full relative">
      {label && (
        <label className="text-sm font-medium text-gray-700 mb-2">
          {label}

          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}

      {searchable ? (
        <div className="relative" ref={triggerRef}>
          <div
            className={cn(
              `
                w-full
                h-[38px]
                px-3
                rounded-xl
                bg-white
                text-sm
                flex
                items-center
                border-2
              `,
              open ? 'border-primary-400' : 'border-gray-300',
              disabled && 'bg-gray-100 cursor-not-allowed opacity-60',
              !open && !disabled && 'focus-within:border-primary-400'
            )}
          >
            <input
              type="text"
              disabled={disabled}
              value={open ? search : selectedLabel}
              placeholder={placeholder}
              autoComplete="off"
              onFocus={() => {
                setSearch('');
                setFocusedIndex(-1);
                openDropdown();
              }}
              onChange={(e) => {
                setSearch(e.target.value);
                setFocusedIndex(-1);
                if (!open) openDropdown();
              }}
              onKeyDown={handleSearchKeyDown}
              className="flex-1 min-w-0 bg-transparent outline-none border-none text-sm text-gray-700 placeholder:text-gray-500"
            />

            <button
              type="button"
              tabIndex={-1}
              onClick={() => {
                if (open) {
                  setOpen(false);
                } else {
                  setSearch('');
                  openDropdown();
                }
              }}
              className="ml-2"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className={cn(
                  'text-gray-500 transition-transform duration-200',
                  open && 'rotate-180'
                )}
              >
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>
          </div>

          {open &&
            createPortal(
              <div
                ref={dropdownRef}
                data-select-dropdown
                style={dropdownStyle}
                onWheel={(e) => e.nativeEvent.stopPropagation()}
                className="bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden"
              >
                <div
                  ref={searchListRef}
                  role="listbox"
                  className="
                  max-h-60
                  overflow-y-auto
                  py-1
                  [&::-webkit-scrollbar]:w-1.5
                  [&::-webkit-scrollbar-track]:bg-gray-100
                  [&::-webkit-scrollbar-track]:rounded-full
                  [&::-webkit-scrollbar-thumb]:bg-primary-300
                  [&::-webkit-scrollbar-thumb]:rounded-full
                  [&::-webkit-scrollbar-thumb:hover]:bg-primary-500
                "
                >
                  {filteredOptions.length > 0 ? (
                    filteredOptions.map((opt, idx) => (
                      <div
                        key={opt.value}
                        role="option"
                        aria-selected={value === opt.value}
                        onClick={() => {
                          onChange?.(opt.value);
                          setSearch(opt.label);
                          setOpen(false);
                          setFocusedIndex(-1);
                        }}
                        onMouseEnter={() => setFocusedIndex(idx)}
                        className={cn(
                          'px-3 py-2 text-sm cursor-pointer transition-colors',
                          idx === focusedIndex
                            ? 'bg-primary-100 text-primary-700'
                            : value === opt.value
                              ? 'bg-primary-50 text-primary-500 font-medium'
                              : 'text-gray-800 hover:bg-primary-50 hover:text-primary-500'
                        )}
                      >
                        {opt.label}
                      </div>
                    ))
                  ) : (
                    <div className="px-3 py-2 text-sm text-gray-500">
                      No data found
                    </div>
                  )}
                </div>
              </div>,
              document.body
            )}
        </div>
      ) : (
        /* NORMAL SELECT */
        <div className="relative" ref={triggerRef}>
          <button
            type="button"
            disabled={disabled}
            onClick={() => {
              if (open) {
                setOpen(false);
                setFocusedIndex(-1);
              } else {
                openDropdown();
              }
            }}
            onKeyDown={handleNormalKeyDown}
            aria-haspopup="listbox"
            aria-expanded={open}
            className={cn(
              `
    w-full
    h-[38px]
    px-3
    rounded-xl
    bg-white
    text-sm
    outline-none
    border-2
    flex
    items-center
    justify-between
    transition-colors
  `,
              open ? 'border-primary-400' : 'border-gray-300',
              !disabled &&
                'focus:outline-none focus:ring-0 focus:border-primary-400'
            )}
          >
            <span
              className={cn(
                'truncate',
                value ? 'text-gray-900' : 'text-gray-500'
              )}
            >
              {value ? selectedLabel : placeholder}
            </span>

            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className={cn(
                'text-gray-500 transition-transform duration-200',
                open && 'rotate-180'
              )}
            >
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>

          {open &&
            createPortal(
              <div
                ref={dropdownRef}
                data-select-dropdown
                style={dropdownStyle}
                onWheel={(e) => e.nativeEvent.stopPropagation()}
                className="bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden"
              >
                <div
                  ref={normalListRef}
                  role="listbox"
                  className="
                  max-h-60
                  overflow-y-auto
                  py-1
                  [&::-webkit-scrollbar]:w-1.5
                  [&::-webkit-scrollbar-track]:bg-gray-100
                  [&::-webkit-scrollbar-track]:rounded-full
                  [&::-webkit-scrollbar-thumb]:bg-primary-300
                  [&::-webkit-scrollbar-thumb]:rounded-full
                  [&::-webkit-scrollbar-thumb:hover]:bg-primary-500
                "
                >
                  {options.length > 0 ? (
                    options.map((opt, idx) => (
                      <div
                        key={opt.value}
                        role="option"
                        aria-selected={value === opt.value}
                        aria-disabled={opt.disabled}
                        onClick={() => {
                          if (opt.disabled) return;
                          onChange?.(opt.value);
                          setOpen(false);
                          setFocusedIndex(-1);
                        }}
                        onMouseEnter={() => {
                          if (!opt.disabled) setFocusedIndex(idx);
                        }}
                        className={cn(
                          'px-3 py-2 text-sm transition-colors',
                          opt.disabled
                            ? 'cursor-not-allowed text-gray-300'
                            : idx === focusedIndex
                              ? 'cursor-pointer bg-primary-100 text-primary-700'
                              : value === opt.value
                                ? 'cursor-pointer bg-primary-50 text-primary-500 font-medium'
                                : 'cursor-pointer text-gray-800 hover:bg-primary-50 hover:text-primary-500'
                        )}
                      >
                        {opt.label}
                      </div>
                    ))
                  ) : (
                    <div className="px-3 py-2 text-sm text-gray-500">
                      No data found
                    </div>
                  )}
                </div>
              </div>,
              document.body
            )}
        </div>
      )}

      {/* Error */}
      {error && <p className="text-[10px] text-red-500 mt-1">{error}</p>}
    </div>
  );
}
