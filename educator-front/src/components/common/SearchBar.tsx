import { X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { cn } from '../../lib/utils';
import { Button } from '../ui/Button';
import Input from '../ui/Input';

interface SearchBarProps {
  onSearch: (query: string) => void;
  placeholder?: string;
  debounceMs?: number;
  disabled?: boolean;
  value?: string;
  className?: string;
}

export const SearchBar = ({
  onSearch,
  placeholder = 'Search...',
  debounceMs = 300,
  disabled = false,
  value: controlledValue,
  className = '',
}: SearchBarProps) => {
  const [internalValue, setInternalValue] = useState(controlledValue || '');
  const [hasTyped, setHasTyped] = useState(false);

  useEffect(() => {
    if (controlledValue !== undefined) {
      setInternalValue(controlledValue);
    }
  }, [controlledValue]);

  const onSearchRef = useRef(onSearch);
  onSearchRef.current = onSearch;

  useEffect(() => {
    if (!hasTyped) return;
    const timer = setTimeout(() => {
      onSearchRef.current(internalValue);
    }, debounceMs);
    return () => clearTimeout(timer);
  }, [internalValue, debounceMs, hasTyped]);

  const handleClear = () => {
    setInternalValue('');
    setHasTyped(false);
    onSearch('');
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setHasTyped(true);
    const newValue = e.target.value;
    setInternalValue(newValue);
  };

  const preventDragAndDrop = (e: React.DragEvent<HTMLInputElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <div className={cn('relative w-full', className)}>
      <Input
        type="text"
        placeholder={placeholder}
        value={internalValue}
        disabled={disabled}
        onChange={handleChange}
        onDrop={preventDragAndDrop}
        onDragOver={preventDragAndDrop}
        onDragEnter={preventDragAndDrop}
        inputClassName="pl-10 pr-9 py-5 border border-gray-400 rounded-full placeholder:text-gray-600"
        className={disabled ? 'bg-neutral-50 cursor-not-allowed' : ''}
      />

      {internalValue && (
        <Button
          variant="ghost"
          size="icon"
          className="absolute right-3 top-1/2 -translate-y-1/2 h-7 w-7 hover:bg-transparent focus:outline-none focus:ring-0 focus-visible:ring-0 active:bg-transparent"
          onClick={handleClear}
          disabled={disabled}
          onMouseDown={(e) => e.preventDefault()}
        >
          <X className="h-4 w-4" style={{ color: '#9ca3af' }} />
        </Button>
      )}
    </div>
  );
};
