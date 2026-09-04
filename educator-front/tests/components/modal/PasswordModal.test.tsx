import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import PasswordModal from '../../../src/components/modal/PasswordModal';

vi.mock('../../../src/components/ui/Modal', () => ({
  default: ({ isOpen, children, title, footer }: { isOpen: boolean; children: React.ReactNode; title?: string; footer?: React.ReactNode }) =>
    isOpen ? <div role="dialog">{title && <h2>{title}</h2>}{children}{footer}</div> : null,
}));

vi.mock('../../../src/components/ui/Button', () => ({
  Button: ({
    children,
    onClick,
    loading,
    type,
    disabled,
    form,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    loading?: boolean;
    type?: string;
    disabled?: boolean;
    form?: string;
  }) => (
    <button type={(type as 'button' | 'submit') ?? 'button'} onClick={onClick} disabled={loading || disabled} form={form}>
      {loading ? 'Updating…' : children}
    </button>
  ),
}));

vi.mock('../../../src/components/ui/Input', () => ({
  default: ({
    name,
    value,
    onChange,
    placeholder,
    type,
  }: {
    name?: string;
    value?: string;
    onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
    placeholder?: string;
    type?: string;
  }) => (
    <input name={name} value={value} onChange={onChange} placeholder={placeholder} type={type ?? 'text'} />
  ),
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

vi.mock('../../../src/utils/inputSecurity', () => ({
  sanitizePasswordForTyping: (v: string) => v,
}));

const defaultProps = {
  showPasswordModal: true,
  oldPassword: '',
  setOldPassword: vi.fn(),
  newPassword: '',
  setNewPassword: vi.fn(),
  confirmPassword: '',
  setConfirmPassword: vi.fn(),
  errors: {},
  isChangingPassword: false,
  handleChangePassword: vi.fn(),
  closePasswordModal: vi.fn(),
};

describe('PasswordModal', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders when open', () => {
    render(<PasswordModal {...defaultProps} />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('does not render when closed', () => {
    render(<PasswordModal {...defaultProps} showPasswordModal={false} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows Old Password, New Password and Confirm Password fields', () => {
    render(<PasswordModal {...defaultProps} />);
    expect(screen.getByPlaceholderText(/old password/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/new password/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/confirm password/i)).toBeInTheDocument();
  });

  it('shows an Update Password button', () => {
    render(<PasswordModal {...defaultProps} />);
    expect(screen.getByRole('button', { name: /update password/i })).toBeInTheDocument();
  });

  it('shows a Cancel button', () => {
    render(<PasswordModal {...defaultProps} />);
    expect(screen.getByRole('button', { name: /cancel|back/i })).toBeInTheDocument();
  });

  it('calls closePasswordModal when Cancel is clicked', () => {
    render(<PasswordModal {...defaultProps} />);
    fireEvent.click(screen.getByRole('button', { name: /cancel|back/i }));
    expect(defaultProps.closePasswordModal).toHaveBeenCalled();
  });

  it('calls handleChangePassword when Update Password is clicked', () => {
    render(<PasswordModal {...defaultProps} />);
    fireEvent.click(screen.getByRole('button', { name: /update password/i }));
    expect(defaultProps.handleChangePassword).toHaveBeenCalled();
  });

  it('displays validation error for old password', () => {
    render(<PasswordModal {...defaultProps} errors={{ oldPassword: 'Old Password is required' }} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Old Password is required');
  });

  it('displays validation error for new password', () => {
    render(<PasswordModal {...defaultProps} errors={{ newPassword: 'New Password is required' }} />);
    expect(screen.getByRole('alert')).toHaveTextContent('New Password is required');
  });

  it('disables Update Password button while submitting', () => {
    render(<PasswordModal {...defaultProps} isChangingPassword={true} />);
    expect(screen.getByRole('button', { name: /updating/i })).toBeDisabled();
  });
});
