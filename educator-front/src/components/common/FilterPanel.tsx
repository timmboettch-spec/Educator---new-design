import { X } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import SelectField from '../ui/Select';
import { useTranslation } from 'react-i18next';
import {
  FilterMultiSelect,
  type MultiSelectOptionsSource,
} from '../ui/FilterMultiSelect';
import Input from '../ui/Input';
import { Button } from '../ui/Button';
import { toast } from './Toast';

interface Option {
  value: string;
  label: string;
}

interface BaseFilterField {
  label: string;
  placeholder: string;
  options: Option[];
  disabled?: boolean;
  searchable?: boolean;
}

interface SingleFilterField extends BaseFilterField {
  multiple?: false;
  type?: 'select' | 'input' | 'date';
  value: string;
  onChange: (val: string) => void;
}

// Opt-in multi-select: `values`/`onValuesChange` drive the field, and the
// `MultiSelectOptionsSource` fields (lazy/server-driven options) apply.
interface MultiFilterField extends BaseFilterField, MultiSelectOptionsSource {
  multiple: true;
  values: string[];
  onValuesChange: (vals: string[]) => void;
  /** Shown under the field, e.g. when more values are chosen than allowed. */
  error?: string;
  /** Shows "N <word>" in the box instead of a chip per value, so it never grows. */
  summarize?: (count: number) => string;
}

type FilterField = SingleFilterField | MultiFilterField;

interface FilterPanelProps {
  title: string;
  fields: FilterField[];
  onApply: () => void;
  onReset: () => void;
  onClose: () => void;
  applyLabel?: string;
  resetLabel?: string;
  noFiltersMessage?: string;
  /** Keeps Apply disabled, e.g. while a field shows an error. */
  isApplyDisabled?: boolean;
}

export default function FilterPanel({
  title,
  fields,
  onApply,
  onReset,
  onClose,
  applyLabel = 'Apply Filter',
  resetLabel = 'Reset Filter',
  noFiltersMessage = 'No filters applied',
  isApplyDisabled = false,
}: FilterPanelProps) {
  const { t } = useTranslation('common');
  const panelRef = useRef<HTMLDivElement>(null);
  // Links each date/text field's label to its input.
  const fieldIdBase = useId();
  const lastToastTimeRef = useRef(0);
  const [isApplying, setIsApplying] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const applyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** Disables Apply for `delayMs` (debounces rapid clicks). */
  const pauseApply = (delayMs: number) => {
    setIsApplying(true);
    if (applyTimerRef.current) clearTimeout(applyTimerRef.current);
    applyTimerRef.current = setTimeout(() => setIsApplying(false), delayMs);
  };

  // The panel usually closes right after Apply; don't update it once unmounted.
  useEffect(
    () => () => {
      if (applyTimerRef.current) clearTimeout(applyTimerRef.current);
    },
    []
  );

  // Move focus into the panel on open, and back to whatever opened it (the
  // filter button) on close — Apply, Reset-and-close, the X and Escape all
  // unmount the panel. Skipped if focus has already moved somewhere real.
  //
  // The opener is recorded once: StrictMode runs this effect twice in dev, and
  // by the second run focus is already inside the panel.
  const openerRef = useRef<Element | null>(null);
  useEffect(() => {
    if (!openerRef.current) openerRef.current = document.activeElement;
    const opener = openerRef.current;
    const focusable = panelRef.current?.querySelector<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
    focusable?.focus();
    return () => {
      const focusLost =
        !document.activeElement || document.activeElement === document.body;
      if (
        focusLost &&
        opener instanceof HTMLElement &&
        opener.isConnected &&
        !panelRef.current?.contains(opener)
      ) {
        opener.focus();
      }
    };
  }, []);
  const colsClass: Record<number, string> = {
    1: 'md:grid-cols-1',
    2: 'md:grid-cols-2',
    3: 'md:grid-cols-3',
    4: 'md:grid-cols-4',
    5: 'md:grid-cols-5',
  };

  return (
    <div
      ref={panelRef}
      role="region"
      aria-label={title}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose();
      }}
      className="mx-2 sm:mx-4 mb-4 mt-3 rounded-2xl bg-[#e9e9e9] px-3 sm:px-5 py-3 sm:py-4 relative min-w-0 overflow-hidden"
    >
      <div className="flex items-center justify-between gap-3 mb-3 sm:mb-4">
        <p className="text-xs sm:text-sm font-semibold text-primary-500 break-words min-w-0">
          {title}
        </p>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Button
            type="button"
            variant="secondary"
            className="h-8 px-3 sm:px-4 rounded-full text-xs sm:text-sm"
            disabled={isResetting}
            onClick={() => {
              setIsResetting(true);
              fields.forEach((field) => {
                if (field.multiple) field.onValuesChange([]);
                else field.onChange('');
              });
              onReset();
              setIsResetting(false);
            }}
          >
            {resetLabel}
          </Button>
          <Button
            type="button"
            variant="gradient"
            className="h-8 px-3 sm:px-4 rounded-full text-xs sm:text-sm"
            disabled={isApplying || isApplyDisabled}
            onClick={() => {
              const hasValue = fields.some((f) =>
                f.multiple ? f.values.length > 0 : f.value !== ''
              );
              if (!hasValue) {
                const now = Date.now();
                // Only show error toast if 2500ms has passed since last one
                if (now - lastToastTimeRef.current > 2500) {
                  toast.error(noFiltersMessage);
                  lastToastTimeRef.current = now;
                  pauseApply(500);
                }
                return;
              }

              pauseApply(300);
              onApply();
            }}
          >
            {applyLabel}
          </Button>
          <button
            onClick={onClose}
            aria-label={t('filterPanel.close')}
            className="text-gray-500 hover:text-gray-600 ml-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 focus-visible:ring-offset-1 rounded"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      <div
        className={`grid grid-cols-1 ${colsClass[Math.min(fields.length, 5)] ?? 'md:grid-cols-5'} gap-3 sm:gap-4 items-end`}
      >
        {fields.map((field, index) => (
          <div key={index} className="w-full min-w-0">
            {field.multiple ? (
              <>
                <FilterMultiSelect
                  label={field.label}
                  values={field.values}
                  placeholder={field.placeholder}
                  options={field.options}
                  onChange={field.onValuesChange}
                  searchable={field.searchable}
                  disabled={field.disabled}
                  onOpen={field.onOpen}
                  loading={field.loading}
                  selectedLabels={field.selectedLabels}
                  server={field.server}
                  summarize={field.summarize}
                />
                {field.error && (
                  <p role="alert" className="mt-1 text-xs text-red-600">
                    {field.error}
                  </p>
                )}
              </>
            ) : field.type === 'date' ? (
              <div className="flex flex-col">
                {field.label && (
                  <label
                    htmlFor={`${fieldIdBase}-${index}`}
                    className="text-xs sm:text-sm font-medium text-gray-700 mb-1 sm:mb-2"
                  >
                    {field.label}
                  </label>
                )}
                <input
                  id={`${fieldIdBase}-${index}`}
                  type="date"
                  value={field.value}
                  onChange={(e) => field.onChange(e.target.value)}
                  disabled={field.disabled}
                  className="w-full h-[38px] px-3 rounded-xl border-2 border-gray-300 bg-white text-sm text-gray-700 focus:border-primary-400 focus:outline-none"
                />
              </div>
            ) : field.type === 'input' ? (
              <div className="flex flex-col">
                {field.label && (
                  <label
                    htmlFor={`${fieldIdBase}-${index}`}
                    className="text-xs sm:text-sm font-medium text-gray-700 mb-1 sm:mb-2"
                  >
                    {field.label}
                  </label>
                )}
                <Input
                  id={`${fieldIdBase}-${index}`}
                  value={field.value}
                  placeholder={field.placeholder}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    field.onChange(e.target.value)
                  }
                  disabled={field.disabled}
                />
              </div>
            ) : (
              <SelectField
                label={field.label}
                value={field.value}
                placeholder={field.placeholder}
                options={field.options || []}
                onChange={field.onChange}
                searchable={field.searchable}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
