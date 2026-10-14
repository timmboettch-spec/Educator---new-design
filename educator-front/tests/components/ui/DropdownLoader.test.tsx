import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DropdownLoader } from '../../../src/components/ui/DropdownLoader';

describe('DropdownLoader', () => {
  it('shows a spinner and keeps the label for screen readers only', () => {
    const { container } = render(<DropdownLoader label="Loading…" />);
    const spinner = container.querySelector('svg');
    expect(spinner).toHaveClass('animate-spin');
    expect(spinner).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByText('Loading…')).toHaveClass('sr-only');
  });
});
