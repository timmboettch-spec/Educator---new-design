import { useId, useState } from 'react';
import { cn } from '@/lib/utils';

export interface InlineCheckListOption {
  value: string;
  label: string;
}

interface InlineCheckListProps {
  /** The visible label above the list (e.g. the question it answers). */
  legend: string;
  options: InlineCheckListOption[];
  values: string[];
  onChange: (values: string[]) => void;
  searchPlaceholder: string;
  selectAllLabel: string;
  clearAllLabel: string;
  noMatchesLabel: string;
  disabled?: boolean;
}

/**
 * An always-open, searchable checkbox list with Select all / Clear all, which act
 * on the options matching the search. For short lists picked inside a form; use
 * `MultiSelect` for a dropdown.
 */
export function InlineCheckList({
  legend,
  options,
  values,
  onChange,
  searchPlaceholder,
  selectAllLabel,
  clearAllLabel,
  noMatchesLabel,
  disabled = false,
}: InlineCheckListProps) {
  const id = useId();
  const [search, setSearch] = useState('');

  const query = search.trim().toLowerCase();
  const shown = query
    ? options.filter((o) => o.label.toLowerCase().includes(query))
    : options;
  const selected = new Set(values);

  const toggle = (value: string) =>
    onChange(
      selected.has(value)
        ? values.filter((v) => v !== value)
        : [...values, value]
    );

  const selectAllShown = () =>
    onChange([
      ...values,
      ...shown.map((o) => o.value).filter((v) => !selected.has(v)),
    ]);

  const clearAllShown = () => {
    const shownValues = new Set(shown.map((o) => o.value));
    onChange(values.filter((v) => !shownValues.has(v)));
  };

  const linkButton =
    'text-xs font-medium rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 disabled:opacity-40 disabled:cursor-not-allowed';

  return (
    <fieldset disabled={disabled} className="min-w-0">
      <legend className="mb-2 text-sm font-medium text-gray-700">
        {legend}
      </legend>
      <div className="rounded-xl border border-gray-200 overflow-hidden">
        <div className="p-2">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
            aria-controls={`${id}-list`}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 placeholder:text-gray-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400"
          />
        </div>
        <div className="flex items-center justify-between px-3 py-2 border-y border-gray-100">
          <button
            type="button"
            onClick={selectAllShown}
            disabled={shown.length === 0}
            className={cn(
              linkButton,
              'text-primary-600 hover:text-primary-700'
            )}
          >
            {selectAllLabel}
          </button>
          <button
            type="button"
            onClick={clearAllShown}
            disabled={!shown.some((o) => selected.has(o.value))}
            className={cn(linkButton, 'text-gray-500 hover:text-gray-800')}
          >
            {clearAllLabel}
          </button>
        </div>
        {shown.length === 0 ? (
          <p className="px-3 py-4 text-sm text-gray-500 text-center">
            {noMatchesLabel}
          </p>
        ) : (
          <ul id={`${id}-list`} className="max-h-56 overflow-y-auto py-1">
            {shown.map((option) => {
              const isChecked = selected.has(option.value);
              return (
                <li key={option.value}>
                  <label
                    className={cn(
                      'flex items-center gap-3 px-3 py-2 text-sm text-gray-700 cursor-pointer hover:bg-[#e9e9e9]',
                      isChecked && 'bg-[#e9e9e9]'
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => toggle(option.value)}
                      className="h-4 w-4 flex-shrink-0 accent-primary-500"
                    />
                    <span className="min-w-0 break-words">{option.label}</span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </fieldset>
  );
}
