import { type InputHTMLAttributes, useState, useRef, useEffect } from 'react';
import { cn } from '../../lib/utils';
import { containsEmoji, stripEmoji, extractClipboardText } from '../../utils/emojiFilter';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  ref?: React.Ref<HTMLInputElement>;
  label?: string;
  error?: string;
  variant?: 'default' | 'filled' | 'underlined';
  labelClassName?: string;
  inputClassName?: string;
  required?: boolean;
  length?: number;
  img?: React.ReactNode;
  disablePasswordToggle?: boolean;
}

export default function Input({
  ref,
  label,
  error,
  variant: _variant = 'filled',
  type,
  className = '',
  labelClassName = '',
  inputClassName = '',
  required,
  length = 255,
  onChange,
  img,
  style,
  disablePasswordToggle = false,
  disabled,
  ...props
}: InputProps) {
  const [showPassword, setShowPassword] = useState(false);
  const isPassword = type === 'password';
  const inputType = isPassword ? (disablePasswordToggle ? 'password' : showPassword ? 'text' : 'password') : type;
  const inputStyle = style ?? {};

  useEffect(() => {
    if (!isPassword) {
      setShowPassword(false);
    }
  }, [isPassword]);

  const emojiBlockerRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const el = emojiBlockerRef.current;
    if (!el || disabled) return;

    const onBeforeInputNative = (e: InputEvent) => {
      if (e.data && containsEmoji(e.data)) {
        e.preventDefault();
      }
    };

    const onPasteNative = (e: ClipboardEvent) => {
      e.preventDefault();
      const clipboardData = e.clipboardData;
      if (!clipboardData) return;

      const cleanText = extractClipboardText(clipboardData) ?? '';
      const target = el;
      let start: number;
      let end: number;
      try {
        start = target.selectionStart ?? 0;
        end = target.selectionEnd ?? target.value.length;
      } catch {
        start = 0;
        end = target.value.length;
      }
      const newValue = target.value.slice(0, start) + cleanText + target.value.slice(end);

      const nativeSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value',
      )?.set;
      if (nativeSetter) {
        nativeSetter.call(target, newValue);
        target.dispatchEvent(new Event('input', { bubbles: true }));
      } else {
        target.value = newValue;
      }

      try {
        const newCursorPos = start + cleanText.length;
        target.setSelectionRange(newCursorPos, newCursorPos);
      } catch {
        // setSelectionRange is also unsupported for email/url/number inputs
      }
    };

    const onDropNative = (e: DragEvent) => {
      e.preventDefault();
      const dataTransfer = e.dataTransfer;
      if (!dataTransfer) return;

      const cleanText = extractClipboardText(dataTransfer as unknown as DataTransfer) ?? '';
      const target = el;
      const nativeSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value',
      )?.set;
      if (nativeSetter) {
        nativeSetter.call(target, cleanText);
        target.dispatchEvent(new Event('input', { bubbles: true }));
      } else {
        target.value = cleanText;
      }
    };

    const onCompositionEndNative = (e: CompositionEvent) => {
      const target = e.target as HTMLInputElement;
      if (containsEmoji(target.value)) {
        const cleanValue = stripEmoji(target.value);
        const nativeSetter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype,
          'value',
        )?.set;
        if (nativeSetter) {
          nativeSetter.call(target, cleanValue);
          target.dispatchEvent(new Event('input', { bubbles: true }));
        } else {
          target.value = cleanValue;
        }
      }
    };

    el.addEventListener('beforeinput', onBeforeInputNative);
    el.addEventListener('paste', onPasteNative);
    el.addEventListener('drop', onDropNative);
    el.addEventListener('compositionend', onCompositionEndNative);
    return () => {
      el.removeEventListener('beforeinput', onBeforeInputNative);
      el.removeEventListener('paste', onPasteNative);
      el.removeEventListener('drop', onDropNative);
      el.removeEventListener('compositionend', onCompositionEndNative);
    };
  }, [disabled]);

  return (
    <div className={cn('flex flex-col w-full', className)}>
      {label && (
        <label className={cn('text-sm font-medium text-gray-700 mb-0.5', labelClassName)}>
          {label} {required && <span className="text-red-500">*</span>}
        </label>
      )}

      <div className="relative w-full overflow-visible">
        {img && <div className="absolute left-3 top-1/2 -translate-y-1/2">{img}</div>}
        <input
          ref={(el) => {
            emojiBlockerRef.current = el;
            if (typeof ref === 'function') {
              (ref as (instance: HTMLInputElement | null) => void)(el);
            } else if (ref && typeof ref === 'object') {
              (ref as { current: HTMLInputElement | null }).current = el;
            }
          }}
          type={inputType}
          autoComplete="off"
          maxLength={length}
          required={required}
          disabled={disabled}
          className={cn(
            '[outline:none] transition-[border-color,background-color,box-shadow] duration-200 placeholder:text-gray-500 text-sm',
            type === 'checkbox'
              ? 'w-5 h-5'
              : cn(
                'w-full h-[38px] rounded-xl border-2 border-gray-300 focus:border-primary-400',
                img ? 'pl-10' : 'pl-3',
                isPassword ? 'hide-native-password-toggle' : '',
                isPassword ? 'pr-9' : 'pr-3',
              ),
            inputClassName,
          )}
          {...props}
          style={inputStyle}
          onChange={(e) => {
            if (containsEmoji(e.target.value)) {
              const cleanValue = stripEmoji(e.target.value);
              const nativeSetter = Object.getOwnPropertyDescriptor(
                window.HTMLInputElement.prototype,
                'value',
              )?.set;
              if (nativeSetter) {
                nativeSetter.call(e.target, cleanValue);
              } else {
                e.target.value = cleanValue;
              }
            }
            onChange?.(e);
          }}
        />
        {isPassword && !disablePasswordToggle && (
          <button
            type="button"
            onClick={() => setShowPassword((prev) => !prev)}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-dark-500 hover:text-primary-500 transition"
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            aria-pressed={showPassword}
          >
            {showPassword ? (
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            ) : (
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                <line x1="1" y1="1" x2="23" y2="23" />
              </svg>
            )}
          </button>
        )}
      </div>
      {error && <p className="text-[10px] h-3 mt-0.5 text-red-500">{error}</p>}
    </div>
  );
}
