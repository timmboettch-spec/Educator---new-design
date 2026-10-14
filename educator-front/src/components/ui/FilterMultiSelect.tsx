import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { cn } from '../../lib/utils';
import { useInfiniteScrollTrigger } from '../../hooks/useInfiniteScrollTrigger';
import { DropdownLoader } from './DropdownLoader';

interface Option {
  label: string;
  value: string;
}

/**
 * Server-driven options: the search box is sent to the server instead of
 * filtering `options` locally, and scrolling to the end loads the next page.
 */
export interface MultiSelectServerOptions {
  onSearchChange: (search: string) => void;
  onLoadMore: () => void;
  hasMore: boolean;
  isFetchingMore: boolean;
  isError: boolean;
  onRetry: () => void;
}

/** Where a MultiSelect's options come from, when they're loaded lazily. */
export interface MultiSelectOptionsSource {
  /** Called whenever the dropdown opens (e.g. to start loading options). */
  onOpen?: () => void;
  /** Options are loading and none are shown yet. */
  loading?: boolean;
  /** Labels for selected values that aren't in the current `options`. */
  selectedLabels?: Record<string, string>;
  server?: MultiSelectServerOptions;
}

interface MultiSelectProps extends MultiSelectOptionsSource {
  label?: string;
  options: Option[];
  values: string[];
  placeholder?: string;
  searchable?: boolean;
  disabled?: boolean;
  onChange: (values: string[]) => void;
  /** Red asterisk after the label (matches SelectField). */
  required?: boolean;
  /**
   * Show "N <noun>" in the box instead of one chip per item, so it never
   * grows; returns the noun for a count, e.g. `(n) => n === 1 ? 'simulation' : 'simulations'`.
   */
  summarize?: (count: number) => string;
}

const statusRowClass = 'px-3 py-2 text-xs text-center text-gray-500';
const loaderRowClass = 'px-3 py-2 flex justify-center';

/** Load the next page once the list is scrolled within this distance of its end. */
const LOAD_MORE_ROOT_MARGIN = '40px';

export function FilterMultiSelect({
  label,
  options,
  values,
  placeholder,
  searchable = false,
  disabled,
  onChange,
  onOpen,
  loading = false,
  selectedLabels,
  server,
  required = false,
  summarize,
}: MultiSelectProps) {
  const { t } = useTranslation('common');
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [style, setStyle] = useState<React.CSSProperties>({});
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listboxRef = useRef<HTMLDivElement>(null);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const labelId = useId();

  const selected = values.map(
    (v) =>
      options.find((o) => o.value === v) ?? {
        value: v,
        label: selectedLabels?.[v] ?? v,
      }
  );
  // Server-driven options are already filtered by the search term.
  const filtered =
    searchable && !server
      ? options.filter((o) =>
          o.label.toLowerCase().includes(search.toLowerCase())
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
    const dropdownHeight = 300;
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const openUpward =
      spaceBelow < dropdownHeight && spaceAbove >= dropdownHeight;
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
    const reposition = () => setStyle(getPosition());
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    return () => {
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
    };
  }, [open]);

  const openDropdown = () => {
    setStyle(getPosition());
    setOpen(true);
    onOpen?.();
  };

  const handleSearchChange = (value: string) => {
    setSearch(value);
    server?.onSearchChange(value);
  };

  // A server search starts over from the full list each time the dropdown opens.
  const onServerSearchChange = server?.onSearchChange;
  useEffect(() => {
    if (open || !onServerSearchChange) return;
    setSearch('');
    onServerSearchChange('');
  }, [open, onServerSearchChange]);

  // Infinite scroll: a sentinel after the last option loads the next page when
  // it scrolls into the list's view (or when the loaded page doesn't fill it).
  const canLoadMore =
    open &&
    !loading &&
    !!server?.hasMore &&
    !server.isFetchingMore &&
    !server.isError;
  const sentinelRef = useInfiniteScrollTrigger({
    onLoadMore: () => server?.onLoadMore(),
    enabled: canLoadMore,
    rootRef: listboxRef,
    rootMargin: LOAD_MORE_ROOT_MARGIN,
  });

  const toggle = (val: string) =>
    onChange(
      values.includes(val) ? values.filter((v) => v !== val) : [...values, val]
    );
  const remove = (val: string) => onChange(values.filter((v) => v !== val));
  const clearAll = () => onChange([]);
  const selectAllVisible = () =>
    onChange(Array.from(new Set([...values, ...filtered.map((o) => o.value)])));

  useEffect(() => {
    if (!open) setFocusedIndex(-1);
  }, [open]);
  useEffect(() => {
    setFocusedIndex(-1);
  }, [search]);

  useEffect(() => {
    if (!open || focusedIndex < 0 || !listboxRef.current) return;
    const el = listboxRef.current.children[focusedIndex] as
      HTMLElement | undefined;
    el?.scrollIntoView({ block: 'nearest' });
  }, [focusedIndex, open]);

  const handleListKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setFocusedIndex((prev) => Math.min(prev + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setFocusedIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === 'Home') {
      e.preventDefault();
      setFocusedIndex(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      setFocusedIndex(filtered.length - 1);
    } else if (e.key === 'Enter') {
      const option = filtered[focusedIndex];
      if (option) {
        e.preventDefault();
        toggle(option.value);
      }
    }
  };

  return (
    <div ref={containerRef} className="flex flex-col w-full relative">
      {label && (
        <label
          id={labelId}
          className="text-xs sm:text-sm font-medium text-gray-700 mb-1 sm:mb-2 block"
        >
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}

      <div ref={triggerRef} className="relative">
        {/*
          The box is a plain wrapper: a native button fills it and opens the
          dropdown, while the chips and their remove/clear buttons are siblings
          layered on top (never nested inside the button). Chip text passes
          clicks through to the button.
        */}
        <div
          className={cn(
            'relative w-full min-h-[38px] px-2 py-1 rounded-xl bg-white text-sm flex items-center gap-1 flex-wrap border-2',
            open ? 'border-primary-400' : 'border-gray-300',
            !disabled && 'focus-within:border-primary-400',
            disabled && 'bg-gray-100 opacity-60'
          )}
        >
          <button
            ref={buttonRef}
            type="button"
            disabled={disabled}
            aria-haspopup="listbox"
            aria-expanded={open}
            aria-labelledby={label ? labelId : undefined}
            aria-label={
              label ? undefined : (placeholder ?? t('multiSelect.select'))
            }
            onClick={() => {
              if (open) setOpen(false);
              else openDropdown();
            }}
            onKeyDown={(e) => {
              if (!open) {
                if (
                  e.key === 'Enter' ||
                  e.key === ' ' ||
                  e.key === 'ArrowDown'
                ) {
                  e.preventDefault();
                  openDropdown();
                }
                return;
              }
              if (e.key === 'Escape') {
                e.preventDefault();
                setOpen(false);
              } else if (e.key === ' ') {
                const option = filtered[focusedIndex];
                if (option) {
                  e.preventDefault();
                  toggle(option.value);
                }
              } else {
                handleListKeyDown(e);
              }
            }}
            className={cn(
              'absolute inset-0 w-full rounded-xl outline-none',
              disabled ? 'cursor-not-allowed' : 'cursor-pointer'
            )}
          />

          {selected.length === 0 ? (
            <span className="relative pointer-events-none text-gray-500 px-1 py-1 flex-1 min-w-0 truncate">
              {placeholder ?? t('multiSelect.select')}
            </span>
          ) : summarize ? (
            <span className="relative pointer-events-none text-neutral-strong px-1 py-1 flex-1 min-w-0 truncate font-medium">
              {selected.length} {summarize(selected.length)}
            </span>
          ) : (
            selected.map((o) => (
              <span
                key={o.value}
                className="relative pointer-events-none inline-flex items-center gap-1 bg-[#e9e9e9] text-[#5f6060] border border-gray-300 px-3 py-1 rounded-full text-sm"
              >
                {o.label}
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => remove(o.value)}
                  className="pointer-events-auto text-gray-500 hover:text-black disabled:cursor-not-allowed"
                  aria-label={t('multiSelect.removeItem', { label: o.label })}
                >
                  ×
                </button>
              </span>
            ))
          )}

          <span className="relative pointer-events-none ml-auto flex items-center gap-2 pl-1">
            {selected.length > 0 && (
              <button
                type="button"
                disabled={disabled}
                onClick={clearAll}
                className="pointer-events-auto text-xs text-gray-500 hover:text-black disabled:cursor-not-allowed"
                aria-label={t('multiSelect.clearSelections')}
              >
                {t('multiSelect.clear')}
              </button>
            )}
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
          </span>
        </div>

        {open &&
          createPortal(
            <div
              ref={dropdownRef}
              data-select-dropdown
              style={style}
              onWheel={(e) => e.nativeEvent.stopPropagation()}
              className="bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden"
            >
              {searchable && (
                <div className="p-2 border-b border-gray-100">
                  <input
                    autoFocus
                    type="text"
                    value={search}
                    onChange={(e) => handleSearchChange(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') {
                        e.preventDefault();
                        setOpen(false);
                        buttonRef.current?.focus();
                        return;
                      }
                      handleListKeyDown(e);
                    }}
                    placeholder={t('multiSelect.search')}
                    className="w-full h-8 px-2 rounded-lg border border-gray-200 text-sm outline-none focus:border-primary-400"
                  />
                </div>
              )}

              <div className="flex items-center justify-between px-3 py-1.5 border-b border-gray-100 text-xs">
                <button
                  type="button"
                  onClick={selectAllVisible}
                  className="text-primary-600 hover:text-primary-700 font-medium"
                >
                  {t('multiSelect.selectAll')}
                </button>
                <button
                  type="button"
                  onClick={clearAll}
                  className="text-gray-500 hover:text-black font-medium"
                >
                  {t('multiSelect.clearAll')}
                </button>
              </div>

              <div
                ref={listboxRef}
                role="listbox"
                aria-multiselectable="true"
                aria-busy={loading || server?.isFetchingMore}
                className="overflow-y-auto py-1 max-h-56"
              >
                {filtered.length > 0 ? (
                  filtered.map((o, idx) => {
                    const checked = values.includes(o.value);
                    return (
                      <div
                        key={o.value}
                        role="option"
                        aria-selected={checked}
                        onClick={() => toggle(o.value)}
                        onMouseEnter={() => setFocusedIndex(idx)}
                        className={cn(
                          'flex items-center gap-2 px-3 py-2 text-sm cursor-pointer transition-colors',
                          idx === focusedIndex || checked
                            ? 'bg-[#e9e9e9] text-black'
                            : 'text-gray-800 hover:bg-[#e9e9e9] hover:text-black'
                        )}
                      >
                        <span
                          className={cn(
                            'w-4 h-4 rounded border flex items-center justify-center flex-shrink-0',
                            checked
                              ? 'bg-primary-500 border-primary-500 text-white'
                              : 'border-gray-300 bg-white'
                          )}
                        >
                          {checked && (
                            <svg
                              width="12"
                              height="12"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="3"
                            >
                              <path d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </span>
                        {o.label}
                      </div>
                    );
                  })
                ) : loading ? (
                  <div role="status" className={loaderRowClass}>
                    <DropdownLoader label={t('multiSelect.loading')} />
                  </div>
                ) : server?.isError ? null : (
                  <div className="px-3 py-2 text-sm text-gray-500">
                    {t('multiSelect.noData')}
                  </div>
                )}
                {server?.isError ? (
                  <div role="alert" className={statusRowClass}>
                    {t('multiSelect.loadFailed')}{' '}
                    <button
                      type="button"
                      onClick={server.onRetry}
                      className="text-primary-600 hover:text-primary-700 font-medium"
                    >
                      {t('multiSelect.retry')}
                    </button>
                  </div>
                ) : server?.isFetchingMore ? (
                  <div role="status" className={loaderRowClass}>
                    <DropdownLoader label={t('multiSelect.loading')} />
                  </div>
                ) : null}
                {canLoadMore && (
                  <div ref={sentinelRef} aria-hidden="true" className="h-px" />
                )}
              </div>
            </div>,
            document.body
          )}
      </div>
    </div>
  );
}
