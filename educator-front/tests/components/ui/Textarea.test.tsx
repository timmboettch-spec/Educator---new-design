import { render, fireEvent } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import Textarea from '../../../src/components/ui/Textarea';

describe('Textarea Component - Emoji Filtering (onBeforeInput)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('onBeforeInput Event - Direct Typing Prevention', () => {
    it('should prevent emoji before entering textarea', () => {
      const { container } = render(<Textarea />);
      const textarea = container.querySelector(
        'textarea'
      ) as HTMLTextAreaElement;

      const beforeInputEvent = new InputEvent('beforeinput', {
        data: '😀',
        bubbles: true,
        cancelable: true,
      });

      const preventDefaultSpy = vi.spyOn(beforeInputEvent, 'preventDefault');
      textarea.dispatchEvent(beforeInputEvent);

      expect(preventDefaultSpy).toHaveBeenCalled();
    });

    it('should prevent ZWJ emoji sequence', () => {
      const { container } = render(<Textarea />);
      const textarea = container.querySelector(
        'textarea'
      ) as HTMLTextAreaElement;

      const beforeInputEvent = new InputEvent('beforeinput', {
        data: '👨👩👧',
        bubbles: true,
        cancelable: true,
      });

      const preventDefaultSpy = vi.spyOn(beforeInputEvent, 'preventDefault');
      textarea.dispatchEvent(beforeInputEvent);

      expect(preventDefaultSpy).toHaveBeenCalled();
    });

    it('should prevent skin tone modifier emoji', () => {
      const { container } = render(<Textarea />);
      const textarea = container.querySelector(
        'textarea'
      ) as HTMLTextAreaElement;

      const beforeInputEvent = new InputEvent('beforeinput', {
        data: '👋🏽',
        bubbles: true,
        cancelable: true,
      });

      const preventDefaultSpy = vi.spyOn(beforeInputEvent, 'preventDefault');
      textarea.dispatchEvent(beforeInputEvent);

      expect(preventDefaultSpy).toHaveBeenCalled();
    });

    it('should prevent flag emoji', () => {
      const { container } = render(<Textarea />);
      const textarea = container.querySelector(
        'textarea'
      ) as HTMLTextAreaElement;

      const beforeInputEvent = new InputEvent('beforeinput', {
        data: '🇺🇸',
        bubbles: true,
        cancelable: true,
      });

      const preventDefaultSpy = vi.spyOn(beforeInputEvent, 'preventDefault');
      textarea.dispatchEvent(beforeInputEvent);

      expect(preventDefaultSpy).toHaveBeenCalled();
    });

    it('should allow regular text input', () => {
      const { container } = render(<Textarea />);
      const textarea = container.querySelector(
        'textarea'
      ) as HTMLTextAreaElement;

      const beforeInputEvent = new InputEvent('beforeinput', {
        data: 'hello',
        bubbles: true,
        cancelable: true,
      });

      const preventDefaultSpy = vi.spyOn(beforeInputEvent, 'preventDefault');
      textarea.dispatchEvent(beforeInputEvent);

      expect(preventDefaultSpy).not.toHaveBeenCalled();
    });

    it('should allow newlines', () => {
      const { container } = render(<Textarea />);
      const textarea = container.querySelector(
        'textarea'
      ) as HTMLTextAreaElement;

      const beforeInputEvent = new InputEvent('beforeinput', {
        data: '\n',
        bubbles: true,
        cancelable: true,
      });

      const preventDefaultSpy = vi.spyOn(beforeInputEvent, 'preventDefault');
      textarea.dispatchEvent(beforeInputEvent);

      expect(preventDefaultSpy).not.toHaveBeenCalled();
    });
  });

  describe('Paste Event - Emoji Removal', () => {
    it('should strip emoji from pasted text', () => {
      const { container } = render(<Textarea />);
      const textarea = container.querySelector(
        'textarea'
      ) as HTMLTextAreaElement;

      const pasteEvent = new ClipboardEvent('paste', {
        clipboardData: new DataTransfer(),
        bubbles: true,
        cancelable: true,
      });
      pasteEvent.clipboardData?.setData('text/plain', 'Line 1 😀\nLine 2');

      textarea.dispatchEvent(pasteEvent);

      expect(textarea.value).toBe('Line 1 \nLine 2');
    });

    it('should strip multiple emoji types', () => {
      const { container } = render(<Textarea />);
      const textarea = container.querySelector(
        'textarea'
      ) as HTMLTextAreaElement;

      const pasteEvent = new ClipboardEvent('paste', {
        clipboardData: new DataTransfer(),
        bubbles: true,
        cancelable: true,
      });
      pasteEvent.clipboardData?.setData(
        'text/plain',
        'Line 1 😀\nLine 2 with 👍\nLine 3 with 🇺🇸'
      );

      textarea.dispatchEvent(pasteEvent);

      expect(textarea.value).toBe('Line 1 \nLine 2 with \nLine 3 with ');
    });

    it('should handle paste with only emojis', () => {
      const { container } = render(<Textarea />);
      const textarea = container.querySelector(
        'textarea'
      ) as HTMLTextAreaElement;

      const pasteEvent = new ClipboardEvent('paste', {
        clipboardData: new DataTransfer(),
        bubbles: true,
        cancelable: true,
      });
      pasteEvent.clipboardData?.setData('text/plain', '😀😍👍');

      textarea.dispatchEvent(pasteEvent);

      expect(textarea.value).toBe('');
    });

    it('should preserve newlines and text', () => {
      const { container } = render(<Textarea />);
      const textarea = container.querySelector(
        'textarea'
      ) as HTMLTextAreaElement;

      const pasteEvent = new ClipboardEvent('paste', {
        clipboardData: new DataTransfer(),
        bubbles: true,
        cancelable: true,
      });
      pasteEvent.clipboardData?.setData(
        'text/plain',
        'First Line\n😀\nSecond Line'
      );

      textarea.dispatchEvent(pasteEvent);

      expect(textarea.value).toBe('First Line\n\nSecond Line');
    });
  });

  describe('No Text Conversion', () => {
    it('should NOT convert emoji to text descriptions', () => {
      const { container } = render(<Textarea />);
      const textarea = container.querySelector(
        'textarea'
      ) as HTMLTextAreaElement;

      const pasteEvent = new ClipboardEvent('paste', {
        clipboardData: new DataTransfer(),
        bubbles: true,
        cancelable: true,
      });
      pasteEvent.clipboardData?.setData('text/plain', '😀');

      textarea.dispatchEvent(pasteEvent);

      expect(textarea.value).not.toMatch(
        /grinning|smile|heart|eye|thumbs|up|like/i
      );
      expect(textarea.value).toBe('');
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty value', () => {
      const { container } = render(<Textarea />);
      const textarea = container.querySelector(
        'textarea'
      ) as HTMLTextAreaElement;

      const pasteEvent = new ClipboardEvent('paste', {
        clipboardData: new DataTransfer(),
        bubbles: true,
        cancelable: true,
      });
      pasteEvent.clipboardData?.setData('text/plain', '');

      textarea.dispatchEvent(pasteEvent);

      expect(textarea.value).toBe('');
    });

    it('should handle very long text with scattered emojis', () => {
      const { container } = render(<Textarea />);
      const textarea = container.querySelector(
        'textarea'
      ) as HTMLTextAreaElement;

      const longText =
        'A'.repeat(100) + '😀' + 'B'.repeat(100) + '👍' + 'C'.repeat(100);
      const pasteEvent = new ClipboardEvent('paste', {
        clipboardData: new DataTransfer(),
        bubbles: true,
        cancelable: true,
      });
      pasteEvent.clipboardData?.setData('text/plain', longText);

      textarea.dispatchEvent(pasteEvent);

      expect(textarea.value).toBe(
        'A'.repeat(100) + 'B'.repeat(100) + 'C'.repeat(100)
      );
    });

    it('should handle consecutive emojis', () => {
      const { container } = render(<Textarea />);
      const textarea = container.querySelector(
        'textarea'
      ) as HTMLTextAreaElement;

      const pasteEvent = new ClipboardEvent('paste', {
        clipboardData: new DataTransfer(),
        bubbles: true,
        cancelable: true,
      });
      pasteEvent.clipboardData?.setData('text/plain', 'A😀😍B👍🎉C');

      textarea.dispatchEvent(pasteEvent);

      expect(textarea.value).toBe('ABC');
    });
  });

  describe('onChange Safety Net — Programmatic Emoji Bypass Prevention', () => {
    it('should strip emoji from value when onChange fires with emoji content', () => {
      const { container } = render(<Textarea />);
      const textarea = container.querySelector(
        'textarea'
      ) as HTMLTextAreaElement;

      fireEvent.change(textarea, { target: { value: 'Hello 😀 World' } });

      expect(textarea.value).toBe('Hello  World');
    });

    it('should strip emoji-only value to empty string via onChange', () => {
      const { container } = render(<Textarea />);
      const textarea = container.querySelector(
        'textarea'
      ) as HTMLTextAreaElement;

      fireEvent.change(textarea, { target: { value: '😀😍👍' } });

      expect(textarea.value).toBe('');
    });

    it('should pass clean value to user onChange callback', () => {
      const mockOnChange = vi.fn();
      const { container } = render(<Textarea onChange={mockOnChange} />);
      const textarea = container.querySelector(
        'textarea'
      ) as HTMLTextAreaElement;

      fireEvent.change(textarea, { target: { value: 'test 🔥' } });

      expect(mockOnChange).toHaveBeenCalledTimes(1);
      expect(textarea.value).toBe('test ');
    });

    it('should preserve newlines and multi-line text without emoji', () => {
      const mockOnChange = vi.fn();
      const { container } = render(<Textarea onChange={mockOnChange} />);
      const textarea = container.querySelector(
        'textarea'
      ) as HTMLTextAreaElement;

      fireEvent.change(textarea, {
        target: { value: 'Line 1\nLine 2\nLine 3' },
      });

      expect(textarea.value).toBe('Line 1\nLine 2\nLine 3');
      expect(mockOnChange).toHaveBeenCalledTimes(1);
    });

    it('should strip ZWJ family emoji via onChange', () => {
      const { container } = render(<Textarea />);
      const textarea = container.querySelector(
        'textarea'
      ) as HTMLTextAreaElement;

      fireEvent.change(textarea, { target: { value: 'family: 👨‍👩‍👧' } });

      expect(textarea.value).toBe('family: ');
    });
  });

  describe('onCompositionEnd — OS Emoji Picker Prevention', () => {
    it('should strip emoji committed via composition', () => {
      const { container } = render(<Textarea />);
      const textarea = container.querySelector(
        'textarea'
      ) as HTMLTextAreaElement;

      const nativeSetter = Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype,
        'value'
      )?.set;
      nativeSetter?.call(textarea, '😶');

      const compositionEndEvent = new CompositionEvent('compositionend', {
        data: '😶',
        bubbles: true,
        cancelable: true,
      });
      textarea.dispatchEvent(compositionEndEvent);

      expect(textarea.value).toBe('');
    });

    it('should strip emoji in mixed value committed via composition', () => {
      const { container } = render(<Textarea />);
      const textarea = container.querySelector(
        'textarea'
      ) as HTMLTextAreaElement;

      const nativeSetter = Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype,
        'value'
      )?.set;
      nativeSetter?.call(textarea, 'Notes 🔥 important');

      const compositionEndEvent = new CompositionEvent('compositionend', {
        data: '🔥',
        bubbles: true,
        cancelable: true,
      });
      textarea.dispatchEvent(compositionEndEvent);

      expect(textarea.value).toBe('Notes  important');
    });

    it('should NOT strip normal accented text committed via composition', () => {
      const { container } = render(<Textarea />);
      const textarea = container.querySelector(
        'textarea'
      ) as HTMLTextAreaElement;

      const nativeSetter = Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype,
        'value'
      )?.set;
      nativeSetter?.call(textarea, 'café');

      const compositionEndEvent = new CompositionEvent('compositionend', {
        data: 'é',
        bubbles: true,
        cancelable: true,
      });
      textarea.dispatchEvent(compositionEndEvent);

      expect(textarea.value).toBe('café');
    });
  });
});
