import { fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import {
  AttentionFilterChip,
  isClassListFilterMeasure,
} from '../../../src/components/class/AttentionFilterChip';
import { ClassAttentionMeasure } from '../../../src/redux/api/classes/classes.types';
import { renderWithProviders } from '../../../src/test/testUtils';

describe('AttentionFilterChip', () => {
  it.each([
    [ClassAttentionMeasure.UNREAD_REPORTS, 'Classes with unread reports (2)'],
    [ClassAttentionMeasure.NO_STUDENTS, 'Classes with no students (2)'],
    [
      ClassAttentionMeasure.NO_ASSIGNED_SIMS,
      'Classes with no assigned simulations (2)',
    ],
    [ClassAttentionMeasure.ACTIVE, 'Active classes (2)'],
    [ClassAttentionMeasure.CLOSING_SOON, 'Classes closing within 14 days (2)'],
    [
      ClassAttentionMeasure.NEAR_AVATAR_LIMIT,
      'Classes with students near the avatar limit (2)',
    ],
  ] as const)('labels %s with its count', (measure, text) => {
    renderWithProviders(
      <AttentionFilterChip measure={measure} count={2} onClear={vi.fn()} />
    );
    expect(screen.getByText('Showing:')).toBeInTheDocument();
    expect(screen.getByText(text)).toBeInTheDocument();
  });

  it('announces the applied filter as a polite live status', () => {
    renderWithProviders(
      <AttentionFilterChip
        measure={ClassAttentionMeasure.UNREAD_REPORTS}
        count={4}
        onClear={vi.fn()}
      />
    );
    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(status).toHaveTextContent('Classes with unread reports (4)');
  });

  it('calls onClear when the clear button is clicked', () => {
    const onClear = vi.fn();
    renderWithProviders(
      <AttentionFilterChip
        measure={ClassAttentionMeasure.NO_STUDENTS}
        count={1}
        onClear={onClear}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Clear filter' }));
    expect(onClear).toHaveBeenCalledTimes(1);
  });
});

describe('AttentionFilterChip – keyboard', () => {
  it.each(['{Enter}', ' '])(
    'clears the filter from the keyboard (%s)',
    async (key) => {
      const user = userEvent.setup();
      const onClear = vi.fn();
      renderWithProviders(
        <AttentionFilterChip
          measure={ClassAttentionMeasure.UNREAD_REPORTS}
          count={2}
          onClear={onClear}
        />
      );

      await user.tab();
      expect(
        screen.getByRole('button', { name: 'Clear filter' })
      ).toHaveFocus();
      await user.keyboard(key);
      expect(onClear).toHaveBeenCalledTimes(1);
    }
  );
});

describe('isClassListFilterMeasure', () => {
  it('accepts every class-list measure and rejects anything else', () => {
    for (const measure of Object.values(ClassAttentionMeasure)) {
      expect(isClassListFilterMeasure(measure)).toBe(true);
    }
    expect(isClassListFilterMeasure('foo')).toBe(false);
    // Inherited Object.prototype keys must not pass.
    expect(isClassListFilterMeasure('toString')).toBe(false);
    expect(isClassListFilterMeasure('constructor')).toBe(false);
    expect(isClassListFilterMeasure('__proto__')).toBe(false);
    expect(isClassListFilterMeasure('')).toBe(false);
    expect(isClassListFilterMeasure(null)).toBe(false);
  });
});
