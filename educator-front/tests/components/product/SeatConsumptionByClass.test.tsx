import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom';
import SeatConsumptionByClass from '../../../src/components/myproducts/SeatConsumptionByClass';

const mockNavigate = vi.fn();

vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

describe('SeatConsumptionByClass Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  const mockRows = [
    {
      id: 'class-1',
      name: 'Class A',
      term: 'Spring 2025',
      students: 25,
    },
    {
      id: 'class-2',
      name: 'Class B',
      term: 'Fall 2025',
      students: 15,
    },
  ];

  it('renders nothing when usageRows is empty', () => {
    const { container } = render(
      <SeatConsumptionByClass
        isAdmin={true}
        usageRows={[]}
      />,
    );

    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when usageRows is undefined', () => {
    const { container } = render(
      <SeatConsumptionByClass isAdmin={true} />,
    );

    expect(container.firstChild).toBeNull();
  });

  it('renders class names', () => {
    render(
      <SeatConsumptionByClass
        isAdmin={true}
        usageRows={mockRows}
      />,
    );

    expect(screen.getByText('Class A')).toBeInTheDocument();
    expect(screen.getByText('Class B')).toBeInTheDocument();
  });

  it('renders term values', () => {
    render(
      <SeatConsumptionByClass
        isAdmin={true}
        usageRows={mockRows}
      />,
    );

    expect(screen.getByText('Spring 2025')).toBeInTheDocument();
    expect(screen.getByText('Fall 2025')).toBeInTheDocument();
  });

  it('renders student counts', () => {
    render(
      <SeatConsumptionByClass
        isAdmin={true}
        usageRows={mockRows}
      />,
    );

    expect(screen.getByText('25')).toBeInTheDocument();
    expect(screen.getByText('15')).toBeInTheDocument();
  });

  it('renders default Students label', () => {
    render(
      <SeatConsumptionByClass
        isAdmin={true}
        usageRows={mockRows}
      />,
    );

    expect(screen.getAllByText('Students')).toHaveLength(2);
  });

  it('renders custom seat label', () => {
    render(
      <SeatConsumptionByClass
        isAdmin={true}
        usageRows={mockRows}
        seatLabel="Classes"
      />,
    );

    expect(screen.getAllByText('Classes')).toHaveLength(2);
  });

  it('does not show Manage Seats button for admin', () => {
    render(
      <SeatConsumptionByClass
        isAdmin={true}
        usageRows={mockRows}
      />,
    );

    expect(
      screen.queryByText('Manage Seats'),
    ).not.toBeInTheDocument();
  });

  it('shows Manage Seats button for educator', () => {
    render(
      <SeatConsumptionByClass
        isAdmin={false}
        usageRows={mockRows}
      />,
    );

    expect(
      screen.getAllByText('Manage Seats'),
    ).toHaveLength(2);
  });

  it('navigates to classes page when Manage Seats clicked', () => {
    render(
      <SeatConsumptionByClass
        isAdmin={false}
        usageRows={mockRows}
      />,
    );

    fireEvent.click(screen.getAllByText('Manage Seats')[0]);

    expect(mockNavigate).toHaveBeenCalledWith('/classes', {
      state: {
        classId: 'class-1',
        expandType: 'sims',
      },
    });
  });

  it('stores student count in localStorage', () => {
    render(
      <SeatConsumptionByClass
        isAdmin={false}
        usageRows={mockRows}
      />,
    );

    fireEvent.click(screen.getAllByText('Manage Seats')[0]);

    expect(
      localStorage.getItem('seen_sims_class-1'),
    ).toBe('25');
  });

  it('handles second row navigation correctly', () => {
    render(
      <SeatConsumptionByClass
        isAdmin={false}
        usageRows={mockRows}
      />,
    );

    fireEvent.click(screen.getAllByText('Manage Seats')[1]);

    expect(mockNavigate).toHaveBeenCalledWith('/classes', {
      state: {
        classId: 'class-2',
        expandType: 'sims',
      },
    });

    expect(
      localStorage.getItem('seen_sims_class-2'),
    ).toBe('15');
  });

  it('renders multiple rows correctly', () => {
    render(
      <SeatConsumptionByClass
        isAdmin={false}
        usageRows={mockRows}
      />,
    );

    expect(screen.getByText('Class A')).toBeInTheDocument();
    expect(screen.getByText('Class B')).toBeInTheDocument();
    expect(screen.getAllByText('Manage Seats')).toHaveLength(2);
  });
});