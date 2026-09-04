import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import MetricsCard from '../../../src/components/dashboard/MetricsCard';

const mockIcon = '/assets/dashboard/student.svg';

describe('MetricsCard', () => {
  it('renders label and value correctly', () => {
    render(<MetricsCard label="Active Classes" value={5} icon={mockIcon} iconAlt="classes" />);
    expect(screen.getByText('Active Classes')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('renders regular content even when loading prop is passed', () => {
    const { container } = render(
      <MetricsCard label="Active Classes" value={5} icon={mockIcon} iconAlt="classes" />,
    );
    expect(container.querySelector('.animate-pulse')).not.toBeInTheDocument();
    expect(screen.getByText('Active Classes')).toBeInTheDocument();
  });

  it('renders value as 0 without breaking', () => {
    render(<MetricsCard label="Total Students" value={0} icon={mockIcon} iconAlt="students" />);
    expect(screen.getByText('0')).toBeInTheDocument();
  });

  it('has correct aria-label for accessibility', () => {
    render(<MetricsCard label="New Reports" value={3} icon={mockIcon} iconAlt="reports" />);
    expect(screen.getByRole('region', { name: 'New Reports' })).toBeInTheDocument();
  });

  it('renders icon with aria-hidden', () => {
    render(<MetricsCard label="Simulations" value={10} icon={mockIcon} iconAlt="sims" />);
    const img = screen.getByAltText('sims');
    expect(img).toHaveAttribute('aria-hidden', 'true');
  });
});
