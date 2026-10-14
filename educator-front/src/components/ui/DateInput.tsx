import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { cn } from '../../lib/utils';

interface DateInputProps {
  label?: string;
  value?: string;
  onChange?: (value: string) => void;
  required?: boolean;
  disabled?: boolean;
  error?: string;
  className?: string;
  labelClassName?: string;
  placeholder?: string;
  minDate?: Date;
}

const parseDate = (val: string): Date | null => {
  if (!val) return null;
  const [mm, dd, yyyy] = val.split('-');
  if (!mm || !dd || !yyyy) return null;
  const d = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
  return isNaN(d.getTime()) ? null : d;
};

const formatDate = (date: Date): string => {
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const yyyy = date.getFullYear();
  return `${mm}-${dd}-${yyyy}`;
};

export default function DateInput({
  label,
  value = '',
  onChange,
  required,
  disabled,
  error,
  className,
  labelClassName,
  placeholder = 'MM-DD-YYYY',
  minDate,
}: DateInputProps) {
  return (
    <div className={cn('flex flex-col w-full', className)}>
      {label && (
        <label
          className={cn(
            'text-sm font-medium text-gray-700 mb-0.5',
            labelClassName
          )}
        >
          {label} {required && <span className="text-red-500">*</span>}
        </label>
      )}
      <DatePicker
        selected={parseDate(value)}
        onChange={(date: Date | null) => date && onChange?.(formatDate(date))}
        dateFormat="MM-dd-yyyy"
        placeholderText={placeholder}
        disabled={disabled}
        minDate={minDate}
        className={cn(
          'w-full h-[38px] px-3 rounded-xl border-2 border-gray-300 text-sm [outline:none] transition-[border-color,background-color,box-shadow]',
          'focus:border-orange-400',
          'placeholder:text-gray-400 cursor-pointer',
          disabled && 'opacity-50 cursor-not-allowed bg-gray-100'
        )}
        wrapperClassName="w-full"
        popperPlacement="bottom-start"
      />
      {error && <p className="text-[10px] h-3 mt-0.5 text-red-500">{error}</p>}
    </div>
  );
}
