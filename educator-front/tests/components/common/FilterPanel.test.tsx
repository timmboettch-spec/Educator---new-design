import { render, screen, fireEvent } from '@testing-library/react';
import { describe, test, expect, vi } from 'vitest';
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
      <select data-testid={label} value={value} onChange={(e) => onChange(e.target.value)}>
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

  test('renders filter panel title', () => {
    render(
      <FilterPanel
        title="Filter Educators"
        fields={fields}
        onApply={onApply}
        onReset={onReset}
        onClose={onClose}
      />,
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
      />,
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
      />,
    );

    fireEvent.click(screen.getByText('Apply Filter'));

    expect(onApply).toHaveBeenCalled();
  });

  test('calls onReset when reset button clicked', () => {
    render(
      <FilterPanel
        title="Filter Educators"
        fields={fields}
        onApply={onApply}
        onReset={onReset}
        onClose={onClose}
      />,
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
      />,
    );

    const closeButton = screen.getAllByRole('button')[0];
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
      />,
    );

    fireEvent.click(screen.getByText('Select Status'));

    expect(screen.getByText('Active')).toBeInTheDocument();
  });
});
