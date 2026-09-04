import React, { ChangeEvent, ReactNode } from 'react';

import { render, screen, fireEvent } from '@testing-library/react';

import { describe, it, expect, vi, beforeEach } from 'vitest';

import FilterPanel from '../../../src/components/simulation/FilterPanel';

import type { Simulation } from '../../../src/redux/dashboard/simulationlibrary/GetSimulationRedux';

// ── UI mocks ──────────────────────────────────────────────────────────────────

vi.mock('../ui/Button', () => ({
  Button: ({ children, onClick }: { children: ReactNode; onClick: () => void }) => (
    <button onClick={onClick}>{children}</button>
  ),
}));

vi.mock('../ui/Select', () => ({
  default: ({
    label,
    value,
    onChange,
    placeholder,
  }: {
    label: string;
    value: string;
    onChange: (value: string) => void;
    placeholder: string;
  }) => (
    <div>
      <label>{label}</label>

      <select
        data-testid={`select-${label?.toLowerCase().replace(/\s+/g, '-')}`}
        value={value}
        onChange={(e: ChangeEvent<HTMLSelectElement>) => onChange(e.target.value)}
      >
        <option value="">{placeholder}</option>

        <option value="opt1">Option 1</option>

        <option value="opt2">Option 2</option>
      </select>
    </div>
  ),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

const makeSim = (overrides: Partial<Simulation> = {}): Simulation => ({
  simulation_id: 'sim-1',
  name: 'Baby Sim Pro',
  unit: 'unit-1',
  learnerLevel: 'Beginner',
  difficulty: 'Easy',
  avatarEnabled: true,
  ...overrides,
});

const defaultProps = {
  isOpen: true,
  onClose: vi.fn(),
  onApply: vi.fn(),
  onRemove: vi.fn(),
  simulations: [makeSim()],
};

const setup = (overrides: Partial<typeof defaultProps> = {}) =>
  render(<FilterPanel {...defaultProps} {...overrides} />);

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('FilterPanel – visibility', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders panel when isOpen is true', () => {
    setup();

    expect(screen.getByText('Filter Simulations')).toBeInTheDocument();
  });

  it('does not render panel when isOpen is false', () => {
    setup({ isOpen: false });

    expect(screen.queryByText('Filter Simulations')).not.toBeInTheDocument();
  });
});

describe('FilterPanel – rendering', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders Filter Simulations heading', () => {
    setup();

    expect(screen.getByText('Filter Simulations')).toBeInTheDocument();
  });

  it('renders Product select field', () => {
    setup();

    expect(screen.getByText('Product')).toBeInTheDocument();
  });

  it('renders Product Type select field', () => {
    setup();

    expect(screen.getByText('Product Type')).toBeInTheDocument();
  });

  it('renders Learner Level select field', () => {
    setup();

    expect(screen.getByText('Learner Level')).toBeInTheDocument();
  });

  it('renders Difficulty select field', () => {
    setup();

    expect(screen.getByText('Difficulty')).toBeInTheDocument();
  });

  it('renders Apply Filter button', () => {
    setup();

    expect(
      screen.getByRole('button', {
        name: /apply filter/i,
      }),
    ).toBeInTheDocument();
  });

  it('renders Remove Filter button', () => {
    setup();

    expect(
      screen.getByRole('button', {
        name: /remove filter/i,
      }),
    ).toBeInTheDocument();
  });

  it('renders close button', () => {
    setup();

    const buttons = screen.getAllByRole('button');

    expect(buttons.length).toBeGreaterThanOrEqual(3);
  });
});

describe('FilterPanel – close behavior', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls onClose when close button clicked', () => {
    const onClose = vi.fn();

    setup({ onClose });

    const buttons = screen.getAllByRole('button');

    const closeBtn = buttons.find((b) => !b.textContent?.match(/apply|remove/i));

    expect(closeBtn).toBeDefined();

    fireEvent.click(closeBtn!);

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('FilterPanel – apply behavior', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls onApply when Apply Filter clicked', () => {
    const onApply = vi.fn();

    setup({ onApply });

    fireEvent.click(
      screen.getByRole('button', {
        name: /apply filter/i,
      }),
    );

    expect(onApply).toHaveBeenCalledTimes(1);
  });

  it('calls onApply with filter object', () => {
    const onApply = vi.fn();

    setup({ onApply });

    fireEvent.click(
      screen.getByRole('button', {
        name: /apply filter/i,
      }),
    );

    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({
        product: '',
        topic: '',
        learnerLevel: '',
        difficulty: '',
      }),
    );
  });

  it('calls onApply with empty strings by default', () => {
    const onApply = vi.fn();

    setup({ onApply });

    fireEvent.click(
      screen.getByRole('button', {
        name: /apply filter/i,
      }),
    );

    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({
        product: '',
        topic: '',
        learnerLevel: '',
        difficulty: '',
      }),
    );
  });
});

describe('FilterPanel – remove behavior', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls onRemove when Remove Filter clicked', () => {
    const onRemove = vi.fn();

    setup({ onRemove });

    fireEvent.click(
      screen.getByRole('button', {
        name: /remove filter/i,
      }),
    );

    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it('resets filter values after Remove Filter clicked', () => {
    const onApply = vi.fn();

    setup({ onApply });

    fireEvent.click(
      screen.getByRole('button', {
        name: /remove filter/i,
      }),
    );

    fireEvent.click(
      screen.getByRole('button', {
        name: /apply filter/i,
      }),
    );

    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({
        product: '',
        topic: '',
        learnerLevel: '',
        difficulty: '',
      }),
    );
  });
});

describe('FilterPanel – empty simulations', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders without crashing when simulations is empty', () => {
    setup({
      simulations: [],
    });

    expect(screen.getByText('Filter Simulations')).toBeInTheDocument();
  });

  it('still renders all select fields with empty simulations', () => {
    setup({
      simulations: [],
    });

    expect(screen.getByText('Product')).toBeInTheDocument();

    expect(screen.getByText('Difficulty')).toBeInTheDocument();
  });
});
