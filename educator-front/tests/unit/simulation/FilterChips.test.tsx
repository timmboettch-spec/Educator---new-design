import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import FilterChips, { type ActiveFilter } from '../../../src/components/simulation/FilterChips';

describe('FilterChips', () => {
  const mockOnRemoveFilter = vi.fn();
  const mockOnClearAll = vi.fn();

  const mockFilters: ActiveFilter[] = [
    {
      key: 'learnerLevel',
      label: 'Learner Level',
      value: 'Beginner',
      displayValue: 'Beginner',
    },
    {
      key: 'difficulty',
      label: 'Difficulty',
      value: 'Easy',
      displayValue: 'Easy',
    },
    {
      key: 'duration',
      label: 'Duration',
      value: '15–30 min',
      displayValue: '15–30 min',
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing when filters array is empty', () => {
    const { container } = render(
      <FilterChips
        filters={[]}
        onRemoveFilter={mockOnRemoveFilter}
        onClearAll={mockOnClearAll}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders all filter chips', () => {
    render(
      <FilterChips
        filters={mockFilters}
        onRemoveFilter={mockOnRemoveFilter}
        onClearAll={mockOnClearAll}
      />
    );

    expect(screen.getByText('Learner Level:')).toBeInTheDocument();
    expect(screen.getByText('Beginner')).toBeInTheDocument();
    expect(screen.getByText('Difficulty:')).toBeInTheDocument();
    expect(screen.getByText('Easy')).toBeInTheDocument();
    expect(screen.getByText('Duration:')).toBeInTheDocument();
    expect(screen.getByText('15–30 min')).toBeInTheDocument();
  });

  it('renders Clear All button when filters exist', () => {
    render(
      <FilterChips
        filters={mockFilters}
        onRemoveFilter={mockOnRemoveFilter}
        onClearAll={mockOnClearAll}
        clearAllLabel="Clear All"
      />
    );

    expect(screen.getByText('Clear All')).toBeInTheDocument();
  });

  it('calls onRemoveFilter when individual filter remove button is clicked', () => {
    render(
      <FilterChips
        filters={mockFilters}
        onRemoveFilter={mockOnRemoveFilter}
        onClearAll={mockOnClearAll}
      />
    );

    const removeButtons = screen.getAllByRole('button');
    // Click the first remove button (for learnerLevel)
    fireEvent.click(removeButtons[0]);

    expect(mockOnRemoveFilter).toHaveBeenCalledWith('learnerLevel');
    expect(mockOnRemoveFilter).toHaveBeenCalledTimes(1);
  });

  it('calls onClearAll when Clear All button is clicked', () => {
    render(
      <FilterChips
        filters={mockFilters}
        onRemoveFilter={mockOnRemoveFilter}
        onClearAll={mockOnClearAll}
      />
    );

    const clearAllButton = screen.getByText('Clear All');
    fireEvent.click(clearAllButton);

    expect(mockOnClearAll).toHaveBeenCalledTimes(1);
  });

  it('has proper aria-labels for accessibility', () => {
    render(
      <FilterChips
        filters={[mockFilters[0]]}
        onRemoveFilter={mockOnRemoveFilter}
        onClearAll={mockOnClearAll}
      />
    );

    expect(
      screen.getByLabelText('Remove Learner Level filter: Beginner')
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Clear all filters')).toBeInTheDocument();
  });

  it('has accessible region label', () => {
    render(
      <FilterChips
        filters={mockFilters}
        onRemoveFilter={mockOnRemoveFilter}
        onClearAll={mockOnClearAll}
      />
    );

    expect(screen.getByRole('region', { name: 'Active filters' })).toBeInTheDocument();
  });

  it('removes correct filter when multiple filters exist', () => {
    render(
      <FilterChips
        filters={mockFilters}
        onRemoveFilter={mockOnRemoveFilter}
        onClearAll={mockOnClearAll}
      />
    );

    const removeButtons = screen.getAllByRole('button');
    // Click the second remove button (for difficulty)
    fireEvent.click(removeButtons[1]);

    expect(mockOnRemoveFilter).toHaveBeenCalledWith('difficulty');
  });

  it('uses custom clearAllLabel when provided', () => {
    render(
      <FilterChips
        filters={mockFilters}
        onRemoveFilter={mockOnRemoveFilter}
        onClearAll={mockOnClearAll}
        clearAllLabel="Borrar todo"
      />
    );

    expect(screen.getByText('Borrar todo')).toBeInTheDocument();
  });
});
