import { fireEvent, screen } from '@testing-library/react';
import dayjs from 'dayjs';
import { describe, expect, it, vi } from 'vitest';
import { SimRow } from '../../../../src/components/class/simsubtable/SimRow';
import { renderWithProviders } from '../../../../src/test/testUtils';
import type { SimulationItem } from '../../../../src/types';

const sim = (overrides: Partial<SimulationItem> = {}): SimulationItem =>
  ({
    id: 'assign-1',
    simulation_id: 'lib-1',
    simulation_title: 'Cardiac Care',
    start_date: '2026-01-01',
    due_date: '2026-01-20',
    end_date: '2099-01-31',
    ...overrides,
  }) as SimulationItem;

const renderRow = (props: Partial<Parameters<typeof SimRow>[0]> = {}) => {
  const onOpenReports = vi.fn();
  const onOpenMenu = vi.fn();
  const onEditDate = vi.fn();
  const onSaveDate = vi.fn();
  const onCancelDate = vi.fn();
  renderWithProviders(
    <table>
      <tbody>
        <SimRow
          sim={sim()}
          now={dayjs('2026-01-15')}
          stats={{ started: 4, completed: 2, avgScore: '81%' }}
          isHighlighted={false}
          isMenuOpen={false}
          onOpenReports={onOpenReports}
          onOpenMenu={onOpenMenu}
          isClassArchived={false}
          editingDateField={null}
          dateError={null}
          isSavingDate={false}
          onEditDate={onEditDate}
          onSaveDate={onSaveDate}
          onCancelDate={onCancelDate}
          {...props}
        />
      </tbody>
    </table>
  );
  return { onOpenReports, onOpenMenu, onEditDate, onSaveDate, onCancelDate };
};

describe('SimRow', () => {
  it('shows the formatted dates, status badge and stats', () => {
    renderRow();
    expect(screen.getByText('01-01-2026')).toBeInTheDocument();
    expect(screen.getByText('01-20-2026')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('81%')).toBeInTheDocument();
  });

  it('marks archived sims with the dot and a light-gray name', () => {
    renderRow({
      sim: sim({ end_date: '2026-01-10', scenario_status: 'ARCHIVED' }),
      stats: undefined,
    });
    expect(
      screen.getByRole('img', { name: 'Archived Simulation' })
    ).toBeInTheDocument();
    expect(screen.getByText('Cardiac Care')).toHaveClass('text-gray-500');
    expect(screen.getByText('Past')).toBeInTheDocument();
    expect(screen.getAllByText('-')).toHaveLength(3);
  });

  it.each([
    ['Active', {}, 'bg-green-100', 'text-[#5f6060]'],
    ['Future', { start_date: '2026-02-01' }, 'bg-[#fbe7d0]', 'text-[#a55a12]'],
    ['Past', { end_date: '2026-01-10' }, 'bg-red-100', 'text-red-500'],
  ])(
    'shows the %s chip and colours the dates to match',
    (label, overrides, chipClass, dateClass) => {
      renderRow({ sim: sim(overrides) });
      expect(screen.getByText(label)).toHaveClass(chipClass, 'uppercase');
      expect(screen.getByText('01-20-2026').closest('td')).toHaveClass(
        dateClass
      );
    }
  );

  it('keeps the sim name cell fixed while the table scrolls sideways', () => {
    renderRow();
    // Below the sticky header row (z-10), so it never covers the Sim Name header.
    expect(screen.getByText('Cardiac Care').closest('td')).toHaveClass(
      'sticky',
      'left-0',
      'z-[1]'
    );
  });

  it('keeps the name neutral whatever the status', () => {
    renderRow({ sim: sim({ end_date: '2026-01-10' }) });
    expect(screen.getByText('Cardiac Care')).toHaveClass('text-[#5f6060]');
  });

  it('shows a quiet Reports button when every report was viewed', () => {
    renderRow();
    expect(
      screen.getByRole('button', { name: 'Reports / Transcripts' })
    ).toHaveClass('bg-gray-50');
  });

  it('tells assistive tech whether the actions menu is open', () => {
    renderRow({ isMenuOpen: true });
    expect(
      screen.getByRole('button', { name: 'Actions for Cardiac Care' })
    ).toHaveAttribute('aria-expanded', 'true');
  });

  it('shows a gray, centered Reports / Transcripts button', () => {
    renderRow();
    const button = screen.getByRole('button', {
      name: 'Reports / Transcripts',
    });
    expect(button).toHaveClass('bg-gray-50', 'text-gray-600');
    expect(button).not.toHaveClass('bg-primary-500');
    expect(button.closest('td')).toHaveClass('text-center');
  });

  it('opens the reports and the actions menu', () => {
    const { onOpenReports, onOpenMenu } = renderRow();
    fireEvent.click(
      screen.getByRole('button', { name: 'Reports / Transcripts' })
    );
    expect(onOpenReports).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'assign-1' })
    );

    fireEvent.click(
      screen.getByRole('button', { name: 'Actions for Cardiac Care' })
    );
    expect(onOpenMenu).toHaveBeenCalledWith(
      'assign-1',
      expect.any(HTMLElement)
    );
  });

  it('highlights a deep-linked row', () => {
    renderRow({ isHighlighted: true });
    expect(screen.getByRole('row')).toHaveClass('bg-[#e9e9e9]');
  });

  it('shows the LTI assignment chip and explains it on hover', () => {
    renderRow({
      lmsAssignment: {
        simulationId: 'lib-1',
        label: 'Chest Pain Scenario',
        url: null,
      },
      lmsProvider: 'canvas',
    });

    const chip = screen.getByText('Chest Pain Scenario');
    expect(chip).toHaveClass('bg-gray-50');
    expect(screen.queryByRole('link')).not.toBeInTheDocument();

    fireEvent.mouseEnter(chip);
    expect(screen.getByRole('tooltip')).toHaveTextContent(
      'Chest Pain Scenario'
    );
  });

  it('shows the kind alone when the LMS label just repeats the sim title', () => {
    renderRow({
      lmsAssignment: {
        simulationId: 'lib-1',
        label: 'Cardiac Care',
        url: null,
      },
      lmsProvider: 'canvas',
    });

    const chip = screen.getByText('Assignment');
    fireEvent.mouseEnter(chip);
    expect(screen.getByRole('tooltip')).toHaveTextContent('Cardiac Care');
  });

  it('still shows a chip when the LTI line item has no label', () => {
    renderRow({
      lmsAssignment: { simulationId: 'lib-1', label: null, url: null },
      lmsProvider: 'canvas',
    });

    const chip = screen.getByText('Assignment');
    expect(chip).toHaveClass('bg-gray-50');
    fireEvent.mouseEnter(chip);
    expect(screen.getByRole('tooltip')).toHaveTextContent('Assignment');
  });

  it('still shows a chip when the CourseWork mapping has no title', () => {
    renderRow({
      lmsAssignment: {
        simulationId: 'lib-1',
        label: null,
        url: 'https://classroom.google.com/c/abc/a/def',
      },
      lmsProvider: 'google_classroom',
    });

    expect(screen.getByRole('link', { name: 'CourseWork' })).toHaveAttribute(
      'href',
      'https://classroom.google.com/c/abc/a/def'
    );
  });

  it('links the Google CourseWork mapping when the row carries one', () => {
    renderRow({
      lmsAssignment: {
        simulationId: 'lib-1',
        label: 'Diabetes Sim',
        url: 'https://classroom.google.com/c/abc/a/def',
      },
      lmsProvider: 'google_classroom',
    });

    const chip = screen.getByRole('link', { name: 'Diabetes Sim' });
    expect(chip).toHaveAttribute(
      'href',
      'https://classroom.google.com/c/abc/a/def'
    );
    expect(chip).toHaveClass('bg-gray-50');
  });

  it('shows no mapping line for a sim with no LMS assignment', () => {
    renderRow();

    expect(screen.queryByText(/Assignment:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/CourseWork:/)).not.toBeInTheDocument();
  });

  it('opens the clicked date for editing', () => {
    const { onEditDate } = renderRow();
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Edit close date for Cardiac Care, currently 01-31-2099',
      })
    );
    expect(onEditDate).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'assign-1' }),
      'end_date'
    );
  });

  it('edits only the open date and saves it for this row', () => {
    const { onSaveDate } = renderRow({
      editingDateField: 'start_date',
      dateError: 'Enter a date.',
    });
    const input = screen.getByLabelText('Edit start date for Cardiac Care');
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect(screen.getByText('01-20-2026').tagName).toBe('BUTTON');

    fireEvent.change(input, { target: { value: '2026-01-02' } });

    expect(onSaveDate).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'assign-1' }),
      'start_date',
      '2026-01-02'
    );
  });

  it('shows plain dates with no edit control on an archived class', () => {
    renderRow({ isClassArchived: true });
    expect(screen.getByText('01-01-2026').tagName).toBe('TD');
    expect(
      screen.queryByRole('button', { name: /^Edit .* date/ })
    ).not.toBeInTheDocument();
  });

  it('disables the other dates while one is saving', () => {
    renderRow({ editingDateField: 'due_date', isSavingDate: true });

    expect(
      screen.getByLabelText('Edit due date for Cardiac Care')
    ).toHaveAttribute('readonly');
    expect(
      screen.getByRole('button', {
        name: 'Edit start date for Cardiac Care, currently 01-01-2026',
      })
    ).toBeDisabled();
    expect(
      screen.getByRole('button', {
        name: 'Edit close date for Cardiac Care, currently 01-31-2099',
      })
    ).toBeDisabled();
  });

  it('disables every date in a row while another row is saving', () => {
    renderRow({ editingDateField: null, isSavingDate: true });

    expect(
      screen.getAllByRole('button', { name: /^Edit .* date for Cardiac Care/ })
    ).toHaveLength(3);
    for (const button of screen.getAllByRole('button', {
      name: /^Edit .* date for Cardiac Care/,
    })) {
      expect(button).toBeDisabled();
    }
  });
});
