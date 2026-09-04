import { X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import SelectField from '../ui/Select';
import MultiSelect from '../ui/MultiSelect';
import Input from '../ui/Input';
import { Button } from '../ui/Button';
import { toast } from './Toast';

interface Option {
  value: string;
  label: string;
}

interface FilterField {
  label: string;
  value: string;
  placeholder: string;
  options: Option[];
  onChange: (val: string) => void;
  disabled?: boolean;
  searchable?: boolean;
  // 'date' renders a native date input (value is a YYYY-MM-DD string).
  type?: 'text' | 'date';
  // Opt-in multi-select: when true, `values`/`onValuesChange` drive the field.
  multiple?: boolean;
  values?: string[];
  onValuesChange?: (vals: string[]) => void;
}

interface FilterPanelProps {
  title: string;
  fields: FilterField[];
  onApply: () => void;
  onReset: () => void;
  onClose: () => void;
  applyLabel?: string;
  resetLabel?: string;
  noFiltersMessage?: string;
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
}: FilterPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const lastToastTimeRef = useRef(0);
  const [isApplying, setIsApplying] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  useEffect(() => {
    const focusable = panelRef.current?.querySelector<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    focusable?.focus();
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
        <p className="text-xs sm:text-sm font-semibold text-primary-500 break-words min-w-0">{title}</p>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Button
            type="button"
            variant="secondary"
            className="h-8 px-3 sm:px-4 rounded-full text-xs sm:text-sm"
            disabled={isResetting}
            onClick={() => {
              setIsResetting(true);
              fields.forEach((field) => {
                if (field.multiple) field.onValuesChange?.([]);
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
            disabled={isApplying}
            onClick={() => {
              const hasValue = fields.some((f) =>
                f.multiple ? (f.values?.length ?? 0) > 0 : f.value !== '',
              );
              if (!hasValue) {
                const now = Date.now();
                if (now - lastToastTimeRef.current > 2500) {
                  toast.error(noFiltersMessage);
                  lastToastTimeRef.current = now;
                  setIsApplying(true);
                  setTimeout(() => {
                    setIsApplying(false);
                  }, 500);
                }
                return;
              }
              setIsApplying(true);
              onApply();
              setTimeout(() => {
                setIsApplying(false);
              }, 300);
            }}
          >
            {applyLabel}
          </Button>
          <button
            onClick={onClose}
            aria-label="Close filters"
            className="text-gray-500 hover:text-gray-600 ml-1"
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
              <MultiSelect
                label={field.label}
                values={field.values ?? []}
                placeholder={field.placeholder}
                options={field.options}
                onChange={field.onValuesChange ?? (() => undefined)}
                searchable={field.searchable}
                disabled={field.disabled}
              />
            ) : field.type === 'date' ? (
              <div className="flex flex-col">
                {field.label && (
                  <label className="text-xs sm:text-sm font-medium text-gray-700 mb-1 sm:mb-2">{field.label}</label>
                )}
                <input
                  type="date"
                  value={field.value}
                  onChange={(e) => field.onChange(e.target.value)}
                  disabled={field.disabled}
                  className="w-full h-[38px] px-3 rounded-xl border-2 border-gray-300 bg-white text-sm text-gray-700 focus:border-primary-400 focus:outline-none"
                />
              </div>
            ) : field.options.length === 0 ? (
              <div className="flex flex-col">
                {field.label && (
                  <label className="text-xs sm:text-sm font-medium text-gray-700 mb-1 sm:mb-2">{field.label}</label>
                )}
                <Input
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
                options={field.options}
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
