import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import '../../../src/i18n';
import SimulationGrid, {
  type SimulationGridProps,
} from '../../../src/components/simulation/SimulationGrid';
import type { Simulation } from '../../../src/types/simulation.types';

vi.mock('../../../src/components/simulation/table/ActionMenu', () => ({
  default: ({
    id,
    open,
    onToggle,
    onAssignClass,
    onMoreInfo,
    onRemoveFromLibrary,
  }: {
    id: string;
    open: boolean;
    onToggle: () => void;
    onAssignClass: (id: string) => void;
    onMoreInfo: (id: string) => void;
    onRemoveFromLibrary?: (id: string) => void;
  }) => (
    <div data-testid={`action-menu-${id}`}>
      <button onClick={onToggle}>Toggle Menu</button>
      {open && (
        <>
          <button onClick={() => onAssignClass(id)}>Assign</button>
          <button onClick={() => onMoreInfo(id)}>More Details</button>
          <button onClick={() => onRemoveFromLibrary?.(id)}>Remove</button>
        </>
      )}
    </div>
  ),
}));

const makeSim = (overrides: Partial<Simulation> = {}): Simulation => ({
  id: 'sim-1',
  simulation_id: 'scenario-1',
  title: 'Cardiac Arrest',
  unit: 'unit-1',
  unit_name: 'Cardiology',
  duration: '20 min',
  image: '',
  description: '',
  assigned: false,
  rating: 0,
  difficulty: 'Easy',
  learnerLevel: 'Post-Secondary',
  targetAudience: 'Nursing',
  productName: 'RealCare Baby',
  avatarEnabled: true,
  ...overrides,
});

const SIMS: Simulation[] = [
  makeSim(),
  makeSim({
    id: 'sim-2',
    simulation_id: 'scenario-2',
    title: 'Burn Care',
    difficulty: 'Hard',
    learnerLevel: 'High School',
    targetAudience: '',
    productName: '',
    avatarEnabled: false,
    fromBundle: true,
  }),
];

const setup = (overrides: Partial<SimulationGridProps> = {}) => {
  const props: SimulationGridProps = {
    simulations: SIMS,
    viewMode: 'grid',
    isSelected: () => false,
    onToggleSelect: vi.fn(),
    allSelected: false,
    someSelected: false,
    onToggleSelectAll: vi.fn(),
    onAssignClass: vi.fn(),
    onMoreInfo: vi.fn(),
    onRemoveFromLibrary: vi.fn(),
    removingId: null,
    ...overrides,
  };
  render(<SimulationGrid {...props} />);
  return props;
};

describe('SimulationGrid – grid view', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders a card per simulation with its title and chips', () => {
    setup();
    expect(
      screen.getByRole('heading', { name: 'Cardiac Arrest' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Burn Care' })
    ).toBeInTheDocument();
    // Learner level is bucketed: "High School" reads as Secondary.
    expect(screen.getByText('Secondary')).toBeInTheDocument();
    expect(screen.getByText('Post-Secondary')).toBeInTheDocument();
    expect(screen.getByText('Avatar')).toBeInTheDocument();
    expect(screen.getByText('Workstation')).toBeInTheDocument();
    expect(screen.getAllByText('20 min')).toHaveLength(2);
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('shows the AI seats badge only where it applies, and no product name', () => {
    setup();
    expect(screen.getAllByText('AI Seats Required')).toHaveLength(1);
    // Per the approved design, cards don't show the associated product name.
    expect(screen.queryByText('RealCare Baby')).not.toBeInTheDocument();
    expect(
      screen.queryByText(/Associated Product Name/)
    ).not.toBeInTheDocument();
  });

  it('assigns and opens details with the right ids', () => {
    const props = setup();
    fireEvent.click(
      screen.getAllByRole('button', { name: 'Assign to Class' })[0]!
    );
    expect(props.onAssignClass).toHaveBeenCalledWith('sim-1');
    fireEvent.click(
      screen.getByRole('button', { name: 'More info about Cardiac Arrest' })
    );
    expect(props.onMoreInfo).toHaveBeenCalledWith('scenario-1');
  });

  it('toggles selection from the card checkbox and reflects the selected state', () => {
    const props = setup({ isSelected: (id) => id === 'sim-2' });
    const first = screen.getByRole('checkbox', {
      name: 'Select Cardiac Arrest',
    });
    const second = screen.getByRole('checkbox', { name: 'Select Burn Care' });
    expect(first).not.toBeChecked();
    expect(second).toBeChecked();
    fireEvent.click(first);
    expect(props.onToggleSelect).toHaveBeenCalledWith('sim-1');
  });

  it('asks to remove a library simulation but not a bundle one', () => {
    const props = setup();
    const removeButtons = screen.getAllByRole('button', {
      name: 'Remove from My Library',
    });
    expect(removeButtons).toHaveLength(1);
    fireEvent.click(removeButtons[0]!);
    expect(props.onRemoveFromLibrary).toHaveBeenCalledWith(SIMS[0]);
    expect(
      screen.getByRole('img', {
        name: 'Part of your bundle — cannot be removed',
      })
    ).toBeInTheDocument();
  });
});

describe('SimulationGrid – list view (table)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders the design columns and a row per simulation', () => {
    setup({ viewMode: 'list' });
    const table = screen.getByRole('table', {
      name: 'Simulations in your library',
    });
    const headers = within(table)
      .getAllByRole('columnheader')
      .map((h) => h.textContent);
    expect(headers).toEqual([
      '',
      'Simulation Name',
      'Learner Level',
      'Target Audience',
      'Modality',
      'Product Name',
      'Difficulty',
      'Duration',
      'Action',
    ]);
    // header row + 2 data rows
    expect(within(table).getAllByRole('row')).toHaveLength(3);
    expect(within(table).getByText('Hard')).toBeInTheDocument();
  });

  it('follows the design rules for empty and derived values', () => {
    setup({ viewMode: 'list' });
    // No audience → falls back to the raw learner level; no product → dash.
    const burnRow = screen.getByRole('row', { name: /Burn Care/ });
    expect(within(burnRow).getByText('High School')).toBeInTheDocument();
    expect(within(burnRow).getAllByText('—')).toHaveLength(1);
    // Avatar sims need no product, so the product column shows a dash.
    const cardiacRow = screen.getByRole('row', { name: /Cardiac Arrest/ });
    expect(
      within(cardiacRow).queryByText('RealCare Baby')
    ).not.toBeInTheDocument();
    expect(within(cardiacRow).getAllByText('—')).toHaveLength(1);
  });

  it('shows plain, unsortable column headers without a sort', () => {
    setup({ viewMode: 'list' });
    expect(
      screen.getByRole('columnheader', { name: 'Simulation Name' })
    ).not.toHaveAttribute('aria-sort');
    expect(
      screen.queryByRole('button', { name: 'Duration' })
    ).not.toBeInTheDocument();
  });

  it('calls onSort with the column field when a header is clicked', () => {
    const onSort = vi.fn();
    setup({
      viewMode: 'list',
      sort: { field: null, direction: null, onSort },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Duration' }));
    expect(onSort).toHaveBeenCalledWith('duration');
    fireEvent.click(screen.getByRole('button', { name: 'Simulation Name' }));
    expect(onSort).toHaveBeenCalledWith('title');
  });

  it('announces the active sort on the column header', () => {
    setup({
      viewMode: 'list',
      sort: { field: 'title', direction: 'desc', onSort: vi.fn() },
    });
    expect(
      screen.getByRole('columnheader', { name: /Simulation Name/ })
    ).toHaveAttribute('aria-sort', 'descending');
    expect(
      screen.getByRole('button', { name: 'Simulation Name, sorted descending' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('columnheader', { name: /Difficulty/ })
    ).toHaveAttribute('aria-sort', 'none');
  });

  it('header checkbox selects all and shows a partial selection', () => {
    const props = setup({ viewMode: 'list', someSelected: true });
    const header = screen.getByRole('checkbox', {
      name: 'Select all shown simulations',
    });
    expect((header as HTMLInputElement).indeterminate).toBe(true);
    fireEvent.click(header);
    expect(props.onToggleSelectAll).toHaveBeenCalledTimes(1);
  });

  it('row checkbox toggles that simulation', () => {
    const props = setup({ viewMode: 'list', isSelected: () => true });
    const row = screen.getByRole('checkbox', { name: 'Select Burn Care' });
    expect(row).toBeChecked();
    fireEvent.click(row);
    expect(props.onToggleSelect).toHaveBeenCalledWith('sim-2');
  });

  it('routes action-menu choices to the page handlers', () => {
    const props = setup({ viewMode: 'list' });
    const menu = screen.getByTestId('action-menu-sim-1');
    fireEvent.click(within(menu).getByText('Toggle Menu'));
    fireEvent.click(within(menu).getByText('Assign'));
    expect(props.onAssignClass).toHaveBeenCalledWith('sim-1');

    fireEvent.click(within(menu).getByText('Toggle Menu'));
    fireEvent.click(within(menu).getByText('More Details'));
    expect(props.onMoreInfo).toHaveBeenCalledWith('scenario-1');

    fireEvent.click(within(menu).getByText('Toggle Menu'));
    fireEvent.click(within(menu).getByText('Remove'));
    expect(props.onRemoveFromLibrary).toHaveBeenCalledWith(SIMS[0]);
  });
});

describe('SimulationGrid – list view on a narrow screen', () => {
  const originalMatchMedia = window.matchMedia;

  beforeEach(() => {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
  });

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
  });

  it('stacks the rows instead of rendering a wide table', () => {
    setup({ viewMode: 'list' });
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    const list = screen.getByRole('list', {
      name: 'Simulations in your library',
    });
    expect(within(list).getAllByRole('listitem')).toHaveLength(2);
    expect(
      screen.getByRole('checkbox', { name: 'Select all shown simulations' })
    ).toBeInTheDocument();
  });
});
