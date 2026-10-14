import {
  type TextareaHTMLAttributes,
  type ChangeEvent,
  useRef,
  useEffect,
} from 'react';
import { cn } from '../../lib/utils';
import {
  containsEmoji,
  stripEmoji,
  extractClipboardText,
} from '../../utils/emojiFilter';

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  labelClassName?: string;
  textareaClassName?: string;
}

export default function Textarea({
  label,
  error,
  className = '',
  labelClassName = '',
  textareaClassName = '',
  onChange,
  onBeforeInput: userOnBeforeInput,
  onDrop: userOnDrop,
  onCompositionEnd: userOnCompositionEnd,
  onInput: userOnInput,
  ...props
}: TextareaProps) {
  const emojiBlockerRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = emojiBlockerRef.current;
    if (!el) return;

    const onBeforeInputNative = (e: InputEvent) => {
      if (e.data && containsEmoji(e.data)) {
        e.preventDefault();
      }
    };

    const onPasteNative = (e: ClipboardEvent) => {
      e.preventDefault();
      const clipboardData = e.clipboardData;
      if (!clipboardData) return;

      const cleanText = extractClipboardText(clipboardData);
      const target = el;
      const start = target.selectionStart ?? target.value.length;
      const end = target.selectionEnd ?? target.value.length;
      const newValue =
        target.value.slice(0, start) +
        (cleanText ?? '') +
        target.value.slice(end);

      const nativeSetter = Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype,
        'value'
      )?.set;
      if (nativeSetter) {
        nativeSetter.call(target, newValue);
        target.dispatchEvent(new Event('input', { bubbles: true }));
      } else {
        target.value = newValue;
      }

      const newCursorPos = start + (cleanText ?? '').length;
      target.setSelectionRange(newCursorPos, newCursorPos);
    };

    el.addEventListener('beforeinput', onBeforeInputNative);
    el.addEventListener('paste', onPasteNative);
    return () => {
      el.removeEventListener('beforeinput', onBeforeInputNative);
      el.removeEventListener('paste', onPasteNative);
    };
  }, []);

  const handleBeforeInput = (e: React.InputEvent<HTMLTextAreaElement>) => {
    const data = (e.nativeEvent as InputEvent).data ?? '';
    if (!data || !containsEmoji(data)) {
      userOnBeforeInput?.(e);
    }
  };

  const handleInput = (e: React.InputEvent<HTMLTextAreaElement>) => {
    const target = e.target as HTMLTextAreaElement;
    if (containsEmoji(target.value)) {
      const cleanValue = stripEmoji(target.value);
      const nativeSetter = Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype,
        'value'
      )?.set;
      if (nativeSetter) {
        nativeSetter.call(target, cleanValue);
      } else {
        target.value = cleanValue;
      }
      target.dispatchEvent(new Event('change', { bubbles: true }));
    }
    userOnInput?.(e);
  };

  const handleDrop = (e: React.DragEvent<HTMLTextAreaElement>) => {
    e.preventDefault();
    const cleanText = extractClipboardText(e.dataTransfer);

    if (cleanText === null) {
      userOnDrop?.(e);
      return;
    }

    const target = e.target as HTMLTextAreaElement;
    const nativeSetter = Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype,
      'value'
    )?.set;
    if (nativeSetter) {
      nativeSetter.call(target, cleanText);
      target.dispatchEvent(new Event('input', { bubbles: true }));
    } else {
      target.value = cleanText;
    }

    userOnDrop?.(e);
  };

  const handleChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    if (containsEmoji(e.target.value)) {
      const cleanValue = stripEmoji(e.target.value);
      const nativeSetter = Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype,
        'value'
      )?.set;
      if (nativeSetter) {
        nativeSetter.call(e.target, cleanValue);
      } else {
        e.target.value = cleanValue;
      }
    }
    onChange?.(e);
  };

  const handleCompositionEnd = (
    e: React.CompositionEvent<HTMLTextAreaElement>
  ) => {
    const target = e.target as HTMLTextAreaElement;
    if (containsEmoji(target.value)) {
      const cleanValue = stripEmoji(target.value);
      const nativeSetter = Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype,
        'value'
      )?.set;
      if (nativeSetter) {
        nativeSetter.call(target, cleanValue);
        target.dispatchEvent(new Event('input', { bubbles: true }));
      } else {
        target.value = cleanValue;
      }
    }
    userOnCompositionEnd?.(e);
  };

  return (
    <div className={cn('flex flex-col w-full', className)}>
      {label && (
        <label
          className={cn(
            'text-sm font-medium text-gray-700 mb-0.5',
            labelClassName
          )}
        >
          {label}
        </label>
      )}

      <textarea
        ref={(el) => {
          emojiBlockerRef.current = el;
        }}
        className={cn(
          'w-full [outline:none] transition-[border-color,background-color,box-shadow] duration-200 placeholder:text-gray-400 text-sm px-3 rounded-xl border border-gray-300 focus:ring-2 focus:ring-orange-400 focus:ring-inset focus:bg-gray-100',
          textareaClassName
        )}
        onBeforeInput={handleBeforeInput}
        onInput={handleInput}
        onDrop={handleDrop}
        onChange={handleChange}
        onCompositionEnd={handleCompositionEnd}
        {...props}
      />

      {error && <p className="text-[10px] h-3 mt-0.5 text-red-500">{error}</p>}
    </div>
  );
}
