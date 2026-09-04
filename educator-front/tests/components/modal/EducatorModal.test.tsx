import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import EducatorModal from '../../../src/components/modal/EducatorModal';

vi.mock('../../../src/components/ui/Modal', () => ({
  default: ({ isOpen, children, title }: { isOpen: boolean; children: React.ReactNode; title?: string }) =>
    isOpen ? <div role="dialog">{title && <h2>{title}</h2>}{children}</div> : null,
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

vi.mock('../../../src/components/ui/Input', () => ({
  default: ({
    name, value, onChange, onBlur, placeholder, type, disabled,
  }: {
    name?: string; value?: string; onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
    onBlur?: (e: React.FocusEvent<HTMLInputElement>) => void; placeholder?: string;
    type?: string; disabled?: boolean;
  }) => (
    <input name={name} value={value} onChange={onChange} onBlur={onBlur}
      placeholder={placeholder} type={type ?? 'text'} disabled={disabled} />
  ),
}));

vi.mock('../../../src/components/ui/Button', () => ({
  Button: ({ children, loading, type }: { children: React.ReactNode; loading?: boolean; type?: string }) => (
    <button type={(type as 'submit' | 'button') ?? 'button'} disabled={loading}>
      {loading ? 'Saving…' : children}
    </button>
  ),
}));

const mockFormik = {
  values: { full_name: '', email: '', phone_number: '', status: 'ACTIVE', tokens: 0, school_id: '' },
  errors: {},
  touched: {},
  handleChange: vi.fn(),
  handleBlur: vi.fn(),
  handleSubmit: vi.fn(),
  setFieldValue: vi.fn(),
} as never;

const defaultProps = {
  isOpen: true,
  setOpen: vi.fn(),
  modalMode: 'create' as const,
  schools: [{ id: 's1', school_name: 'Sunrise Academy' }],
  openSchoolDropdown: false,
  setOpenSchoolDropdown: vi.fn(),
  isSubmitting: false,
  formik: mockFormik,
};

describe('EducatorModal', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders when open', () => {
    render(<EducatorModal {...defaultProps} />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('does not render when closed', () => {
    render(<EducatorModal {...defaultProps} isOpen={false} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows "Create Educator" title in create mode', () => {
    render(<EducatorModal {...defaultProps} />);
    expect(screen.getByRole('heading')).toHaveTextContent(/create educator/i);
  });

  it('shows "Edit Educator" title in edit mode', () => {
    render(<EducatorModal {...defaultProps} modalMode="edit" />);
    expect(screen.getByRole('heading')).toHaveTextContent(/edit educator/i);
  });

  it('renders the full name input', () => {
    render(<EducatorModal {...defaultProps} />);
    expect(screen.getByPlaceholderText(/enter educator name/i)).toBeInTheDocument();
  });

  it('renders the email input', () => {
    render(<EducatorModal {...defaultProps} />);
    expect(screen.getByPlaceholderText(/enter educator email/i)).toBeInTheDocument();
  });

  it('renders "Select school" button', () => {
    render(<EducatorModal {...defaultProps} />);
    expect(screen.getByText(/select school/i)).toBeInTheDocument();
  });

  it('shows school list when dropdown is open', () => {
    render(<EducatorModal {...defaultProps} openSchoolDropdown={true} />);
    expect(screen.getByText('Sunrise Academy')).toBeInTheDocument();
  });

  it('shows the Create Educator submit button', () => {
    render(<EducatorModal {...defaultProps} />);
    expect(screen.getByRole('button', { name: /create educator/i })).toBeInTheDocument();
  });

  it('shows the Update Educator submit button in edit mode', () => {
    render(<EducatorModal {...defaultProps} modalMode="edit" />);
    expect(screen.getByRole('button', { name: /update educator/i })).toBeInTheDocument();
  });

  it('disables submit button while submitting', () => {
    render(<EducatorModal {...defaultProps} isSubmitting={true} />);
    expect(screen.getByRole('button', { name: /saving/i })).toBeDisabled();
  });

  it('shows field-level validation error for full_name', () => {
    const formik = { ...mockFormik, errors: { full_name: 'Name is required' }, touched: { full_name: true } };
    render(<EducatorModal {...defaultProps} formik={formik as never} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Name is required');
  });

  it('does not show submit button in view mode', () => {
    render(<EducatorModal {...defaultProps} modalMode="view" />);
    expect(screen.queryByRole('button', { name: /create educator|update educator/i })).not.toBeInTheDocument();
  });
});
