import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── ViewToggle ────────────────────────────────────────────────────────────────

import '../../../src/i18n';
import ViewToggle from '../../../src/components/simulation/ViewToggle';

const gridButton = () => screen.getByRole('button', { name: 'Grid view' });
const listButton = () => screen.getByRole('button', { name: 'List view' });

describe('ViewToggle – rendering', () => {
  it('renders both view buttons inside a labelled group', () => {
    render(<ViewToggle viewMode="grid" onViewModeChange={vi.fn()} />);
    expect(screen.getByRole('group', { name: 'Layout' })).toBeInTheDocument();
    expect(gridButton()).toBeInTheDocument();
    expect(listButton()).toBeInTheDocument();
  });

  it('marks Grid view as pressed when viewMode is grid', () => {
    render(<ViewToggle viewMode="grid" onViewModeChange={vi.fn()} />);
    expect(gridButton()).toHaveAttribute('aria-pressed', 'true');
    expect(listButton()).toHaveAttribute('aria-pressed', 'false');
    expect(gridButton()).toHaveClass('bg-primary-500');
  });

  it('marks List view as pressed when viewMode is list', () => {
    render(<ViewToggle viewMode="list" onViewModeChange={vi.fn()} />);
    expect(listButton()).toHaveAttribute('aria-pressed', 'true');
    expect(gridButton()).toHaveAttribute('aria-pressed', 'false');
    expect(gridButton()).not.toHaveClass('bg-primary-500');
  });
});

describe('ViewToggle – interaction', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls onViewModeChange with grid when Grid view clicked', () => {
    const onViewModeChange = vi.fn();
    render(<ViewToggle viewMode="list" onViewModeChange={onViewModeChange} />);
    fireEvent.click(gridButton());
    expect(onViewModeChange).toHaveBeenCalledWith('grid');
  });

  it('calls onViewModeChange with list exactly once when List view clicked', () => {
    const onViewModeChange = vi.fn();
    render(<ViewToggle viewMode="grid" onViewModeChange={onViewModeChange} />);
    fireEvent.click(listButton());
    expect(onViewModeChange).toHaveBeenCalledTimes(1);
    expect(onViewModeChange).toHaveBeenCalledWith('list');
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
      />
    );

  it('renders showing range text', () => {
    setup();
    expect(
      screen.getByText(/Showing 1 to 4 of 10 Simulations/i)
    ).toBeInTheDocument();
  });

  it('renders correct range on page 2', () => {
    setup({ currentPage: 2 });
    expect(
      screen.getByText(/Showing 5 to 8 of 10 Simulations/i)
    ).toBeInTheDocument();
  });

  it('renders correct range on last page', () => {
    setup({ currentPage: 3 });
    expect(
      screen.getByText(/Showing 9 to 10 of 10 Simulations/i)
    ).toBeInTheDocument();
  });

  it('shows 0 to 0 when totalItems is 0', () => {
    setup({ totalItems: 0, totalPages: 0, currentPage: 1 });
    expect(
      screen.getByText(/Showing 0 to 0 of 0 Simulations/i)
    ).toBeInTheDocument();
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
      />
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
      />
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
      />
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
      />
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
      />
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
      />
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
      />
    );
    expect(screen.getByText('Assign')).toBeInTheDocument();
    expect(screen.getByText('More Details')).toBeInTheDocument();
  });
});

describe('ActionMenu – interaction', () => {
  beforeEach(() => vi.clearAllMocks());

  const menuItemNames = () =>
    screen.getAllByRole('menuitem').map((item) => item.textContent?.trim());

  it('moves between items with the arrow keys, wrapping, and Home/End', () => {
    render(
      <ActionMenu
        id="sim-1"
        open={true}
        onToggle={vi.fn()}
        onAssignClass={vi.fn()}
        onMoreInfo={vi.fn()}
        onRemoveFromLibrary={vi.fn()}
      />
    );
    expect(menuItemNames()).toHaveLength(3);
    const [first, second, last] = screen.getAllByRole('menuitem');
    first!.focus();
    fireEvent.keyDown(first!, { key: 'ArrowDown' });
    expect(second).toHaveFocus();
    fireEvent.keyDown(second!, { key: 'ArrowDown' });
    expect(last).toHaveFocus();
    fireEvent.keyDown(last!, { key: 'ArrowDown' });
    expect(first).toHaveFocus();
    fireEvent.keyDown(first!, { key: 'ArrowUp' });
    expect(last).toHaveFocus();
    fireEvent.keyDown(last!, { key: 'Home' });
    expect(first).toHaveFocus();
    fireEvent.keyDown(first!, { key: 'End' });
    expect(last).toHaveFocus();
  });

  it('skips a disabled item when moving with the arrow keys', () => {
    render(
      <ActionMenu
        id="sim-1"
        open={true}
        onToggle={vi.fn()}
        onAssignClass={vi.fn()}
        onMoreInfo={vi.fn()}
        onRemoveFromLibrary={vi.fn()}
        fromBundle
      />
    );
    const [first, , last] = screen.getAllByRole('menuitem');
    first!.focus();
    fireEvent.keyDown(first!, { key: 'ArrowDown' });
    expect(last).toHaveFocus();
  });

  it('puts focus back on the trigger when an item is chosen', () => {
    const onRemoveFromLibrary = vi.fn();
    render(
      <ActionMenu
        id="sim-1"
        open={true}
        onToggle={vi.fn()}
        onAssignClass={vi.fn()}
        onMoreInfo={vi.fn()}
        onRemoveFromLibrary={onRemoveFromLibrary}
      />
    );
    const remove = screen
      .getAllByRole('menuitem')
      .find((item) => item.textContent?.includes('Remove'));
    remove!.focus();
    fireEvent.click(remove!);
    expect(onRemoveFromLibrary).toHaveBeenCalledWith('sim-1');
    expect(screen.getByRole('button', { name: 'Actions' })).toHaveFocus();
  });

  it('calls onToggle when trigger button clicked', () => {
    const onToggle = vi.fn();
    render(
      <ActionMenu
        id="sim-1"
        open={false}
        onToggle={onToggle}
        onAssignClass={vi.fn()}
        onMoreInfo={vi.fn()}
      />
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
      />
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
      />
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
      />
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
      />
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
    expect(screen.getByText('Cardiology')).toHaveClass(
      'bg-sky-100',
      'text-sky-600'
    );
  });

  it('applies Pediatrics style', () => {
    render(<CategoryPill category="Pediatrics" />);
    expect(screen.getByText('Pediatrics')).toHaveClass(
      'bg-teal-100',
      'text-teal-600'
    );
  });

  it('applies Emergency Medicine style', () => {
    render(<CategoryPill category="Emergency Medicine" />);
    expect(screen.getByText('Emergency Medicine')).toHaveClass('bg-orange-100');
  });

  it('applies Neurology style', () => {
    render(<CategoryPill category="Neurology" />);
    expect(screen.getByText('Neurology')).toHaveClass(
      'bg-purple-100',
      'text-purple-600'
    );
  });

  it('applies fallback style for unknown category', () => {
    render(<CategoryPill category="Unknown" />);
    expect(screen.getByText('Unknown')).toHaveClass(
      'bg-slate-100',
      'text-slate-500'
    );
  });

  it('renders as a span element', () => {
    render(<CategoryPill category="Cardiology" />);
    expect(screen.getByText('Cardiology').tagName).toBe('SPAN');
  });
});
