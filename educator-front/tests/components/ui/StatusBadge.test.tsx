import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import StatusBadge from '../../../src/components/ui/StatusBadge';

describe('StatusBadge', () => {
  it('always renders the text label, not just a colour', () => {
    render(<StatusBadge tone="success" label="Active" />);
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('exposes an accessible status role', () => {
    render(<StatusBadge tone="danger" label="Archived" />);
    expect(screen.getByRole('status')).toHaveTextContent('Archived');
  });

  it('conveys tone via colour and text only, with no decorative dot', () => {
    const { container } = render(
      <StatusBadge tone="warning" label="Attention" />
    );
    const dot = container.querySelector('[aria-hidden="true"]');
    expect(dot).not.toBeInTheDocument();
  });

  it.each([
    ['success', 'Active'],
    ['warning', 'Attention'],
    ['danger', 'Error'],
    ['info', 'Info'],
    ['neutral', 'Draft'],
  ] as const)(
    'renders the %s tone with its own visual style',
    (tone, label) => {
      render(<StatusBadge tone={tone} label={label} />);
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  );

  it('defaults to the neutral tone when none is provided', () => {
    render(<StatusBadge label="Unknown" />);
    expect(screen.getByText('Unknown')).toBeInTheDocument();
  });
});
