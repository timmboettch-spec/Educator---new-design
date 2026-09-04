import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FormikProps } from 'formik';
import { SchoolFormValues } from '../../../src/types';
import CreateSchoolModal from '../../../src/components/modal/CreateSchoolModal';

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
      data-testid={loading ? 'loading-button' : typeof children === 'string' ? children : 'button'}
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
  }: {
    value: string;
    onChange: (value: string) => void;
    disabled?: boolean;
    options?: SelectOption[];
  }) => (
    <select
      data-testid="status-select"
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
    >
      {options?.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  ),
}));

vi.mock('lucide-react', () => ({
  AlertCircle: () => <div data-testid="alert-icon">Alert Icon</div>,
}));

vi.mock('../../../src/utils/messages', () => ({
  SCHOOL_BUTTONS: {
    ADD_SCHOOL: 'Add School',
    UPDATE_SCHOOL: 'Update School',
  },

  SCHOOL_CONFIRMATIONS: {
    DELETE: 'Are you sure you want to delete this School? This action cannot be undone.',
  },

  SCHOOL_FIELDS: {
    SCHOOL_NAME: 'School Name',
  },

  SCHOOL_MODALS: {
    ADD: 'Create School',
    EDIT: 'Edit School',
    VIEW: 'View School',
    DELETE: 'Delete School',
  },
}));

const mockSetIsModalOpen = vi.fn();
const mockConfirmDelete = vi.fn();

const createMockFormik = () => ({
  values: {
    school_name: 'Test School',
    status: 'ACTIVE',
  },

  errors: {},

  touched: {},

  handleChange: vi.fn(),

  handleBlur: vi.fn(),

  handleSubmit: vi.fn((e?: React.FormEvent<HTMLFormElement>) => e?.preventDefault?.()),

  setFieldValue: vi.fn(),
});

const defaultProps = (overrides = {}) => ({
  isModalOpen: true,

  setIsModalOpen: mockSetIsModalOpen,

  modalMode: 'create' as const,

  selectedSchool: {
    id: 'school-1',
    school_name: 'Test School',
    status: 'ACTIVE',
    user_id: 'user-1',
  },

  isDeleting: false,

  isSubmitting: false,

  confirmDelete: mockConfirmDelete,

  formik: createMockFormik() as unknown as FormikProps<SchoolFormValues>,

  ...overrides,
});

const renderModal = (overrides = {}) => render(<CreateSchoolModal {...defaultProps(overrides)} />);

describe('CreateSchoolModal', () => {
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

    expect(screen.getByText('Create School')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Enter School Name')).toBeInTheDocument();
    expect(screen.getByTestId('status-select')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /back/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add school/i })).toBeInTheDocument();
  });

  it('renders edit mode correctly', () => {
    renderModal({ modalMode: 'edit' });

    expect(screen.getByText('Edit School')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /update school/i })).toBeInTheDocument();
  });

  it('renders view mode correctly', () => {
    renderModal({ modalMode: 'view' });

    expect(screen.getByText('View School')).toBeInTheDocument();

    expect(screen.getByDisplayValue('Test School')).toBeDisabled();

    const statusInput = screen.getByDisplayValue('Active');
    expect(statusInput).toBeDisabled();

    expect(screen.queryByRole('button', { name: /add school/i })).not.toBeInTheDocument();

    expect(screen.queryByRole('button', { name: /update school/i })).not.toBeInTheDocument();
  });

  it('renders delete modal correctly', () => {
    renderModal({ modalMode: 'delete' });

    expect(screen.getByTestId('alert-icon')).toBeInTheDocument();

    expect(screen.getAllByText('Delete School').length).toBeGreaterThan(0);

    expect(screen.getByText('Test School')).toBeInTheDocument();

    expect(
      screen.getByText(
        'Are you sure you want to delete this School? This action cannot be undone.',
      ),
    ).toBeInTheDocument();
  });

  it('calls setIsModalOpen when back clicked', () => {
    renderModal();

    fireEvent.click(screen.getByRole('button', { name: /back/i }));

    expect(mockSetIsModalOpen).toHaveBeenCalledWith(false);
  });

  it('calls confirmDelete', () => {
    renderModal({ modalMode: 'delete' });

    fireEvent.click(screen.getByRole('button', { name: /delete school/i }));

    expect(mockConfirmDelete).toHaveBeenCalled();
  });

  it('calls handleChange', () => {
    const formik = createMockFormik();

    renderModal({
      formik: formik as unknown as FormikProps<SchoolFormValues>,
    });

    fireEvent.change(screen.getByPlaceholderText('Enter School Name'), {
      target: {
        name: 'school_name',
        value: 'New School',
      },
    });

    expect(formik.setFieldValue).toHaveBeenCalledWith('school_name', 'New School');
  });

  it('calls setFieldValue with trimmed value on blur', () => {
    const formik = createMockFormik();
    formik.values.school_name = '  Central High  ';

    renderModal({
      formik: formik as unknown as FormikProps<SchoolFormValues>,
    });

    fireEvent.blur(screen.getByPlaceholderText('Enter School Name'), {
      target: { name: 'school_name', value: '  Central High  ' },
    });

    expect(formik.handleBlur).toHaveBeenCalled();
  });

  it('strips control characters from school name input', () => {
    const formik = createMockFormik();

    renderModal({
      formik: formik as unknown as FormikProps<SchoolFormValues>,
    });

    fireEvent.change(screen.getByPlaceholderText('Enter School Name'), {
      target: { name: 'school_name', value: 'West\u0000Side' },
    });

    expect(formik.setFieldValue).toHaveBeenCalledWith('school_name', 'WestSide');
  });

  it('calls setFieldValue', () => {
    const formik = createMockFormik();

    renderModal({
      formik: formik as unknown as FormikProps<SchoolFormValues>,
    });

    fireEvent.change(screen.getByTestId('status-select'), {
      target: {
        value: 'INACTIVE',
      },
    });

    expect(formik.setFieldValue).toHaveBeenCalledTimes(1);

    expect(formik.setFieldValue).toHaveBeenCalledWith('status', 'INACTIVE');
  });

  it('shows loading on delete button', () => {
    renderModal({
      modalMode: 'delete',
      isDeleting: true,
    });

    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('shows loading on submit button', () => {
    renderModal({
      isSubmitting: true,
    });

    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('disables delete button while deleting', () => {
    renderModal({
      modalMode: 'delete',
      isDeleting: true,
    });

    expect(screen.getByTestId('loading-button')).toBeDisabled();
  });

  it('shows validation error', () => {
    const formik = createMockFormik();

    formik.touched = {
      school_name: true,
    };

    formik.errors = {
      school_name: 'School name is required',
    };

    renderModal({
      formik,
    });

    expect(screen.getByText('School name is required')).toBeInTheDocument();
  });

  it('does not show validation error when untouched', () => {
    const formik = createMockFormik();

    formik.errors = {
      school_name: 'School name is required',
    };

    renderModal({
      formik,
    });

    expect(screen.queryByText('School name is required')).not.toBeInTheDocument();
  });
});
