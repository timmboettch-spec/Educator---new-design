import { render, fireEvent } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import Input from '../../../src/components/ui/Input';

describe('Input Component - Emoji Filtering (onBeforeInput)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('onBeforeInput Event - Direct Typing Prevention', () => {
    it('should prevent single emoji character before entering input', () => {
      const { container } = render(<Input />);
      const input = container.querySelector('input') as HTMLInputElement;

      const beforeInputEvent = new InputEvent('beforeinput', {
        data: '😀',
        bubbles: true,
        cancelable: true,
      });

      const preventDefaultSpy = vi.spyOn(beforeInputEvent, 'preventDefault');
      input.dispatchEvent(beforeInputEvent);

      expect(preventDefaultSpy).toHaveBeenCalled();
    });

    it('should prevent ZWJ emoji sequence', () => {
      const { container } = render(<Input />);
      const input = container.querySelector('input') as HTMLInputElement;

      const beforeInputEvent = new InputEvent('beforeinput', {
        data: '👨👩👧',
        bubbles: true,
        cancelable: true,
      });

      const preventDefaultSpy = vi.spyOn(beforeInputEvent, 'preventDefault');
      input.dispatchEvent(beforeInputEvent);

      expect(preventDefaultSpy).toHaveBeenCalled();
    });

    it('should prevent skin tone modifier emoji', () => {
      const { container } = render(<Input />);
      const input = container.querySelector('input') as HTMLInputElement;

      const beforeInputEvent = new InputEvent('beforeinput', {
        data: '👋🏽',
        bubbles: true,
        cancelable: true,
      });

      const preventDefaultSpy = vi.spyOn(beforeInputEvent, 'preventDefault');
      input.dispatchEvent(beforeInputEvent);

      expect(preventDefaultSpy).toHaveBeenCalled();
    });

    it('should prevent flag emoji', () => {
      const { container } = render(<Input />);
      const input = container.querySelector('input') as HTMLInputElement;

      const beforeInputEvent = new InputEvent('beforeinput', {
        data: '🇺🇸',
        bubbles: true,
        cancelable: true,
      });

      const preventDefaultSpy = vi.spyOn(beforeInputEvent, 'preventDefault');
      input.dispatchEvent(beforeInputEvent);

      expect(preventDefaultSpy).toHaveBeenCalled();
    });

    it('should allow regular text input', () => {
      const { container } = render(<Input />);
      const input = container.querySelector('input') as HTMLInputElement;

      const beforeInputEvent = new InputEvent('beforeinput', {
        data: 'hello',
        bubbles: true,
        cancelable: true,
      });

      const preventDefaultSpy = vi.spyOn(beforeInputEvent, 'preventDefault');
      input.dispatchEvent(beforeInputEvent);

      expect(preventDefaultSpy).not.toHaveBeenCalled();
    });

    it('should allow numbers input', () => {
      const { container } = render(<Input />);
      const input = container.querySelector('input') as HTMLInputElement;

      const beforeInputEvent = new InputEvent('beforeinput', {
        data: '12345',
        bubbles: true,
        cancelable: true,
      });

      const preventDefaultSpy = vi.spyOn(beforeInputEvent, 'preventDefault');
      input.dispatchEvent(beforeInputEvent);

      expect(preventDefaultSpy).not.toHaveBeenCalled();
    });

    it('should allow special characters', () => {
      const { container } = render(<Input />);
      const input = container.querySelector('input') as HTMLInputElement;

      const beforeInputEvent = new InputEvent('beforeinput', {
        data: '@#$%^&*()_+-=[]{}',
        bubbles: true,
        cancelable: true,
      });

      const preventDefaultSpy = vi.spyOn(beforeInputEvent, 'preventDefault');
      input.dispatchEvent(beforeInputEvent);

      expect(preventDefaultSpy).not.toHaveBeenCalled();
    });
  });

  describe('Paste Event - Emoji Removal from Clipboard', () => {
    it('should strip emoji from pasted text with emoji', () => {
      const { container } = render(<Input />);
      const input = container.querySelector('input') as HTMLInputElement;

      const pasteEvent = new ClipboardEvent('paste', {
        clipboardData: new DataTransfer(),
        bubbles: true,
        cancelable: true,
      });
      pasteEvent.clipboardData?.setData('text/plain', 'Hello 😀 World');

      input.dispatchEvent(pasteEvent);

      expect(input.value).toBe('Hello  World');
    });

    it('should strip multiple emoji types from paste', () => {
      const { container } = render(<Input />);
      const input = container.querySelector('input') as HTMLInputElement;

      const pasteEvent = new ClipboardEvent('paste', {
        clipboardData: new DataTransfer(),
        bubbles: true,
        cancelable: true,
      });
      pasteEvent.clipboardData?.setData('text/plain', 'test 😀 with 👍 and 🇺🇸');

      input.dispatchEvent(pasteEvent);

      expect(input.value).toBe('test  with  and ');
    });

    it('should handle paste with only emojis - no text entered', () => {
      const { container } = render(<Input />);
      const input = container.querySelector('input') as HTMLInputElement;

      const pasteEvent = new ClipboardEvent('paste', {
        clipboardData: new DataTransfer(),
        bubbles: true,
        cancelable: true,
      });
      pasteEvent.clipboardData?.setData('text/plain', '😀😍👍');

      input.dispatchEvent(pasteEvent);

      expect(input.value).toBe('');
    });

    it('should preserve text and special chars on paste', () => {
      const { container } = render(<Input />);
      const input = container.querySelector('input') as HTMLInputElement;

      const pasteEvent = new ClipboardEvent('paste', {
        clipboardData: new DataTransfer(),
        bubbles: true,
        cancelable: true,
      });
      pasteEvent.clipboardData?.setData('text/plain', 'user@email.com 😀 phone: 555-1234');

      input.dispatchEvent(pasteEvent);

      expect(input.value).toBe('user@email.com  phone: 555-1234');
    });

    it('should maintain cursor position after paste', () => {
      const { container } = render(<Input />);
      const input = container.querySelector('input') as HTMLInputElement;
      input.value = 'Hello ';
      input.setSelectionRange(6, 6);

      const pasteEvent = new ClipboardEvent('paste', {
        clipboardData: new DataTransfer(),
        bubbles: true,
        cancelable: true,
      });
      pasteEvent.clipboardData?.setData('text/plain', 'World');

      input.dispatchEvent(pasteEvent);

      expect(input.value).toBe('Hello World');
    });
  });

  describe('Drag and Drop - Emoji Removal', () => {
    it('should strip emoji from dropped text', () => {
      const { container } = render(<Input />);
      const input = container.querySelector('input') as HTMLInputElement;

      const dropEvent = new DragEvent('drop', {
        dataTransfer: new DataTransfer(),
        bubbles: true,
        cancelable: true,
      });
      dropEvent.dataTransfer?.setData('text/plain', 'dropped 😀 text');

      input.dispatchEvent(dropEvent);

      expect(input.value).toBe('dropped  text');
    });

    it('should prevent drop event default behavior', () => {
      const { container } = render(<Input />);
      const input = container.querySelector('input') as HTMLInputElement;

      const dropEvent = new DragEvent('drop', {
        dataTransfer: new DataTransfer(),
        bubbles: true,
        cancelable: true,
      });

      const preventDefaultSpy = vi.spyOn(dropEvent, 'preventDefault');
      input.dispatchEvent(dropEvent);

      expect(preventDefaultSpy).toHaveBeenCalled();
    });
  });

  describe('No Text Conversion to Description', () => {
    it('should NOT convert emoji to Grinning/Smile text', () => {
      const { container } = render(<Input />);
      const input = container.querySelector('input') as HTMLInputElement;

      const pasteEvent = new ClipboardEvent('paste', {
        clipboardData: new DataTransfer(),
        bubbles: true,
        cancelable: true,
      });
      pasteEvent.clipboardData?.setData('text/plain', '😀');

      input.dispatchEvent(pasteEvent);

      expect(input.value).not.toMatch(/grinning|smile|speechless|laugh/i);
      expect(input.value).toBe('');
    });

    it('should NOT convert emoji to Heart Eyes text', () => {
      const { container } = render(<Input />);
      const input = container.querySelector('input') as HTMLInputElement;

      const pasteEvent = new ClipboardEvent('paste', {
        clipboardData: new DataTransfer(),
        bubbles: true,
        cancelable: true,
      });
      pasteEvent.clipboardData?.setData('text/plain', '😍');

      input.dispatchEvent(pasteEvent);

      expect(input.value).not.toMatch(/heart|eye|love|face/i);
      expect(input.value).toBe('');
    });

    it('should NOT convert emoji to Thumbs Up text', () => {
      const { container } = render(<Input />);
      const input = container.querySelector('input') as HTMLInputElement;

      const pasteEvent = new ClipboardEvent('paste', {
        clipboardData: new DataTransfer(),
        bubbles: true,
        cancelable: true,
      });
      pasteEvent.clipboardData?.setData('text/plain', '👍');

      input.dispatchEvent(pasteEvent);

      expect(input.value).not.toMatch(/thumbs|up|like|good|ok/i);
      expect(input.value).toBe('');
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty paste event', () => {
      const { container } = render(<Input />);
      const input = container.querySelector('input') as HTMLInputElement;

      const pasteEvent = new ClipboardEvent('paste', {
        clipboardData: new DataTransfer(),
        bubbles: true,
        cancelable: true,
      });
      pasteEvent.clipboardData?.setData('text/plain', '');

      input.dispatchEvent(pasteEvent);

      expect(input.value).toBe('');
    });

    it('should handle very long text with scattered emojis', () => {
      const { container } = render(<Input />);
      const input = container.querySelector('input') as HTMLInputElement;

      const longText = 'A'.repeat(100) + '😀' + 'B'.repeat(100) + '👍' + 'C'.repeat(100);
      const pasteEvent = new ClipboardEvent('paste', {
        clipboardData: new DataTransfer(),
        bubbles: true,
        cancelable: true,
      });
      pasteEvent.clipboardData?.setData('text/plain', longText);

      input.dispatchEvent(pasteEvent);

      expect(input.value).toBe('A'.repeat(100) + 'B'.repeat(100) + 'C'.repeat(100));
    });

    it('should handle consecutive emojis', () => {
      const { container } = render(<Input />);
      const input = container.querySelector('input') as HTMLInputElement;

      const pasteEvent = new ClipboardEvent('paste', {
        clipboardData: new DataTransfer(),
        bubbles: true,
        cancelable: true,
      });
      pasteEvent.clipboardData?.setData('text/plain', 'A😀😍B👍🎉C');

      input.dispatchEvent(pasteEvent);

      expect(input.value).toBe('ABC');
    });
  });

  describe('onChange Safety Net — Programmatic Emoji Bypass Prevention', () => {
    it('should strip emoji from value when onChange fires with emoji content', () => {
      const { container } = render(<Input />);
      const input = container.querySelector('input') as HTMLInputElement;

      // Simulate a value that bypassed beforeinput (e.g. programmatic set or browser quirk)
      fireEvent.change(input, { target: { value: 'Hello 😀 World' } });

      expect(input.value).toBe('Hello  World');
    });

    it('should strip emoji-only value to empty string via onChange', () => {
      const { container } = render(<Input />);
      const input = container.querySelector('input') as HTMLInputElement;

      fireEvent.change(input, { target: { value: '😀😍👍' } });

      expect(input.value).toBe('');
    });

    it('should pass clean value to user onChange callback', () => {
      const mockOnChange = vi.fn();
      const { container } = render(<Input onChange={mockOnChange} />);
      const input = container.querySelector('input') as HTMLInputElement;

      fireEvent.change(input, { target: { value: 'test 🔥' } });

      expect(mockOnChange).toHaveBeenCalledTimes(1);
      expect(input.value).toBe('test ');
    });

    it('should call user onChange for clean text without stripping', () => {
      const mockOnChange = vi.fn();
      const { container } = render(<Input onChange={mockOnChange} />);
      const input = container.querySelector('input') as HTMLInputElement;

      fireEvent.change(input, { target: { value: 'clean text 123' } });

      expect(mockOnChange).toHaveBeenCalledTimes(1);
      expect(input.value).toBe('clean text 123');
    });

    it('should strip ZWJ emoji sequence via onChange', () => {
      const { container } = render(<Input />);
      const input = container.querySelector('input') as HTMLInputElement;

      fireEvent.change(input, { target: { value: 'name: 👨‍👩‍👧' } });

      expect(input.value).toBe('name: ');
    });

    it('should strip keycap emoji sequence via onChange', () => {
      const { container } = render(<Input />);
      const input = container.querySelector('input') as HTMLInputElement;

      // 1️⃣ = U+0031 + U+FE0F + U+20E3
      fireEvent.change(input, { target: { value: 'step 1️⃣' } });

      expect(input.value).toBe('step ');
    });
  });

  describe('onCompositionEnd — OS Emoji Picker Prevention', () => {
    it('should strip emoji committed via composition (OS emoji picker)', () => {
      const { container } = render(<Input />);
      const input = container.querySelector('input') as HTMLInputElement;

      // Simulate the OS emoji picker inserting a value through composition
      const nativeSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value',
      )?.set;
      nativeSetter?.call(input, '😶');

      const compositionEndEvent = new CompositionEvent('compositionend', {
        data: '😶',
        bubbles: true,
        cancelable: true,
      });
      input.dispatchEvent(compositionEndEvent);

      expect(input.value).toBe('');
    });

    it('should strip emoji in mixed value committed via composition', () => {
      const { container } = render(<Input />);
      const input = container.querySelector('input') as HTMLInputElement;

      const nativeSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value',
      )?.set;
      nativeSetter?.call(input, 'Hello 🔥');

      const compositionEndEvent = new CompositionEvent('compositionend', {
        data: '🔥',
        bubbles: true,
        cancelable: true,
      });
      input.dispatchEvent(compositionEndEvent);

      expect(input.value).toBe('Hello ');
    });

    it('should NOT strip normal text committed via composition', () => {
      const { container } = render(<Input />);
      const input = container.querySelector('input') as HTMLInputElement;

      const nativeSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value',
      )?.set;
      nativeSetter?.call(input, 'Héllo');

      const compositionEndEvent = new CompositionEvent('compositionend', {
        data: 'é',
        bubbles: true,
        cancelable: true,
      });
      input.dispatchEvent(compositionEndEvent);

      expect(input.value).toBe('Héllo');
    });
  });
});
