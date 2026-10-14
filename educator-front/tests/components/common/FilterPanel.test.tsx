import { StrictMode, useState } from 'react';
import { act, render, screen, fireEvent } from '@testing-library/react';
import { afterEach, describe, test, expect, vi } from 'vitest';
import '../../../src/i18n';
import FilterPanel from '../../../src/components/common/FilterPanel';

interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps {
  label: string;
  value: string;
  placeholder: string;
  options: SelectOption[];
  onChange: (value: string) => void;
}

vi.mock('../../../src/components/ui/Button', () => ({
  Button: ({
    onClick,
    children,
    disabled,
  }: {
    onClick?: () => void;
    children: React.ReactNode;
    disabled?: boolean;
  }) => (
    <button onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
}));

vi.mock('../../../src/components/ui/Select', () => ({
  default: ({ label, value, placeholder, options, onChange }: SelectProps) => (
    <div>
      <label>{label}</label>
      <select
        data-testid={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">{placeholder}</option>
        {options.map((option: SelectOption) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  ),
}));

describe('FilterPanel', () => {
  const onApply = vi.fn();
  const onReset = vi.fn();
  const onClose = vi.fn();
  const onChange = vi.fn();

  const fields = [
    {
      label: 'Status',
      value: '',
      placeholder: 'Select Status',
      options: [
        { value: 'ACTIVE', label: 'Active' },
        { value: 'INACTIVE', label: 'Inactive' },
      ],
      onChange,
    },
  ];

  test('returns focus to the button that opened it when it closes', () => {
    function Harness() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen((o) => !o)}>
            Filters
          </button>
          {open && (
            <FilterPanel
              title="Filter Educators"
              fields={fields}
              onApply={onApply}
              onReset={onReset}
              onClose={() => setOpen(false)}
            />
          )}
        </>
      );
    }
    // StrictMode, as in the app: it runs effects twice in dev, which is how
    // this was missed before.
    render(
      <StrictMode>
        <Harness />
      </StrictMode>
    );
    const opener = screen.getByRole('button', { name: 'Filters' });
    opener.focus();
    fireEvent.click(opener);
    // Focus moves into the panel on open…
    expect(opener).not.toHaveFocus();
    // …and back to the opener on close.
    fireEvent.click(screen.getByRole('button', { name: 'Close filters' }));
    expect(opener).toHaveFocus();
  });

  test('renders filter panel title', () => {
    render(
      <FilterPanel
        title="Filter Educators"
        fields={fields}
        onApply={onApply}
        onReset={onReset}
        onClose={onClose}
      />
    );

    expect(screen.getByText('Filter Educators')).toBeInTheDocument();
  });

  test('renders select fields', () => {
    render(
      <FilterPanel
        title="Filter Educators"
        fields={fields}
        onApply={onApply}
        onReset={onReset}
        onClose={onClose}
      />
    );

    expect(screen.getByText('Status')).toBeInTheDocument();
    expect(screen.getByText('Select Status')).toBeInTheDocument();
  });

  test('calls onApply when apply button clicked', () => {
    const fieldsWithValue = [
      {
        label: 'Status',
        value: 'ACTIVE',
        placeholder: 'Select Status',
        options: [
          { value: 'ACTIVE', label: 'Active' },
          { value: 'INACTIVE', label: 'Inactive' },
        ],
        onChange,
      },
    ];

    render(
      <FilterPanel
        title="Filter Educators"
        fields={fieldsWithValue}
        onApply={onApply}
        onReset={onReset}
        onClose={onClose}
      />
    );

    fireEvent.click(screen.getByText('Apply Filter'));

    expect(onApply).toHaveBeenCalled();
  });

  test('does not call onClose itself on Apply, leaving close-on-apply to the consumer to avoid the stale-state race', () => {
    const fieldsWithValue = [
      {
        label: 'Status',
        value: 'ACTIVE',
        placeholder: 'Select Status',
        options: [
          { value: 'ACTIVE', label: 'Active' },
          { value: 'INACTIVE', label: 'Inactive' },
        ],
        onChange,
      },
    ];
    const localOnClose = vi.fn();

    render(
      <FilterPanel
        title="Filter Educators"
        fields={fieldsWithValue}
        onApply={onApply}
        onReset={onReset}
        onClose={localOnClose}
      />
    );

    fireEvent.click(screen.getByText('Apply Filter'));

    expect(onApply).toHaveBeenCalled();
    expect(localOnClose).not.toHaveBeenCalled();
  });

  test('does not call onClose when Apply is blocked by the no-filters guard', () => {
    const localOnClose = vi.fn();

    render(
      <FilterPanel
        title="Filter Educators"
        fields={fields}
        onApply={onApply}
        onReset={onReset}
        onClose={localOnClose}
      />
    );

    fireEvent.click(screen.getByText('Apply Filter'));

    expect(localOnClose).not.toHaveBeenCalled();
  });

  describe('Apply debounce timer', () => {
    const valueFields = [
      {
        label: 'Status',
        value: 'ACTIVE',
        placeholder: 'Select Status',
        options: [{ value: 'ACTIVE', label: 'Active' }],
        onChange,
      },
    ];

    afterEach(() => {
      vi.useRealTimers();
    });

    test('disables Apply briefly after a click, then re-enables it', () => {
      vi.useFakeTimers();
      render(
        <FilterPanel
          title="Filter Educators"
          fields={valueFields}
          onApply={onApply}
          onReset={onReset}
          onClose={onClose}
        />
      );
      const apply = screen.getByText('Apply Filter');

      fireEvent.click(apply);
      expect(apply).toBeDisabled();

      act(() => vi.advanceTimersByTime(300));
      expect(apply).toBeEnabled();
    });

    test('clears its timer when unmounted right after Apply (e.g. the panel closes)', () => {
      vi.useFakeTimers();
      const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');
      const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');
      const { unmount } = render(
        <FilterPanel
          title="Filter Educators"
          fields={valueFields}
          onApply={onApply}
          onReset={onReset}
          onClose={onClose}
        />
      );

      fireEvent.click(screen.getByText('Apply Filter'));
      const applyTimerIndex = setTimeoutSpy.mock.calls.findIndex(
        ([, delay]) => delay === 300
      );
      expect(applyTimerIndex).toBeGreaterThanOrEqual(0);
      const applyTimer = setTimeoutSpy.mock.results[applyTimerIndex]?.value;

      unmount();
      expect(clearTimeoutSpy).toHaveBeenCalledWith(applyTimer);

      setTimeoutSpy.mockRestore();
      clearTimeoutSpy.mockRestore();
    });
  });

  test('calls onReset when reset button clicked', () => {
    render(
      <FilterPanel
        title="Filter Educators"
        fields={fields}
        onApply={onApply}
        onReset={onReset}
        onClose={onClose}
      />
    );

    fireEvent.click(screen.getByText('Reset Filter'));

    expect(onReset).toHaveBeenCalled();
  });

  test('calls onClose when close button clicked', () => {
    render(
      <FilterPanel
        title="Filter Educators"
        fields={fields}
        onApply={onApply}
        onReset={onReset}
        onClose={onClose}
      />
    );

    const closeButton = screen.getByRole('button', { name: 'Close filters' });
    fireEvent.click(closeButton);

    expect(onClose).toHaveBeenCalled();
  });

  test('calls field onChange when option selected', () => {
    render(
      <FilterPanel
        title="Filter Educators"
        fields={fields}
        onApply={onApply}
        onReset={onReset}
        onClose={onClose}
      />
    );

    fireEvent.click(screen.getByText('Select Status'));

    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  test('renders SelectField dropdown when type is select even if options array is empty', () => {
    const emptyOptionFields = [
      {
        type: 'select' as const,
        label: 'Learner Level',
        value: '',
        placeholder: 'Select Learner Level',
        options: [],
        onChange,
      },
    ];

    render(
      <FilterPanel
        title="Filter Simulations"
        fields={emptyOptionFields}
        onApply={onApply}
        onReset={onReset}
        onClose={onClose}
      />
    );

    expect(screen.getByText('Learner Level')).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  test('renders Input textbox when type is input', () => {
    const inputFields = [
      {
        type: 'input' as const,
        label: 'Product',
        value: '',
        placeholder: 'Select Product',
        options: [],
        onChange,
      },
    ];

    render(
      <FilterPanel
        title="Filter Simulations"
        fields={inputFields}
        onApply={onApply}
        onReset={onReset}
        onClose={onClose}
      />
    );

    expect(screen.getByPlaceholderText('Select Product')).toBeInTheDocument();
    expect(screen.getByLabelText('Product')).toBe(
      screen.getByPlaceholderText('Select Product')
    );
  });

  describe('multi-select and date fields', () => {
    const renderPanel = ({ schools = [] as string[], startDate = '' } = {}) => {
      const handlers = {
        onValuesChange: vi.fn(),
        onDateChange: vi.fn(),
        onApply: vi.fn(),
        onReset: vi.fn(),
      };
      render(
        <FilterPanel
          title="Filter Classes"
          fields={[
            {
              label: 'School',
              placeholder: 'Pick schools',
              multiple: true,
              values: schools,
              onValuesChange: handlers.onValuesChange,
              options: [
                { value: 's-1', label: 'Hillcrest' },
                { value: 's-2', label: 'Lakeside' },
              ],
            },
            {
              label: 'Start Date',
              type: 'date',
              value: startDate,
              placeholder: '',
              onChange: handlers.onDateChange,
              options: [],
            },
          ]}
          onApply={handlers.onApply}
          onReset={handlers.onReset}
          onClose={onClose}
        />
      );
      return handlers;
    };

    test('wires option picks to onValuesChange', () => {
      const { onValuesChange } = renderPanel({ schools: ['s-1'] });

      fireEvent.click(screen.getByRole('button', { name: 'School' }));
      fireEvent.click(screen.getByRole('option', { name: 'Lakeside' }));

      expect(onValuesChange).toHaveBeenCalledWith(['s-1', 's-2']);
    });

    test('names the date input by its label', () => {
      renderPanel();
      expect(screen.getByLabelText('Start Date')).toHaveAttribute(
        'type',
        'date'
      );
    });

    test('wires the date input to onChange', () => {
      const { onDateChange } = renderPanel();

      fireEvent.change(screen.getByLabelText('Start Date'), {
        target: { value: '2026-01-15' },
      });

      expect(onDateChange).toHaveBeenCalledWith('2026-01-15');
    });

    test('Reset clears multi-select values and dates before calling onReset', () => {
      const handlers = renderPanel({
        schools: ['s-1'],
        startDate: '2026-01-15',
      });

      fireEvent.click(screen.getByText('Reset Filter'));

      expect(handlers.onValuesChange).toHaveBeenCalledWith([]);
      expect(handlers.onDateChange).toHaveBeenCalledWith('');
      expect(handlers.onReset).toHaveBeenCalled();
    });

    test.each([
      ['a multi-select value', { schools: ['s-1'] }],
      ['a date', { startDate: '2026-01-15' }],
    ])('Apply is allowed with only %s', (_case, values) => {
      const { onApply } = renderPanel(values);

      fireEvent.click(screen.getByText('Apply Filter'));

      expect(onApply).toHaveBeenCalled();
    });

    test('Apply is blocked when no multi-select value or date is set', () => {
      const { onApply } = renderPanel();

      fireEvent.click(screen.getByText('Apply Filter'));

      expect(onApply).not.toHaveBeenCalled();
    });
  });
});
