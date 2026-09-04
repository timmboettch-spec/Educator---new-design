import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import '@testing-library/jest-dom';
import SeatsCard from '../../../src/components/myproducts/seatscard';

describe('SeatsCard Component', () => {
  it('renders title', () => {
    render(
      <SeatsCard
        title="Total Seats"
        value={100}
        icon={<span>ICON</span>}
      />,
    );

    expect(screen.getByText('Total Seats')).toBeInTheDocument();
  });

  it('renders numeric value', () => {
    render(
      <SeatsCard
        title="Total Seats"
        value={100}
        icon={<span>ICON</span>}
      />,
    );

    expect(screen.getByText('100')).toBeInTheDocument();
  });

  it('renders string value', () => {
    render(
      <SeatsCard
        title="Status"
        value="Active"
        icon={<span>ICON</span>}
      />,
    );

    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('renders subtitle when provided', () => {
    render(
      <SeatsCard
        title="Used Seats"
        value={20}
        subtitle="20% utilized"
        icon={<span>ICON</span>}
      />,
    );

    expect(screen.getByText('20% utilized')).toBeInTheDocument();
  });

  it('does not render subtitle when not provided', () => {
    render(
      <SeatsCard
        title="Used Seats"
        value={20}
        icon={<span>ICON</span>}
      />,
    );

    expect(
      screen.queryByText(/utilized/i),
    ).not.toBeInTheDocument();
  });

  it('renders icon', () => {
    render(
      <SeatsCard
        title="Total Seats"
        value={100}
        icon={<span data-testid="card-icon">ICON</span>}
      />,
    );

    expect(
      screen.getByTestId('card-icon'),
    ).toBeInTheDocument();
  });

  it('applies custom icon background color', () => {
    const { container } = render(
      <SeatsCard
        title="Total Seats"
        value={100}
        icon={<span>ICON</span>}
        iconBgColor="bg-green-100"
      />,
    );

    expect(
      container.querySelector('.bg-green-100'),
    ).toBeInTheDocument();
  });

  it('applies custom border color', () => {
    const { container } = render(
      <SeatsCard
        title="Total Seats"
        value={100}
        icon={<span>ICON</span>}
        borderColor="border-red-200"
      />,
    );

    expect(
      container.querySelector('.border-red-200'),
    ).toBeInTheDocument();
  });

  it('uses default icon background color', () => {
    const { container } = render(
      <SeatsCard
        title="Total Seats"
        value={100}
        icon={<span>ICON</span>}
      />,
    );

    expect(
      container.querySelector('.bg-blue-100'),
    ).toBeInTheDocument();
  });

  it('uses default border color', () => {
    const { container } = render(
      <SeatsCard
        title="Total Seats"
        value={100}
        icon={<span>ICON</span>}
      />,
    );

    expect(
      container.querySelector('.border-slate-200'),
    ).toBeInTheDocument();
  });

  it('renders all provided props together', () => {
    render(
      <SeatsCard
        title="Available Seats"
        value={50}
        subtitle="50% remaining"
        icon={<span data-testid="full-icon">ICON</span>}
        iconBgColor="bg-green-100"
        borderColor="border-green-300"
      />,
    );

    expect(screen.getByText('Available Seats')).toBeInTheDocument();
    expect(screen.getByText('50')).toBeInTheDocument();
    expect(screen.getByText('50% remaining')).toBeInTheDocument();
    expect(screen.getByTestId('full-icon')).toBeInTheDocument();
  });
});