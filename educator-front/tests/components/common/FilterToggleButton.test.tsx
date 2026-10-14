import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import '../../../src/i18n';
import { FilterToggleButton } from '../../../src/components/common/FilterToggleButton';

const setup = (
  props: Partial<Parameters<typeof FilterToggleButton>[0]> = {}
) => {
  const onClick = vi.fn();
  render(
    <FilterToggleButton
      activeCount={0}
      isOpen={false}
      onClick={onClick}
      panelId="panel-1"
      {...props}
    />
  );
  return { onClick };
};

describe('FilterToggleButton', () => {
  it('shows no badge and a plain label with nothing applied', () => {
    setup();
    const button = screen.getByRole('button', { name: 'Filters' });
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(button).not.toHaveAttribute('aria-controls');
    expect(button).not.toHaveClass('bg-neutral-strong');
    expect(button).not.toHaveTextContent(/\d/);
  });

  it('shows the count as a badge and in the accessible name', () => {
    setup({ activeCount: 3 });
    const button = screen.getByRole('button', { name: 'Filters, 3 applied' });
    expect(button).toHaveTextContent('3');
    expect(button).toHaveClass('bg-neutral-strong');
  });

  it('points at the open panel and highlights while open', () => {
    setup({ isOpen: true });
    const button = screen.getByRole('button', { name: 'Filters' });
    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(button).toHaveAttribute('aria-controls', 'panel-1');
    expect(button).toHaveClass('bg-neutral-strong');
  });

  it('calls onClick and accepts layout classes', () => {
    const { onClick } = setup({ className: 'ml-auto' });
    const button = screen.getByRole('button', { name: 'Filters' });
    expect(button).toHaveClass('ml-auto');
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
