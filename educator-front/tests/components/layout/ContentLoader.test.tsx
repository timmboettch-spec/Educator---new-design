import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import ContentLoader from '../../../src/components/layout/ContentLoader';

vi.mock('/assets/RealityworksAI_logo.svg', () => ({ default: 'logo.svg' }));

describe('ContentLoader', () => {
  it('renders nothing when visible is false', () => {
    const { container } = render(<ContentLoader visible={false} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders an accessible status region when visible (default)', () => {
    render(<ContentLoader />);
    const status = screen.getByRole('status');
    expect(status).toBeInTheDocument();
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(screen.getByText('Loading page content…')).toBeInTheDocument();
  });

  it('renders when visible is explicitly true', () => {
    render(<ContentLoader visible />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });
});
