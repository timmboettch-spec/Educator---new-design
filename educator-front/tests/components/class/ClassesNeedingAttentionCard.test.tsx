import { screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, it, expect, vi } from 'vitest';
import ClassesNeedingAttentionCard from '../../../src/components/class/ClassesNeedingAttentionCard';
import type { ClassesNeedingAttention } from '../../../src/hooks/useClassesNeedingAttention';
import { ClassAttentionMeasure } from '../../../src/redux/api/classes/classes.types';
import { renderWithProviders } from '../../../src/test/testUtils';

const useClassesNeedingAttention = vi.fn<() => ClassesNeedingAttention>();

vi.mock('../../../src/hooks/useClassesNeedingAttention', () => ({
  useClassesNeedingAttention: () => useClassesNeedingAttention(),
}));

const makeAttention = (
  overrides: Partial<ClassesNeedingAttention> = {}
): ClassesNeedingAttention => ({
  status: 'succeeded',
  totalActive: 4,
  needingCount: 3,
  unreadCount: 1,
  noStudentsCount: 1,
  noSimsCount: 1,
  ...overrides,
});

describe('ClassesNeedingAttentionCard – rendering', () => {
  beforeEach(() => {
    useClassesNeedingAttention.mockReset();
  });

  it('renders a loading skeleton while the counts load', () => {
    useClassesNeedingAttention.mockReturnValue(
      makeAttention({ status: 'loading' })
    );
    const { container } = renderWithProviders(
      <ClassesNeedingAttentionCard onFilter={vi.fn()} />
    );
    expect(container.querySelector('.animate-pulse')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(
      'Loading classes needing attention…'
    );
    expect(
      screen.queryByText('Classes Needing Attention')
    ).not.toBeInTheDocument();
  });

  it('shows a friendly message when the counts fail to load', () => {
    useClassesNeedingAttention.mockReturnValue(
      makeAttention({ status: 'failed' })
    );
    renderWithProviders(<ClassesNeedingAttentionCard onFilter={vi.fn()} />);
    expect(
      screen.getByText("We couldn't load classes needing attention right now.")
    ).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('renders nothing when no class needs attention', () => {
    useClassesNeedingAttention.mockReturnValue(
      makeAttention({
        needingCount: 0,
        unreadCount: 0,
        noStudentsCount: 0,
        noSimsCount: 0,
      })
    );
    const { container } = renderWithProviders(
      <ClassesNeedingAttentionCard onFilter={vi.fn()} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the summed headline and the three bucket actions with BE counts', () => {
    useClassesNeedingAttention.mockReturnValue(
      makeAttention({ needingCount: 5, noStudentsCount: 3 })
    );
    renderWithProviders(<ClassesNeedingAttentionCard onFilter={vi.fn()} />);

    expect(screen.getByText('Classes Needing Attention')).toBeInTheDocument();
    expect(
      screen.getByText('5 classes with items needing attention')
    ).toBeInTheDocument();
    expect(
      screen.getByText('View Classes with Unread Reports (1)')
    ).toBeInTheDocument();
    expect(
      screen.getByText('View Classes with No Students (3)')
    ).toBeInTheDocument();
    expect(
      screen.getByText('View Classes with No Assigned Sims (1)')
    ).toBeInTheDocument();
  });
});

describe('ClassesNeedingAttentionCard – interaction', () => {
  it('calls onFilter with the bucket measure when an action is clicked', () => {
    useClassesNeedingAttention.mockReturnValue(makeAttention());
    const onFilter = vi.fn();
    renderWithProviders(<ClassesNeedingAttentionCard onFilter={onFilter} />);

    fireEvent.click(screen.getByText('View Classes with No Students (1)'));
    expect(onFilter).toHaveBeenLastCalledWith(
      ClassAttentionMeasure.NO_STUDENTS
    );

    fireEvent.click(screen.getByText('View Classes with Unread Reports (1)'));
    expect(onFilter).toHaveBeenLastCalledWith(
      ClassAttentionMeasure.UNREAD_REPORTS
    );

    fireEvent.click(screen.getByText('View Classes with No Assigned Sims (1)'));
    expect(onFilter).toHaveBeenLastCalledWith(
      ClassAttentionMeasure.NO_ASSIGNED_SIMS
    );
  });
});

describe('ClassesNeedingAttentionCard – active quick filter', () => {
  it('marks the active bucket as pressed and the others as not pressed', () => {
    useClassesNeedingAttention.mockReturnValue(makeAttention());
    renderWithProviders(
      <ClassesNeedingAttentionCard
        onFilter={vi.fn()}
        activeMeasure={ClassAttentionMeasure.NO_STUDENTS}
      />
    );

    expect(
      screen.getByRole('button', { name: 'View Classes with No Students (1)' })
    ).toHaveAttribute('aria-pressed', 'true');
    expect(
      screen.getByRole('button', {
        name: 'View Classes with Unread Reports (1)',
      })
    ).toHaveAttribute('aria-pressed', 'false');
  });

  it('shows every bucket as not pressed when no quick filter is active', () => {
    useClassesNeedingAttention.mockReturnValue(makeAttention());
    renderWithProviders(
      <ClassesNeedingAttentionCard onFilter={vi.fn()} activeMeasure={null} />
    );
    screen
      .getAllByRole('button', { name: /View Classes with/ })
      .forEach((button) =>
        expect(button).toHaveAttribute('aria-pressed', 'false')
      );
  });

  it('renders plain buttons (no toggle state) when used without activeMeasure, e.g. on the dashboard', () => {
    useClassesNeedingAttention.mockReturnValue(makeAttention());
    renderWithProviders(<ClassesNeedingAttentionCard onFilter={vi.fn()} />);
    screen
      .getAllByRole('button', { name: /View Classes with/ })
      .forEach((button) => expect(button).not.toHaveAttribute('aria-pressed'));
  });
});

describe('ClassesNeedingAttentionCard – keyboard', () => {
  beforeEach(() => {
    useClassesNeedingAttention.mockReset();
    useClassesNeedingAttention.mockReturnValue(makeAttention());
  });

  const LABELS = [
    'View Classes with Unread Reports (1)',
    'View Classes with No Students (1)',
    'View Classes with No Assigned Sims (1)',
  ];

  it('reaches each drill-down in order with Tab', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ClassesNeedingAttentionCard onFilter={vi.fn()} />);

    for (const name of LABELS) {
      await user.tab();
      expect(screen.getByRole('button', { name })).toHaveFocus();
    }
  });

  it.each([
    ['{Enter}', 'Enter'],
    [' ', 'Space'],
  ])(
    'activates a drill-down with %s (%s) and filters to its measure',
    async (key) => {
      const user = userEvent.setup();
      const onFilter = vi.fn();
      renderWithProviders(
        <ClassesNeedingAttentionCard onFilter={onFilter} activeMeasure={null} />
      );

      await user.tab();
      await user.keyboard(key);
      expect(onFilter).toHaveBeenLastCalledWith(
        ClassAttentionMeasure.UNREAD_REPORTS
      );

      await user.tab();
      await user.keyboard(key);
      expect(onFilter).toHaveBeenLastCalledWith(
        ClassAttentionMeasure.NO_STUDENTS
      );

      await user.tab();
      await user.keyboard(key);
      expect(onFilter).toHaveBeenLastCalledWith(
        ClassAttentionMeasure.NO_ASSIGNED_SIMS
      );
      expect(onFilter).toHaveBeenCalledTimes(3);
    }
  );

  it('shows the active drill-down as pressed to assistive tech', () => {
    renderWithProviders(
      <ClassesNeedingAttentionCard
        onFilter={vi.fn()}
        activeMeasure={ClassAttentionMeasure.NO_STUDENTS}
      />
    );
    expect(screen.getByRole('button', { name: LABELS[1] })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
  });
});
