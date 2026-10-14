import {
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { useInfiniteScrollTrigger } from '@/hooks/useInfiniteScrollTrigger';
import { DropdownLoader } from './DropdownLoader';

export interface MultiSelectOption {
  value: string;
  label: string;
  description?: string;
}

interface MultiSelectProps {
  label: string;
  // Shown on the trigger when nothing is selected, e.g. "All classes".
  placeholder: string;
  // Word used in the trigger's count, e.g. "classes" → "3 classes".
  summaryNoun: (count: number) => string;
  options: MultiSelectOption[];
  // Selected items carry their labels so they stay nameable when `options` changes (server search).
  selected: MultiSelectOption[];
  onChange: (selected: MultiSelectOption[]) => void;
  // Controlled search, so the parent can query the server as the user types.
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  loading?: boolean;
  // Shown in place of the options when they failed to load.
  error?: string;
  // Upper bound on selected items (e.g. a BE array limit); further options are disabled.
  maxSelected?: number;
  // More options exist than were loaded (paged BE list). With `onLoadMore` the
  // next page loads on scroll; without it the user is told to search.
  hasMore?: boolean;
  // Loads the next page when the list is scrolled to its end.
  onLoadMore?: () => void;
  // The next page is loading.
  isFetchingMore?: boolean;
  // Called whenever the dropdown opens (e.g. to start loading options lazily).
  onOpen?: () => void;
  // `single`: picking an option replaces the selection and closes the list.
  selectionMode?: 'multiple' | 'single';
  disabled?: boolean;
  className?: string;
  /**
   * Adds a "create" option after the matches when the search text doesn't
   * match an option exactly (and no more pages are left to load); called with
   * the trimmed search text. Pass it only once `options` are the results for
   * the current search text.
   */
  onCreate?: (name: string) => void;
  // Text of the create option, e.g. name → `Create class "name"`.
  createLabel?: (name: string) => string;
}

const DROPDOWN_MIN_WIDTH = 256;
const DROPDOWN_EST_HEIGHT = 320;

/**
 * Accessible multi-select with an optional server-driven search box. Selection is controlled
 * as `{ value, label }` items; keyboard: arrows/Home/End move, Enter/Space toggle, Escape closes.
 */
export function MultiSelect({
  label,
  placeholder,
  summaryNoun,
  options,
  selected,
  onChange,
  searchValue,
  onSearchChange,
  loading = false,
  error,
  maxSelected,
  hasMore = false,
  disabled = false,
  className,
  onCreate,
  createLabel,
  onLoadMore,
  isFetchingMore = false,
  onOpen,
  selectionMode = 'multiple',
}: MultiSelectProps) {
  const { t } = useTranslation('common');
  const baseId = useId();
  const labelId = `${baseId}-label`;
  const listboxId = `${baseId}-listbox`;
  const optionId = (index: number) => `${baseId}-option-${index}`;

  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [dropdownStyle, setDropdownStyle] = useState<CSSProperties>({});
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const searchable = onSearchChange !== undefined;
  const isSingle = selectionMode === 'single';
  const createName = (searchValue ?? '').trim();
  // Only offered once every match is loaded: an exact match could be on a
  // page that isn't loaded yet.
  const showCreate =
    searchable &&
    onCreate !== undefined &&
    createName.length > 0 &&
    !loading &&
    !error &&
    !hasMore &&
    !options.some((o) => o.label.toLowerCase() === createName.toLowerCase());
  // The create option sits after the matches, at index `options.length`.
  const createIndex = options.length;
  const itemCount = options.length + (showCreate ? 1 : 0);
  const selectedValues = new Set(selected.map((o) => o.value));
  const atLimit = maxSelected !== undefined && selected.length >= maxSelected;
  const isOptionDisabled = (option: MultiSelectOption) =>
    atLimit && !selectedValues.has(option.value);

  const getPosition = (): CSSProperties => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return {};
    const width = Math.max(rect.width, DROPDOWN_MIN_WIDTH);
    const left = Math.max(
      8,
      Math.min(rect.left, window.innerWidth - width - 8)
    );
    const openUpward =
      window.innerHeight - rect.bottom < DROPDOWN_EST_HEIGHT &&
      rect.top >= DROPDOWN_EST_HEIGHT;
    return openUpward
      ? {
          position: 'fixed',
          bottom: window.innerHeight - rect.top + 6,
          left,
          width,
          zIndex: 100000,
        }
      : {
          position: 'fixed',
          top: rect.bottom + 6,
          left,
          width,
          zIndex: 100000,
        };
  };

  // Infinite scroll: a sentinel after the last option loads the next page.
  const sentinelRef = useInfiniteScrollTrigger<HTMLLIElement>({
    onLoadMore: () => onLoadMore?.(),
    enabled:
      open &&
      hasMore &&
      onLoadMore !== undefined &&
      !isFetchingMore &&
      !loading &&
      !error,
    rootMargin: '40px',
    rootRef: listRef,
  });

  const close = (returnFocus: boolean) => {
    setOpen(false);
    setActiveIndex(-1);
    if (returnFocus) triggerRef.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        !triggerRef.current?.contains(target) &&
        !dropdownRef.current?.contains(target)
      ) {
        close(false);
      }
    };
    const reposition = (e: Event) => {
      if (
        e.type === 'scroll' &&
        dropdownRef.current?.contains(e.target as Node)
      )
        return;
      setDropdownStyle(getPosition());
    };
    document.addEventListener('mousedown', onMouseDown);
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    (searchable ? searchRef.current : listRef.current)?.focus();
  }, [open, searchable]);

  useEffect(() => {
    if (activeIndex < 0) return;
    const el = document.getElementById(optionId(activeIndex));
    if (el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ block: 'nearest' });
    }
  }, [activeIndex]);

  const openDropdown = () => {
    if (disabled) return;
    setDropdownStyle(getPosition());
    setActiveIndex(itemCount > 0 ? 0 : -1);
    setOpen(true);
    onOpen?.();
  };

  const create = () => {
    if (!showCreate) return;
    close(false);
    onCreate?.(createName);
  };

  const toggle = (option: MultiSelectOption) => {
    if (isOptionDisabled(option)) return;
    if (isSingle) {
      // Picking the current option keeps it; Clear is how to empty the field.
      if (!selectedValues.has(option.value)) onChange([option]);
      close(true);
      return;
    }
    onChange(
      selectedValues.has(option.value)
        ? selected.filter((o) => o.value !== option.value)
        : [...selected, option]
    );
  };

  const onListKeyDown = (
    e: KeyboardEvent<HTMLElement>,
    fromSearch: boolean
  ) => {
    const last = itemCount - 1;
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, last));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
        break;
      case 'Home':
        if (fromSearch) return;
        e.preventDefault();
        setActiveIndex(0);
        break;
      case 'End':
        if (fromSearch) return;
        e.preventDefault();
        setActiveIndex(last);
        break;
      case 'Enter':
      case ' ':
        // Space types into the search box; Enter always toggles.
        if (fromSearch && e.key === ' ') return;
        e.preventDefault();
        if (showCreate && activeIndex === createIndex) create();
        else if (options[activeIndex]) toggle(options[activeIndex]);
        break;
      case 'Escape':
        e.preventDefault();
        close(true);
        break;
      case 'Tab':
        close(false);
        break;
      default:
    }
  };

  const activeDescendant =
    open && activeIndex >= 0 && activeIndex < itemCount
      ? optionId(activeIndex)
      : undefined;

  const canClear = selected.length > 0 && !disabled;

  const triggerText =
    selected.length === 0
      ? placeholder
      : isSingle
        ? (selected[0]?.label ?? placeholder)
        : t('multiSelect.selectedCount', {
            count: selected.length,
            noun: summaryNoun(selected.length),
          });

  return (
    <div className={cn('min-w-0', className)}>
      <span id={labelId} className="sr-only">
        {label}
      </span>
      {/* Clear sits over the trigger (a button can't contain another button). */}
      <div className="relative">
        <button
          ref={triggerRef}
          type="button"
          disabled={disabled}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={open ? listboxId : undefined}
          aria-labelledby={`${labelId} ${baseId}-value`}
          onClick={() => (open ? close(false) : openDropdown())}
          onKeyDown={(e) => {
            if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
              e.preventDefault();
              openDropdown();
            }
          }}
          className={cn(
            'w-full min-h-[38px] px-3 rounded-xl border-2 bg-white text-sm flex items-center justify-between gap-2 text-left transition-colors',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400',
            open
              ? 'border-primary-400'
              : 'border-gray-300 hover:border-gray-400',
            disabled && 'bg-gray-100 cursor-not-allowed opacity-60'
          )}
        >
          <span
            id={`${baseId}-value`}
            className={cn(
              'flex-1 min-w-0 truncate',
              selected.length === 0
                ? 'text-gray-500'
                : 'text-neutral-strong font-medium',
              // Room for Clear, which sits over the trigger just before the arrow.
              canClear && 'pr-10'
            )}
          >
            {triggerText}
          </span>
          <ChevronDown
            size={16}
            aria-hidden="true"
            className={cn(
              'shrink-0 text-gray-500 transition-transform duration-200',
              open && 'rotate-180'
            )}
          />
        </button>
        {canClear && (
          <button
            type="button"
            onClick={() => {
              onChange([]);
              triggerRef.current?.focus();
            }}
            aria-label={t('multiSelect.clearSelection', { label })}
            className="absolute right-9 top-1/2 -translate-y-1/2 rounded px-1 text-xs text-gray-500 hover:text-black focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400"
          >
            {t('multiSelect.clear')}
          </button>
        )}
      </div>

      {open &&
        createPortal(
          <div
            ref={dropdownRef}
            data-select-dropdown
            style={dropdownStyle}
            className="bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden"
          >
            {searchable && (
              <div className="p-2 border-b border-gray-100">
                <input
                  ref={searchRef}
                  type="text"
                  value={searchValue ?? ''}
                  onChange={(e) => {
                    onSearchChange?.(e.target.value);
                    setActiveIndex(0);
                  }}
                  onKeyDown={(e) => onListKeyDown(e, true)}
                  placeholder={t('multiSelect.search')}
                  aria-label={t('multiSelect.search')}
                  aria-controls={listboxId}
                  aria-activedescendant={activeDescendant}
                  autoComplete="off"
                  className="w-full h-8 px-2 rounded-md border border-gray-300 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary-400"
                />
              </div>
            )}

            {atLimit && (
              <p className="px-3 pt-2 text-xs text-gray-500">
                {t('multiSelect.maxReached', { max: maxSelected })}
              </p>
            )}

            {!isSingle && selected.length > 0 && (
              <div className="px-3 pt-2 flex justify-end">
                <button
                  type="button"
                  onClick={() => onChange([])}
                  className="text-xs font-medium text-primary-600 hover:underline rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400"
                >
                  {t('multiSelect.clearAll')}
                </button>
              </div>
            )}

            <ul
              ref={listRef}
              id={listboxId}
              role="listbox"
              aria-multiselectable={!isSingle}
              aria-labelledby={labelId}
              aria-busy={loading && !error}
              aria-activedescendant={searchable ? undefined : activeDescendant}
              tabIndex={searchable ? -1 : 0}
              onKeyDown={(e) => onListKeyDown(e, false)}
              className="max-h-56 overflow-y-auto py-1 focus:outline-none"
            >
              {error && (
                <li role="alert" className="px-3 py-2 text-sm text-red-600">
                  {error}
                </li>
              )}
              {!error && loading && (
                <li className="px-3 py-2 flex justify-center">
                  <DropdownLoader label={t('multiSelect.loading')} />
                </li>
              )}
              {!error && !loading && itemCount === 0 && (
                <li className="px-3 py-2 text-sm text-gray-500">
                  {t('multiSelect.noResults')}
                </li>
              )}
              {!error &&
                !loading &&
                options.map((option, index) => {
                  const isSelected = selectedValues.has(option.value);
                  const isDisabled = isOptionDisabled(option);
                  return (
                    <li
                      key={option.value}
                      id={optionId(index)}
                      role="option"
                      aria-selected={isSelected}
                      aria-disabled={isDisabled || undefined}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => toggle(option)}
                      onMouseEnter={() => setActiveIndex(index)}
                      className={cn(
                        'px-3 py-2 flex items-start gap-2 text-sm',
                        isDisabled
                          ? 'cursor-not-allowed opacity-50'
                          : 'cursor-pointer',
                        index === activeIndex && 'bg-neutral-active'
                      )}
                    >
                      <span
                        aria-hidden="true"
                        className={cn(
                          'mt-0.5 h-4 w-4 shrink-0 rounded border flex items-center justify-center',
                          isSelected
                            ? 'bg-primary-500 border-primary-500 text-white'
                            : 'border-gray-400 bg-white'
                        )}
                      >
                        {isSelected && <Check size={12} strokeWidth={3} />}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-gray-800">
                          {option.label}
                        </span>
                        {option.description && (
                          <span className="block truncate text-xs text-gray-500">
                            {option.description}
                          </span>
                        )}
                      </span>
                    </li>
                  );
                })}
              {showCreate && (
                <li
                  id={optionId(createIndex)}
                  role="option"
                  aria-selected={false}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={create}
                  onMouseEnter={() => setActiveIndex(createIndex)}
                  className={cn(
                    'px-3 py-2 text-sm font-medium text-primary-600 cursor-pointer truncate',
                    activeIndex === createIndex && 'bg-neutral-active'
                  )}
                >
                  {createLabel ? createLabel(createName) : createName}
                </li>
              )}
              {onLoadMore && hasMore && !error && !loading && (
                <li
                  ref={sentinelRef}
                  aria-hidden="true"
                  className="px-3 py-2 flex justify-center"
                >
                  {isFetchingMore && (
                    <DropdownLoader label={t('multiSelect.loading')} />
                  )}
                </li>
              )}
            </ul>
            {!onLoadMore && hasMore && !error && !loading && (
              <p className="px-3 py-2 border-t border-gray-100 text-xs text-gray-500">
                {t('multiSelect.moreResults')}
              </p>
            )}
          </div>,
          document.body
        )}
    </div>
  );
}
