import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── FilterBar ─────────────────────────────────────────────────────────────────

import FilterBar from '../../../src/components/simulation/FilterBar';

describe('FilterBar – rendering', () => {
  it('renders All filter button', () => {
    render(<FilterBar activeFilter="All" onFilterChange={vi.fn()} />);
    expect(screen.getByText('All')).toBeInTheDocument();
  });

  it('renders Recently Used filter button', () => {
    render(<FilterBar activeFilter="All" onFilterChange={vi.fn()} />);
    expect(screen.getByText('Recently Used')).toBeInTheDocument();
  });

  it('renders Recently Added filter button', () => {
    render(<FilterBar activeFilter="All" onFilterChange={vi.fn()} />);
    expect(screen.getByText('Recently Added')).toBeInTheDocument();
  });

  it('renders Filters button', () => {
    render(<FilterBar activeFilter="All" onFilterChange={vi.fn()} />);
    expect(screen.getByText('Filters')).toBeInTheDocument();
  });

  it('applies active style to the active filter', () => {
    render(<FilterBar activeFilter="All" onFilterChange={vi.fn()} />);
    expect(screen.getByText('All')).toHaveClass('bg-orange-500');
  });

  it('applies active style to Recently Used when active', () => {
    render(<FilterBar activeFilter="Recently Used" onFilterChange={vi.fn()} />);
    expect(screen.getByText('Recently Used')).toHaveClass('bg-orange-500');
  });

  it('applies active style to Filters button when panel is open', () => {
    render(<FilterBar activeFilter="All" onFilterChange={vi.fn()} isFilterPanelOpen={true} />);
    expect(screen.getByText('Filters')).toHaveClass('bg-orange-500');
  });

  it('non-active filters do not have orange background', () => {
    render(<FilterBar activeFilter="All" onFilterChange={vi.fn()} />);
    expect(screen.getByText('Recently Used')).not.toHaveClass('bg-orange-500');
    expect(screen.getByText('Recently Added')).not.toHaveClass('bg-orange-500');
  });
});

describe('FilterBar – interaction', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls onFilterChange with All when All clicked', () => {
    const onFilterChange = vi.fn();
    render(<FilterBar activeFilter="Recently Used" onFilterChange={onFilterChange} />);
    fireEvent.click(screen.getByText('All'));
    expect(onFilterChange).toHaveBeenCalledWith('All');
  });

  it('calls onFilterChange with Recently Used when clicked', () => {
    const onFilterChange = vi.fn();
    render(<FilterBar activeFilter="All" onFilterChange={onFilterChange} />);
    fireEvent.click(screen.getByText('Recently Used'));
    expect(onFilterChange).toHaveBeenCalledWith('Recently Used');
  });

  it('calls onFilterChange with Recently Added when clicked', () => {
    const onFilterChange = vi.fn();
    render(<FilterBar activeFilter="All" onFilterChange={onFilterChange} />);
    fireEvent.click(screen.getByText('Recently Added'));
    expect(onFilterChange).toHaveBeenCalledWith('Recently Added');
  });

  it('calls onFiltersClick when Filters button clicked', () => {
    const onFiltersClick = vi.fn();
    render(
      <FilterBar activeFilter="All" onFilterChange={vi.fn()} onFiltersClick={onFiltersClick} />,
    );
    fireEvent.click(screen.getByText('Filters'));
    expect(onFiltersClick).toHaveBeenCalledTimes(1);
  });

  it('calls onFilterChange exactly once per click', () => {
    const onFilterChange = vi.fn();
    render(<FilterBar activeFilter="All" onFilterChange={onFilterChange} />);
    fireEvent.click(screen.getByText('Recently Used'));
    expect(onFilterChange).toHaveBeenCalledTimes(1);
  });
});

// ── ViewToggle ────────────────────────────────────────────────────────────────

import ViewToggle from '../../../src/components/simulation/ViewToggle';

describe('ViewToggle – rendering', () => {
  it('renders Grid View button', () => {
    render(<ViewToggle viewMode="grid" onViewModeChange={vi.fn()} />);
    expect(screen.getByTitle('Grid View')).toBeInTheDocument();
  });

  it('renders List View button', () => {
    render(<ViewToggle viewMode="grid" onViewModeChange={vi.fn()} />);
    expect(screen.getByTitle('List View')).toBeInTheDocument();
  });

  it('applies active style to Grid View when viewMode is grid', () => {
    render(<ViewToggle viewMode="grid" onViewModeChange={vi.fn()} />);
    expect(screen.getByTitle('Grid View')).toHaveClass('bg-orange-500');
  });

  it('applies active style to List View when viewMode is list', () => {
    render(<ViewToggle viewMode="list" onViewModeChange={vi.fn()} />);
    expect(screen.getByTitle('List View')).toHaveClass('bg-orange-500');
  });

  it('Grid View button does not have active style when list mode', () => {
    render(<ViewToggle viewMode="list" onViewModeChange={vi.fn()} />);
    expect(screen.getByTitle('Grid View')).not.toHaveClass('bg-orange-500');
  });
});

describe('ViewToggle – interaction', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls onViewModeChange with grid when Grid View clicked', () => {
    const onViewModeChange = vi.fn();
    render(<ViewToggle viewMode="list" onViewModeChange={onViewModeChange} />);
    fireEvent.click(screen.getByTitle('Grid View'));
    expect(onViewModeChange).toHaveBeenCalledWith('grid');
  });

  it('calls onViewModeChange with list when List View clicked', () => {
    const onViewModeChange = vi.fn();
    render(<ViewToggle viewMode="grid" onViewModeChange={onViewModeChange} />);
    fireEvent.click(screen.getByTitle('List View'));
    expect(onViewModeChange).toHaveBeenCalledWith('list');
  });

  it('calls onViewModeChange exactly once per click', () => {
    const onViewModeChange = vi.fn();
    render(<ViewToggle viewMode="grid" onViewModeChange={onViewModeChange} />);
    fireEvent.click(screen.getByTitle('List View'));
    expect(onViewModeChange).toHaveBeenCalledTimes(1);
  });
});

// ── TablePagination ───────────────────────────────────────────────────────────

import TablePagination from '../../../src/components/simulation/table/TablePagination';

describe('TablePagination – rendering', () => {
  const setup = (overrides = {}) =>
    render(
      <TablePagination
        currentPage={1}
        totalPages={3}
        totalItems={10}
        itemsPerPage={4}
        onPageChange={vi.fn()}
        {...overrides}
      />,
    );

  it('renders showing range text', () => {
    setup();
    expect(screen.getByText(/Showing 1 to 4 of 10 Simulations/i)).toBeInTheDocument();
  });

  it('renders correct range on page 2', () => {
    setup({ currentPage: 2 });
    expect(screen.getByText(/Showing 5 to 8 of 10 Simulations/i)).toBeInTheDocument();
  });

  it('renders correct range on last page', () => {
    setup({ currentPage: 3 });
    expect(screen.getByText(/Showing 9 to 10 of 10 Simulations/i)).toBeInTheDocument();
  });

  it('shows 0 to 0 when totalItems is 0', () => {
    setup({ totalItems: 0, totalPages: 0, currentPage: 1 });
    expect(screen.getByText(/Showing 0 to 0 of 0 Simulations/i)).toBeInTheDocument();
  });

  it('renders page number buttons', () => {
    setup();
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('disables Prev button on first page', () => {
    const { container } = setup({ currentPage: 1 });
    const prevBtn = container.querySelectorAll('button')[0];
    expect(prevBtn).toBeDisabled();
  });

  it('disables Next button on last page', () => {
    const { container } = setup({ currentPage: 3, totalPages: 3 });
    const buttons = container.querySelectorAll('button');
    expect(buttons[buttons.length - 1]).toBeDisabled();
  });
});

describe('TablePagination – interaction', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls onPageChange with next page when Next clicked', () => {
    const onPageChange = vi.fn();
    const { container } = render(
      <TablePagination
        currentPage={1}
        totalPages={3}
        totalItems={10}
        itemsPerPage={4}
        onPageChange={onPageChange}
      />,
    );
    const buttons = container.querySelectorAll('button');
    fireEvent.click(buttons[buttons.length - 1]);
    expect(onPageChange).toHaveBeenCalledWith(2);
  });

  it('calls onPageChange with prev page when Prev clicked', () => {
    const onPageChange = vi.fn();
    const { container } = render(
      <TablePagination
        currentPage={2}
        totalPages={3}
        totalItems={10}
        itemsPerPage={4}
        onPageChange={onPageChange}
      />,
    );
    const prevBtn = container.querySelectorAll('button')[0];
    fireEvent.click(prevBtn);
    expect(onPageChange).toHaveBeenCalledWith(1);
  });

  it('calls onPageChange with page number when page button clicked', () => {
    const onPageChange = vi.fn();
    render(
      <TablePagination
        currentPage={1}
        totalPages={3}
        totalItems={10}
        itemsPerPage={4}
        onPageChange={onPageChange}
      />,
    );
    fireEvent.click(screen.getByText('3'));
    expect(onPageChange).toHaveBeenCalledWith(3);
  });

  it('highlights current page button with orange', () => {
    render(
      <TablePagination
        currentPage={2}
        totalPages={3}
        totalItems={10}
        itemsPerPage={4}
        onPageChange={vi.fn()}
      />,
    );
    expect(screen.getByText('2')).toHaveClass('bg-orange-500');
  });
});

// ── ActionMenu ────────────────────────────────────────────────────────────────

import ActionMenu from '../../../src/components/simulation/table/ActionMenu';

describe('ActionMenu – rendering', () => {
  it('renders toggle button', () => {
    render(
      <ActionMenu
        id="sim-1"
        open={false}
        onToggle={vi.fn()}
        onAssignClass={vi.fn()}
        onMoreInfo={vi.fn()}
      />,
    );
    expect(screen.getByRole('button')).toBeInTheDocument();
  });

  it('does not render menu items when closed', () => {
    render(
      <ActionMenu
        id="sim-1"
        open={false}
        onToggle={vi.fn()}
        onAssignClass={vi.fn()}
        onMoreInfo={vi.fn()}
      />,
    );
    expect(screen.queryByText('Assign')).not.toBeInTheDocument();
    expect(screen.queryByText('More Details')).not.toBeInTheDocument();
  });

  it('renders Assign and More Details when open', () => {
    render(
      <ActionMenu
        id="sim-1"
        open={true}
        onToggle={vi.fn()}
        onAssignClass={vi.fn()}
        onMoreInfo={vi.fn()}
      />,
    );
    expect(screen.getByText('Assign')).toBeInTheDocument();
    expect(screen.getByText('More Details')).toBeInTheDocument();
  });
});

describe('ActionMenu – interaction', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls onToggle when trigger button clicked', () => {
    const onToggle = vi.fn();
    render(
      <ActionMenu
        id="sim-1"
        open={false}
        onToggle={onToggle}
        onAssignClass={vi.fn()}
        onMoreInfo={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button'));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('calls onAssignClass with correct id when Assign clicked', () => {
    const onAssignClass = vi.fn();
    render(
      <ActionMenu
        id="sim-42"
        open={true}
        onToggle={vi.fn()}
        onAssignClass={onAssignClass}
        onMoreInfo={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText('Assign'));
    expect(onAssignClass).toHaveBeenCalledWith('sim-42');
  });

  it('calls onToggle after Assign clicked', () => {
    const onToggle = vi.fn();
    render(
      <ActionMenu
        id="sim-1"
        open={true}
        onToggle={onToggle}
        onAssignClass={vi.fn()}
        onMoreInfo={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText('Assign'));
    expect(onToggle).toHaveBeenCalled();
  });

  it('calls onMoreInfo with correct id when More Details clicked', () => {
    const onMoreInfo = vi.fn();
    render(
      <ActionMenu
        id="sim-42"
        open={true}
        onToggle={vi.fn()}
        onAssignClass={vi.fn()}
        onMoreInfo={onMoreInfo}
      />,
    );
    fireEvent.click(screen.getByText('More Details'));
    expect(onMoreInfo).toHaveBeenCalledWith('sim-42');
  });

  it('calls onToggle after More Details clicked', () => {
    const onToggle = vi.fn();
    render(
      <ActionMenu
        id="sim-1"
        open={true}
        onToggle={onToggle}
        onAssignClass={vi.fn()}
        onMoreInfo={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText('More Details'));
    expect(onToggle).toHaveBeenCalled();
  });
});

// ── CategoryPill ──────────────────────────────────────────────────────────────

import CategoryPill from '../../../src/components/simulation/table/CategoryPill';

describe('CategoryPill – rendering', () => {
  it('renders category text', () => {
    render(<CategoryPill category="Cardiology" />);
    expect(screen.getByText('Cardiology')).toBeInTheDocument();
  });

  it('applies Cardiology style', () => {
    render(<CategoryPill category="Cardiology" />);
    expect(screen.getByText('Cardiology')).toHaveClass('bg-sky-100', 'text-sky-600');
  });

  it('applies Pediatrics style', () => {
    render(<CategoryPill category="Pediatrics" />);
    expect(screen.getByText('Pediatrics')).toHaveClass('bg-teal-100', 'text-teal-600');
  });

  it('applies Emergency Medicine style', () => {
    render(<CategoryPill category="Emergency Medicine" />);
    expect(screen.getByText('Emergency Medicine')).toHaveClass('bg-orange-100');
  });

  it('applies Neurology style', () => {
    render(<CategoryPill category="Neurology" />);
    expect(screen.getByText('Neurology')).toHaveClass('bg-purple-100', 'text-purple-600');
  });

  it('applies fallback style for unknown category', () => {
    render(<CategoryPill category="Unknown" />);
    expect(screen.getByText('Unknown')).toHaveClass('bg-slate-100', 'text-slate-500');
  });

  it('renders as a span element', () => {
    render(<CategoryPill category="Cardiology" />);
    expect(screen.getByText('Cardiology').tagName).toBe('SPAN');
  });
});
