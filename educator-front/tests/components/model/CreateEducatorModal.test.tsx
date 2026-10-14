import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { type FormikProps } from 'formik';
import CreateEducatorModal from '../../../src/components/modal/CreateEducatorModal';

type SelectOption = { value: string; label: string };

vi.mock('../../../src/components/ui/Modal', () => ({
  default: ({
    children,
    isOpen,
    title,
    footer,
  }: {
    children: React.ReactNode;
    isOpen: boolean;
    title?: React.ReactNode;
    footer?: React.ReactNode;
  }) => {
    if (!isOpen) return null;

    return (
      <div data-testid="modal">
        {title && <h1>{title}</h1>}
        <div>{children}</div>
        {footer && <div>{footer}</div>}
      </div>
    );
  },
}));

vi.mock('../../../src/components/ui/FormField', () => ({
  default: ({
    label,
    children,
    error,
  }: {
    label: string;
    children: React.ReactNode;
    error?: string;
  }) => (
    <div>
      <label>{label}</label>
      {children}
      {error && <span data-testid="field-error">{error}</span>}
    </div>
  ),
}));

vi.mock('../../../src/components/ui/Input', () => ({
  default: ({
    name,
    value,
    placeholder,
    onChange,
    onBlur,
    disabled,
  }: {
    name?: string;
    value?: string;
    placeholder?: string;
    onChange?: React.ChangeEventHandler<HTMLInputElement>;
    onBlur?: React.FocusEventHandler<HTMLInputElement>;
    disabled?: boolean;
  }) => (
    <input
      data-testid={name || placeholder || 'input'}
      name={name}
      value={value ?? ''}
      placeholder={placeholder}
      onChange={onChange}
      onBlur={onBlur}
      disabled={disabled}
    />
  ),
}));

vi.mock('../../../src/components/ui/Button', () => ({
  Button: ({
    children,
    onClick,
    type = 'button',
    form,
    loading,
    disabled,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    type?: 'button' | 'submit' | 'reset';
    form?: string;
    loading?: boolean;
    disabled?: boolean;
  }) => (
    <button
      type={type}
      form={form}
      onClick={onClick}
      disabled={disabled || loading}
      data-testid={
        loading
          ? 'loading-button'
          : typeof children === 'string'
            ? children
            : 'button'
      }
    >
      {loading ? 'Loading...' : children}
    </button>
  ),
}));

vi.mock('../../../src/components/ui/Select', () => ({
  default: ({
    value,
    onChange,
    disabled,
    options,
    placeholder,
  }: {
    value: string;
    onChange: (value: string) => void;
    disabled?: boolean;
    options?: SelectOption[];
    placeholder?: string;
  }) => (
    <select
      data-testid={placeholder ? `select-${placeholder}` : 'select'}
      value={value ?? ''}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
    >
      {placeholder && <option value="">{placeholder}</option>}
      {options?.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  ),
}));

vi.mock('../../../src/utils/inputSecurity', () => ({
  sanitizeTextForTyping: vi.fn((_value: string, _maxLength: number) => _value),
  trimBoundaryWhitespace: vi.fn((value: string) => value),
  EDUCATOR_NAME_MAX_LENGTH: 100,
}));

vi.mock('../../../src/locales/auth/login/en.json', () => ({ default: {} }));
vi.mock('../../../src/locales/auth/login/es.json', () => ({ default: {} }));

type EducatorFormValues = {
  full_name: string;
  email: string;
  status: string;
  tokens: number;
  school_id: string;
};

const mockSchools = [
  { id: 'school-1', school_name: 'Test School', status: 'ACTIVE' },
];

const mockSetIsModalOpen = vi.fn();
const mockSetTokensInput = vi.fn();

const createMockFormik = (): Partial<FormikProps<EducatorFormValues>> => ({
  values: {
    full_name: 'John Doe',
    email: 'john@example.com',
    status: 'ACTIVE',
    tokens: 10,
    school_id: 'school-1',
  },

  errors: {},

  touched: {},

  submitCount: 0,

  handleChange: vi.fn(),

  handleBlur: vi.fn(),

  handleSubmit: vi.fn((e?: React.FormEvent<HTMLFormElement>) =>
    e?.preventDefault?.()
  ),

  setFieldValue: vi.fn(),
});

const defaultProps = (overrides = {}) => ({
  isModalOpen: true,
  setIsModalOpen: mockSetIsModalOpen,
  modalMode: 'create' as const,
  schools: mockSchools,
  isSubmitting: false,
  tokensInput: '10',
  setTokensInput: mockSetTokensInput,
  formik: createMockFormik() as unknown as FormikProps<EducatorFormValues>,
  ...overrides,
});

const renderModal = (overrides = {}) =>
  render(<CreateEducatorModal {...defaultProps(overrides)} />);

// ── tests ──────────────────────────────────────────────────────────────────

describe('CreateEducatorModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing when modal is closed', () => {
    renderModal({ isModalOpen: false });

    expect(screen.queryByTestId('modal')).not.toBeInTheDocument();
  });

  it('renders modal when open', () => {
    renderModal();

    expect(screen.getByTestId('modal')).toBeInTheDocument();
  });

  it('renders create mode correctly', () => {
    renderModal();

    expect(screen.getByText('Create Educator')).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText('Enter educator name')
    ).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText('Enter Educator Email')
    ).toBeInTheDocument();
    expect(screen.getByTestId('select-Select school')).toBeInTheDocument();
    expect(screen.getByTestId('select-Select status')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /back/i })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /add educator/i })
    ).toBeInTheDocument();
  });

  it('renders edit mode correctly', () => {
    renderModal({ modalMode: 'edit' });

    expect(screen.getByText('Edit Educator')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /update educator/i })
    ).toBeInTheDocument();
  });

  it('renders view mode correctly', () => {
    renderModal({
      modalMode: 'view',
      selectedEducator: {
        id: 'edu-1',
        full_name: 'John Doe',
        email: 'john@example.com',
        status: 'ACTIVE',
        schools: [{ id: 'school-1', school_name: 'Test School' }],
      },
    });

    expect(screen.getByText('View Educator')).toBeInTheDocument();
    expect(screen.getByDisplayValue('John Doe')).toBeDisabled();
    // Schools are now rendered as chips, not a disabled input
    expect(screen.getByText('Test School')).toBeInTheDocument();

    const statusInput = screen.getByDisplayValue('Active');
    expect(statusInput).toBeDisabled();

    expect(
      screen.queryByRole('button', { name: /add educator/i })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /update educator/i })
    ).not.toBeInTheDocument();
  });

  it('calls setIsModalOpen when back clicked', () => {
    renderModal();

    fireEvent.click(screen.getByRole('button', { name: /back/i }));

    expect(mockSetIsModalOpen).toHaveBeenCalledWith(false);
  });

  it('calls setFieldValue with sanitized value on name change', () => {
    const formik = createMockFormik();

    renderModal({
      formik: formik as unknown as FormikProps<EducatorFormValues>,
    });

    fireEvent.change(screen.getByPlaceholderText('Enter educator name'), {
      target: {
        name: 'full_name',
        value: 'Jane Doe',
      },
    });

    expect(formik.setFieldValue).toHaveBeenCalledWith('full_name', 'Jane Doe');
  });

  it('calls handleBlur on name field blur', () => {
    const formik = createMockFormik();

    renderModal({
      formik: formik as unknown as FormikProps<EducatorFormValues>,
    });

    fireEvent.blur(screen.getByPlaceholderText('Enter educator name'), {
      target: { name: 'full_name', value: 'John Doe' },
    });

    expect(formik.handleBlur).toHaveBeenCalled();
  });

  it('calls setFieldValue on status change', () => {
    const formik = createMockFormik();

    renderModal({
      formik: formik as unknown as FormikProps<EducatorFormValues>,
    });

    fireEvent.change(screen.getByTestId('select-Select status'), {
      target: {
        value: 'INACTIVE',
      },
    });

    expect(formik.setFieldValue).toHaveBeenCalledWith('status', 'INACTIVE');
  });

  it('shows loading on submit button', () => {
    renderModal({ isSubmitting: true });

    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('disables submit button while submitting', () => {
    renderModal({ isSubmitting: true });

    expect(screen.getByTestId('loading-button')).toBeDisabled();
  });

  it('shows validation error for full_name', () => {
    const formik = createMockFormik();

    formik.touched = { full_name: true };

    formik.errors = { full_name: 'Educator name is required' };

    renderModal({
      formik: formik as unknown as FormikProps<EducatorFormValues>,
    });

    expect(screen.getByText('Educator name is required')).toBeInTheDocument();
  });

  it('does not show validation error when untouched', () => {
    const formik = createMockFormik();

    formik.errors = { full_name: 'Educator name is required' };

    renderModal({
      formik: formik as unknown as FormikProps<EducatorFormValues>,
    });

    expect(
      screen.queryByText('Educator name is required')
    ).not.toBeInTheDocument();
  });

  it('hides seats field in view mode', () => {
    renderModal({ modalMode: 'view' });

    expect(
      screen.queryByPlaceholderText('Enter Educator seats')
    ).not.toBeInTheDocument();
  });

  it('shows seats field in create mode', () => {
    renderModal();

    expect(
      screen.getByPlaceholderText('Enter Educator seats')
    ).toBeInTheDocument();
  });

  it('updates tokens input and formik value on seats change', () => {
    const formik = createMockFormik();

    renderModal({
      formik: formik as unknown as FormikProps<EducatorFormValues>,
    });

    fireEvent.change(screen.getByPlaceholderText('Enter Educator seats'), {
      target: { value: '20' },
    });

    expect(mockSetTokensInput).toHaveBeenCalledWith('20');
    expect(formik.setFieldValue).toHaveBeenCalledWith('tokens', 20);
  });
});
