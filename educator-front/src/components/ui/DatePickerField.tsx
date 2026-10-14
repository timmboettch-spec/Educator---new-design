import { Calendar } from 'lucide-react';
import { useId, useRef } from 'react';
import dayjs from 'dayjs';
import { cn } from '../../lib/utils';
import Input from './Input';

interface DatePickerFieldProps {
  label: string;
  name: string;
  /** YYYY-MM-DD, as a native date input gives it; '' when empty. */
  value: string;
  /** YYYY-MM-DD bounds for the calendar; '' or omitted = no bound. */
  min?: string;
  max?: string;
  error?: string;
  disabled?: boolean;
  onChange: (value: string) => void;
  labelClassName?: string;
}

/**
 * A required date field shown as MM-DD-YYYY. The native date input is the
 * real, labelled field; the text box over it only shows the date and opens
 * the calendar on click.
 */
export function DatePickerField({
  label,
  name,
  value,
  min,
  max,
  error,
  disabled = false,
  onChange,
  labelClassName = 'text-xs text-gray-500',
}: DatePickerFieldProps) {
  const inputId = useId();
  const errorId = `${inputId}-error`;
  const pickerRef = useRef<HTMLInputElement>(null);

  return (
    <div>
      <label
        htmlFor={inputId}
        className={cn('block font-medium mb-1', labelClassName)}
      >
        {label}{' '}
        <span aria-hidden="true" className="text-red-500">
          *
        </span>
      </label>
      <div className="relative rounded-xl focus-within:ring-2 focus-within:ring-primary-400">
        <Input
          placeholder="MM-DD-YYYY"
          value={value ? dayjs(value).format('MM-DD-YYYY') : ''}
          readOnly
          tabIndex={-1}
          aria-hidden="true"
          onClick={() => !disabled && pickerRef.current?.showPicker?.()}
          inputClassName={cn(
            'pr-8',
            disabled
              ? 'bg-gray-100 text-gray-500 cursor-not-allowed'
              : 'cursor-pointer'
          )}
        />
        <Calendar
          size={14}
          aria-hidden="true"
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none"
        />
        <Input
          ref={pickerRef}
          id={inputId}
          type="date"
          name={name}
          value={value}
          min={min || undefined}
          max={max || undefined}
          disabled={disabled}
          aria-required="true"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          onChange={(e) => onChange(e.target.value)}
          className="sr-only"
        />
      </div>
      {error && (
        <p id={errorId} className="text-[10px] text-red-500 mt-0.5">
          {error}
        </p>
      )}
    </div>
  );
}
