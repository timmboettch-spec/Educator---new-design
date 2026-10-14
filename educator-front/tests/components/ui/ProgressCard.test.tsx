import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import ProgressCard from '../../../src/components/ui/ProgressCard';

// A clickable card that also has action buttons: the card's own Enter/Space handler
// must not swallow keys pressed on its inner buttons (RE-33 keyboard requirement).
const renderCard = () => {
  const onCard = vi.fn();
  const onAction = vi.fn();
  render(
    <ProgressCard
      label="Classes Needing Attention"
      value="2 classes"
      onClick={onCard}
      actions={[
        { label: 'View Classes with No Students (1)', onClick: onAction },
      ]}
    />
  );
  return { onCard, onAction };
};

describe('ProgressCard – keyboard', () => {
  it.each(['{Enter}', ' '])(
    'activates only the focused action button with %s',
    async (key) => {
      const user = userEvent.setup();
      const { onCard, onAction } = renderCard();

      screen
        .getByRole('button', { name: 'View Classes with No Students (1)' })
        .focus();
      await user.keyboard(key);

      expect(onAction).toHaveBeenCalledTimes(1);
      expect(onCard).not.toHaveBeenCalled();
    }
  );

  it.each(['{Enter}', ' '])(
    'still activates the card itself with %s',
    async (key) => {
      const user = userEvent.setup();
      const { onCard, onAction } = renderCard();

      await user.tab();
      expect(
        screen.getByRole('button', { name: /Classes Needing Attention/ })
      ).toHaveFocus();
      await user.keyboard(key);

      expect(onCard).toHaveBeenCalledTimes(1);
      expect(onAction).not.toHaveBeenCalled();
    }
  );
});
