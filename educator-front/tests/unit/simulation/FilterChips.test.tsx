import { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act } from '@testing-library/react';
import i18n from '../../../src/i18n';
import FilterChips, {
  type ActiveFilter,
} from '../../../src/components/common/FilterChips';

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

    expect(
      screen.getByRole('region', { name: 'Active filters' })
    ).toBeInTheDocument();
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

  it('translates its labels with the active language', async () => {
    await act(() => i18n.changeLanguage('es'));
    try {
      render(
        <FilterChips
          filters={mockFilters.slice(0, 1)}
          onRemoveFilter={mockOnRemoveFilter}
          onClearAll={mockOnClearAll}
        />
      );
      expect(
        screen.getByRole('region', { name: 'Filtros activos' })
      ).toBeInTheDocument();
      expect(
        screen.getByRole('button', {
          name: 'Quitar filtro Learner Level: Beginner',
        })
      ).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: 'Borrar todos los filtros' })
      ).toHaveTextContent('Borrar todo');
    } finally {
      await act(() => i18n.changeLanguage('en'));
    }
  });

  it('moves focus to the neighbouring chip after one is removed', () => {
    function Harness() {
      const [filters, setFilters] = useState(mockFilters);
      return (
        <FilterChips
          filters={filters}
          onRemoveFilter={(key) =>
            setFilters((prev) => prev.filter((f) => f.key !== key))
          }
          onClearAll={() => setFilters([])}
        />
      );
    }
    render(<Harness />);
    const first = screen.getByRole('button', {
      name: 'Remove Learner Level filter: Beginner',
    });
    first.focus();
    fireEvent.click(first);
    // The next chip takes the removed chip's place, and focus.
    expect(
      screen.getByRole('button', { name: 'Remove Difficulty filter: Easy' })
    ).toHaveFocus();
  });

  it('moves focus to the previous chip when the last chip in the row is removed', () => {
    function Harness() {
      const [filters, setFilters] = useState(mockFilters.slice(0, 2));
      return (
        <FilterChips
          filters={filters}
          onRemoveFilter={(key) =>
            setFilters((prev) => prev.filter((f) => f.key !== key))
          }
          onClearAll={() => setFilters([])}
        />
      );
    }
    render(<Harness />);
    const lastChip = screen.getByRole('button', {
      name: 'Remove Difficulty filter: Easy',
    });
    lastChip.focus();
    fireEvent.click(lastChip);
    // The remaining chip is before it, so focus goes to that chip.
    expect(
      screen.getByRole('button', {
        name: 'Remove Learner Level filter: Beginner',
      })
    ).toHaveFocus();
  });
});
