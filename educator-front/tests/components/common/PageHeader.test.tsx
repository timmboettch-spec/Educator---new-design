import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { PageHeader } from '../../../src/components/common/PageHeader';

describe('PageHeader', () => {
  it('renders title and subtitle', () => {
    render(<PageHeader title="Schools" sub_text="Manage your schools" />);
    expect(screen.getByText('Schools')).toBeInTheDocument();
    expect(screen.getByText('Manage your schools')).toBeInTheDocument();
  });

  it('renders the action button when provided', () => {
    render(
      <PageHeader title="Schools" actionButton={<button>Add School</button>} />
    );
    expect(
      screen.getByRole('button', { name: 'Add School' })
    ).toBeInTheDocument();
  });

  it('does not render a summary-cards region when none is provided (empty state)', () => {
    const { container } = render(<PageHeader title="Schools" />);
    expect(container.querySelectorAll('.grid').length).toBe(0);
  });

  it('renders summary cards in the shared slot when provided', () => {
    render(
      <PageHeader
        title="Educators"
        summaryCards={
          <>
            <div>Total Seats</div>
            <div>Used Seats</div>
          </>
        }
      />
    );
    expect(screen.getByText('Total Seats')).toBeInTheDocument();
    expect(screen.getByText('Used Seats')).toBeInTheDocument();
  });

  it('renders center content in the header row when provided', () => {
    render(
      <PageHeader
        title="Classes"
        centerContent={<div>Classes needing attention</div>}
      />
    );
    expect(screen.getByText('Classes needing attention')).toBeInTheDocument();
  });

  it('does not render a center-content region when none is provided', () => {
    const { container } = render(<PageHeader title="Classes" />);
    expect(container.querySelector('.order-last')).toBeNull();
  });
});
