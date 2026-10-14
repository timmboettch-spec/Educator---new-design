import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { HoverTip } from '../../../src/components/ui/HoverTip';

describe('HoverTip', () => {
  it('makes its wrapper the focusable, labelled trigger by default', () => {
    render(
      <HoverTip tip="Why it's off">
        <button type="button" disabled>
          Act
        </button>
      </HoverTip>
    );
    const wrapper = screen.getByLabelText("Why it's off");
    expect(wrapper).toHaveAttribute('tabindex', '0');

    fireEvent.mouseEnter(wrapper);
    expect(screen.getByRole('tooltip')).toHaveTextContent("Why it's off");
    fireEvent.mouseLeave(wrapper);
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('leaves focus and the name to a focusable child', () => {
    render(
      <HoverTip tip="A note" childFocusable>
        <button type="button">Act</button>
      </HoverTip>
    );
    const button = screen.getByRole('button', { name: 'Act' });
    expect(button.parentElement).not.toHaveAttribute('tabindex');
    expect(button.parentElement).not.toHaveAttribute('aria-label');

    // Announced on focus: the tip is the button's accessible description.
    expect(button).toHaveAccessibleDescription('A note');

    fireEvent.focus(button);
    expect(screen.getByRole('tooltip')).toHaveTextContent('A note');
  });
});
