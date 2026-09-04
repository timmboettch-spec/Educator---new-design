import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import CreateSchoolModal from '../../../src/components/modal/CreateSchoolModal';

vi.mock('../../../src/components/ui/Modal', () => ({
  default: ({
    isOpen, children, title, footer,
  }: { isOpen: boolean; children: React.ReactNode; title?: string; footer?: React.ReactNode }) =>
    isOpen ? (
      <div role="dialog">
        {title && <h2>{title}</h2>}
        <div>{children}</div>
        {footer && <div>{footer}</div>}
      </div>
    ) : null,
}));

vi.mock('../../../src/components/ui/Button', () => ({
  Button: ({ children, onClick, loading, type }: {
    children: React.ReactNode; onClick?: () => void; loading?: boolean; type?: string;
  }) => (
    <button type={(type as 'submit' | 'button') ?? 'button'} onClick={onClick} disabled={loading}>
      {loading ? 'Saving…' : children}
    </button>
  ),
}));

vi.mock('../../../src/components/ui/Input', () => ({
  default: ({ name, value, onChange, onBlur, placeholder, disabled }: {
    name?: string; value?: string; onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
    onBlur?: (e: React.FocusEvent<HTMLInputElement>) => void; placeholder?: string; disabled?: boolean;
  }) => <input name={name} value={value} onChange={onChange} onBlur={onBlur} placeholder={placeholder} disabled={disabled} />,
}));

vi.mock('../../../src/components/ui/FormField', () => ({
  default: ({ label, children, error }: { label?: string; children: React.ReactNode; error?: string }) => (
    <div>
      {label && <label>{label}</label>}
      {children}
      {error && <span role="alert">{error}</span>}
    </div>
  ),
}));

vi.mock('../../../src/components/ui/Select', () => ({
  default: ({ label, value, onChange, options, error }: {
    label?: string; value?: string; onChange?: (v: string) => void;
    options?: { value: string; label: string }[]; error?: string;
  }) => (
    <div>
      {label && <label>{label}</label>}
      <select value={value} onChange={(e) => onChange?.(e.target.value)}>
        {options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      {error && <span role="alert">{error}</span>}
    </div>
  ),
}));

vi.mock('../../../src/utils/inputSecurity', () => ({
  SCHOOL_NAME_MAX_LENGTH: 100,
  sanitizeTextForTyping: (v: string) => v,
  trimBoundaryWhitespace: (v: string) => v.trim(),
}));

const mockFormik = {
  values: { school_name: '', status: 'ACTIVE' },
  errors: {},
  touched: {},
  handleChange: vi.fn(),
  handleBlur: vi.fn(),
  handleSubmit: vi.fn((e?: React.FormEvent) => e?.preventDefault()),
  setFieldValue: vi.fn(),
} as never;

const defaultProps = {
  isModalOpen: true,
  setIsModalOpen: vi.fn(),
  modalMode: 'create' as const,
  selectedSchool: null,
  isDeleting: false,
  isSubmitting: false,
  confirmDelete: vi.fn(),
  formik: mockFormik,
};

describe('CreateSchoolModal — create mode', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders when open', () => {
    render(<CreateSchoolModal {...defaultProps} />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('does not render when closed', () => {
    render(<CreateSchoolModal {...defaultProps} isModalOpen={false} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows "Create School" heading', () => {
    render(<CreateSchoolModal {...defaultProps} />);
    expect(screen.getByRole('heading')).toHaveTextContent(/create school/i);
  });

  it('shows the school name input', () => {
    render(<CreateSchoolModal {...defaultProps} />);
    expect(screen.getByPlaceholderText(/enter school name/i)).toBeInTheDocument();
  });

  it('shows an "Add School" submit button', () => {
    render(<CreateSchoolModal {...defaultProps} />);
    expect(screen.getByRole('button', { name: /add school/i })).toBeInTheDocument();
  });

  it('shows a Back/Cancel button', () => {
    render(<CreateSchoolModal {...defaultProps} />);
    expect(screen.getByRole('button', { name: /back/i })).toBeInTheDocument();
  });

  it('calls setIsModalOpen(false) when Back is clicked', () => {
    render(<CreateSchoolModal {...defaultProps} />);
    fireEvent.click(screen.getByRole('button', { name: /back/i }));
    expect(defaultProps.setIsModalOpen).toHaveBeenCalledWith(false);
  });

  it('shows field validation error for school_name', () => {
    const formik = { ...mockFormik, errors: { school_name: 'School Name is required' }, touched: { school_name: true } };
    render(<CreateSchoolModal {...defaultProps} formik={formik as never} />);
    expect(screen.getByRole('alert')).toHaveTextContent('School Name is required');
  });
});

describe('CreateSchoolModal — edit mode', () => {
  it('shows "Edit School" heading', () => {
    render(<CreateSchoolModal {...defaultProps} modalMode="edit" />);
    expect(screen.getByRole('heading')).toHaveTextContent(/edit school/i);
  });

  it('shows "Update School" button in edit mode', () => {
    render(<CreateSchoolModal {...defaultProps} modalMode="edit" />);
    expect(screen.getByRole('button', { name: /update school/i })).toBeInTheDocument();
  });
});

describe('CreateSchoolModal — delete mode', () => {
  const deleteProps = {
    ...defaultProps,
    modalMode: 'delete' as const,
    selectedSchool: { id: 's1', school_name: 'Oakwood High', status: 'ACTIVE' } as never,
  };

  it('shows "Delete School" heading', () => {
    render(<CreateSchoolModal {...deleteProps} />);
    expect(screen.getByRole('heading')).toHaveTextContent(/delete school/i);
  });

  it('displays the school name in the confirmation', () => {
    render(<CreateSchoolModal {...deleteProps} />);
    expect(screen.getByText('Oakwood High')).toBeInTheDocument();
  });

  it('shows cannot-be-undone messaging', () => {
    render(<CreateSchoolModal {...deleteProps} />);
    expect(screen.getByText(/cannot be undone/i)).toBeInTheDocument();
  });

  it('calls confirmDelete when Delete School button is clicked', () => {
    render(<CreateSchoolModal {...deleteProps} />);
    fireEvent.click(screen.getByRole('button', { name: /delete school/i }));
    expect(deleteProps.confirmDelete).toHaveBeenCalled();
  });

  it('calls setIsModalOpen(false) when Back is clicked', () => {
    render(<CreateSchoolModal {...deleteProps} />);
    fireEvent.click(screen.getByRole('button', { name: /back/i }));
    expect(deleteProps.setIsModalOpen).toHaveBeenCalledWith(false);
  });

  it('disables the Delete button while deleting', () => {
    render(<CreateSchoolModal {...deleteProps} isDeleting={true} />);
    expect(screen.getByRole('button', { name: /saving/i })).toBeDisabled();
  });
});
