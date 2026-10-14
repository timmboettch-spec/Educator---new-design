import React from 'react';
import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom';
// Initializes the real i18next singleton (side effect on import) so
// useTranslation() inside ClassFormModal resolves real strings even
// without wrapping in an I18nextProvider.
import '../../../src/i18n';
import ClassFormModal from '../../../src/components/class/Classformmodal';
import type { Class, ModalMode } from '../../../src/types/Class_types';

// The component reads the educator's schools from getParsedUser() and auto-
// selects the school_id when there is exactly one. Without this mock the
// required `school_id` field stays empty, Yup validation blocks submission,
// and Formik silently never invokes onSubmit.
vi.mock('../../../src/utils/storage', async () => {
  const actual = await vi.importActual<
    typeof import('../../../src/utils/storage')
  >('../../../src/utils/storage');
  return {
    ...actual,
    getParsedUser: () => ({
      id: 'edu-1',
      schools: [{ id: 'school-1', school_name: 'Test School' }],
    }),
  };
});

vi.mock('../../../src/components/ui/Modal', () => ({
  default: ({
    isOpen,
    children,
    title,
    footer,
  }: {
    isOpen: boolean;
    children: React.ReactNode;
    title: string;
    footer?: React.ReactNode;
  }) =>
    isOpen ? (
      <div data-testid="modal">
        <h1 data-testid="modal-title">{title}</h1>
        {children}
        {footer}
      </div>
    ) : null,
}));

vi.mock('../../../src/components/ui/Button', () => ({
  Button: ({
    children,
    onClick,
    disabled,
    type,
    className,
    form,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
    type?: 'button' | 'submit' | 'reset';
    className?: string;
    form?: string;
  }) => (
    <button
      onClick={onClick}
      disabled={disabled}
      type={type ?? 'button'}
      className={className}
      form={form}
    >
      {children}
    </button>
  ),
}));

vi.mock('../../../src/components/ui/FormField', () => ({
  default: ({
    label,
    children,
    error,
    required,
  }: {
    label: string;
    children: React.ReactNode;
    error: string | null;
    required: boolean;
  }) => (
    <div>
      <label>
        {label}
        {required && <span>*</span>}
      </label>
      {children}
      {error && (
        <span
          data-testid={`error-${label?.toLowerCase().replace(/\s+/g, '-')}`}
        >
          {error}
        </span>
      )}
    </div>
  ),
}));

vi.mock('../../../src/components/ui/Input', () => ({
  default: ({
    label,
    value,
    onChange,
    placeholder,
    readOnly,
    ...props
  }: {
    label?: string;
    value?: string;
    onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
    placeholder?: string;
    readOnly?: boolean;
    [key: string]: unknown;
  }) => {
    const domProps = { ...(props as Record<string, unknown>) };
    delete domProps.inputClassName;
    const name = props['name'] as string | undefined;
    const testId =
      (props['data-testid'] as string | undefined) ??
      (name ? `input-${name}` : `input-${label}`);
    return (
      <div>
        {label && <label htmlFor={testId}>{label}</label>}
        <input
          id={testId}
          data-testid={testId}
          value={value ?? ''}
          onChange={onChange}
          placeholder={placeholder}
          readOnly={readOnly}
          {...domProps}
        />
      </div>
    );
  },
}));

vi.mock('../../../src/components/ui/Select', () => ({
  default: ({
    label,
    value,
    onChange,
    options,
    error,
  }: {
    label: string;
    value: string;
    onChange: (value: string) => void;
    options: { value: string; label: string }[];
    error: string | null;
  }) => (
    <div>
      <label>{label}</label>
      <select
        data-testid={`select-${label?.toLowerCase().replace(/\s+/g, '-')}`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options?.map((o: { value: string; label: string }) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {error && (
        <span
          data-testid={`select-error-${label?.toLowerCase().replace(/\s+/g, '-')}`}
        >
          {error}
        </span>
      )}
    </div>
  ),
}));

// â”€â”€â”€ Shared test data â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const _now = new Date();
const _pad = (n: number) => String(n).padStart(2, '0');
const _localDate = (d: Date) =>
  `${d.getFullYear()}-${_pad(d.getMonth() + 1)}-${_pad(d.getDate())}`;
const TODAY = _localDate(_now);
const TOMORROW = _localDate(
  new Date(_now.getFullYear(), _now.getMonth(), _now.getDate() + 1)
);
const NEXT_YEAR = (new Date().getFullYear() + 1).toString();

const mockClass: Class = {
  id: '1',
  class_name: 'Math 101',
  term: 'i',
  year: NEXT_YEAR,
  status: 'ACTIVE',
  start_date: `${TODAY}T00:00:00`,
  end_date: `${TOMORROW}T00:00:00`,
};

const defaultProps = {
  isOpen: true,
  onClose: vi.fn(),
  modalMode: 'create' as ModalMode,
  selectedClass: null,
  isDeleting: false,
  userTokens: 50,
  onConfirmDelete: vi.fn(),
  onSubmit: vi.fn().mockResolvedValue(undefined),
};

const renderModal = (overrides: Record<string, unknown> = {}) =>
  render(<ClassFormModal {...defaultProps} {...overrides} />);

// â”€â”€â”€ Tests â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

describe('ClassFormModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // â”€â”€ Visibility â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  describe('Visibility', () => {
    it('renders nothing when isOpen is false', () => {
      renderModal({ isOpen: false });
      expect(screen.queryByTestId('modal')).not.toBeInTheDocument();
    });

    it('renders modal when isOpen is true', () => {
      renderModal();
      expect(screen.getByTestId('modal')).toBeInTheDocument();
    });
  });

  describe('Create mode', () => {
    it('renders title, form fields and submit button correctly', () => {
      renderModal();
      expect(screen.getByTestId('modal-title')).toHaveTextContent(
        'Create Class'
      );
      expect(screen.getByTestId('input-class_name')).toBeInTheDocument();
      expect(screen.getByTestId('select-status')).toBeInTheDocument();
      expect(screen.getByTestId('input-total_no_of_students')).toHaveAttribute(
        'placeholder',
        'Number of Students (Create Codes Only)'
      );
      expect(
        screen.getByRole('button', { name: 'Create Class' })
      ).toBeInTheDocument();
    });

    it('does not show inline token warning when count exceeds userTokens (toast-only)', async () => {
      renderModal({ userTokens: 10 });
      fireEvent.change(screen.getByTestId('input-total_no_of_students'), {
        target: { value: '15' },
      });
      await waitFor(() =>
        expect(
          screen.queryByText(/You can only add up to 10 student/)
        ).not.toBeInTheDocument()
      );
    });

    it('shows no error when count is within limit', async () => {
      renderModal({ userTokens: 50 });
      fireEvent.change(screen.getByTestId('input-total_no_of_students'), {
        target: { value: '20' },
      });
      await waitFor(() =>
        expect(
          screen.queryByText(/Insufficient tokens/)
        ).not.toBeInTheDocument()
      );
    });

    it('shows no error when count is 1 below limit', async () => {
      renderModal({ userTokens: 2 });
      fireEvent.change(screen.getByTestId('input-total_no_of_students'), {
        target: { value: '1' },
      });
      await waitFor(() =>
        expect(
          screen.queryByText(/Insufficient tokens/)
        ).not.toBeInTheDocument()
      );
    });

    it('prevents non-numeric keydown (e, E, +, -, .) in student count', async () => {
      renderModal();
      const input = screen.getByTestId('input-total_no_of_students');
      for (const key of ['e', 'E', '+', '-', '.']) {
        await act(async () => {
          fireEvent.keyDown(input, { key });
        });
        expect(input).toHaveValue('');
      }
      await act(async () => {
        fireEvent.change(input, { target: { value: '5' } });
      });
      expect(input).toHaveValue('5');
      await act(async () => {
        fireEvent.keyDown(input, { key: 'e' });
      });
      expect(input).toHaveValue('5');
    });

    it('shows "Create Class" submit button', () => {
      // covered in 'renders title, form fields...' above
      renderModal();
      expect(
        screen.getByRole('button', { name: 'Create Class' })
      ).toBeInTheDocument();
    });

    it('defaults Status to Active and keeps it Active when Start Date is today', async () => {
      renderModal();
      const statusSelect = screen.getByTestId(
        'select-status'
      ) as HTMLSelectElement;
      expect(statusSelect.value).toBe('ACTIVE');

      const [startInput] = Array.from(
        document.querySelectorAll<HTMLInputElement>('input[type="date"]')
      );
      fireEvent.change(startInput, { target: { value: TODAY } });

      await waitFor(() => {
        expect(
          (screen.getByTestId('select-status') as HTMLSelectElement).value
        ).toBe('ACTIVE');
      });
    });

    it('auto-sets Status to Inactive when Start Date is a future date', async () => {
      renderModal();
      expect(
        (screen.getByTestId('select-status') as HTMLSelectElement).value
      ).toBe('ACTIVE');

      const [startInput] = Array.from(
        document.querySelectorAll<HTMLInputElement>('input[type="date"]')
      );
      fireEvent.change(startInput, { target: { value: TOMORROW } });

      await waitFor(() => {
        expect(
          (screen.getByTestId('select-status') as HTMLSelectElement).value
        ).toBe('INACTIVE');
      });
    });

    it('calls onSubmit on valid form submission', async () => {
      renderModal();
      fireEvent.change(screen.getByTestId('input-class_name'), {
        target: { value: 'Bio 202' },
      });

      const [startInput, endInput] = Array.from(
        document.querySelectorAll<HTMLInputElement>('input[type="date"]')
      );
      if (startInput)
        fireEvent.change(startInput, { target: { value: TODAY } });
      if (endInput) fireEvent.change(endInput, { target: { value: TOMORROW } });

      fireEvent.change(screen.getByTestId('input-total_no_of_students'), {
        target: { value: '10' },
      });

      fireEvent.click(screen.getByRole('button', { name: 'Create Class' }));
      await waitFor(() =>
        expect(defaultProps.onSubmit).toHaveBeenCalledWith(
          expect.objectContaining({ total_no_of_students: '10' })
        )
      );
    });

    it('trims class name on submit while preserving valid special characters', async () => {
      const onSubmit = vi.fn().mockResolvedValue(undefined);
      renderModal({ onSubmit });

      fireEvent.change(screen.getByTestId('input-class_name'), {
        target: { value: '  Biology & Chemistry (A/B)  ' },
      });

      const [startInput, endInput] = Array.from(
        document.querySelectorAll<HTMLInputElement>('input[type="date"]')
      );
      if (startInput)
        fireEvent.change(startInput, { target: { value: TODAY } });
      if (endInput) fireEvent.change(endInput, { target: { value: TOMORROW } });

      fireEvent.click(screen.getByRole('button', { name: 'Create Class' }));

      await waitFor(() => {
        expect(onSubmit).toHaveBeenCalledWith(
          expect.objectContaining({
            class_name: 'Biology & Chemistry (A/B)',
          })
        );
      });
    });

    it('rejects class names that include HTML/script content', async () => {
      const onSubmit = vi.fn().mockResolvedValue(undefined);
      renderModal({ onSubmit });

      fireEvent.change(screen.getByTestId('input-class_name'), {
        target: { value: '<script>alert(1)</script>' },
      });

      const [startInput, endInput] = Array.from(
        document.querySelectorAll<HTMLInputElement>('input[type="date"]')
      );
      if (startInput)
        fireEvent.change(startInput, { target: { value: TODAY } });
      if (endInput) fireEvent.change(endInput, { target: { value: TOMORROW } });

      fireEvent.click(screen.getByRole('button', { name: 'Create Class' }));

      await waitFor(() => {
        expect(onSubmit).not.toHaveBeenCalled();
      });
    });

    it('rejects class names that look like SQL queries', async () => {
      const onSubmit = vi.fn().mockResolvedValue(undefined);
      renderModal({ onSubmit });

      fireEvent.change(screen.getByTestId('input-class_name'), {
        target: { value: 'select*from Classes' },
      });

      const [startInput, endInput] = Array.from(
        document.querySelectorAll<HTMLInputElement>('input[type="date"]')
      );
      if (startInput)
        fireEvent.change(startInput, { target: { value: TODAY } });
      if (endInput) fireEvent.change(endInput, { target: { value: TOMORROW } });

      fireEvent.click(screen.getByRole('button', { name: 'Create Class' }));

      await waitFor(() => {
        expect(onSubmit).not.toHaveBeenCalled();
      });
    });

    it('rejects class names containing blocked coding keywords', async () => {
      const onSubmit = vi.fn().mockResolvedValue(undefined);
      renderModal({ onSubmit });

      fireEvent.change(screen.getByTestId('input-class_name'), {
        target: { value: 'function test cohort' },
      });

      const [startInput, endInput] = Array.from(
        document.querySelectorAll<HTMLInputElement>('input[type="date"]')
      );
      if (startInput)
        fireEvent.change(startInput, { target: { value: TODAY } });
      if (endInput) fireEvent.change(endInput, { target: { value: TOMORROW } });

      fireEvent.click(screen.getByRole('button', { name: 'Create Class' }));

      await waitFor(() => {
        expect(onSubmit).not.toHaveBeenCalled();
      });
    });

    it("rejects Python-style code-like snippets like print('Helloo, world!')", async () => {
      const onSubmit = vi.fn().mockResolvedValue(undefined);
      renderModal({ onSubmit });

      fireEvent.change(screen.getByTestId('input-class_name'), {
        target: { value: "print('Helloo, world!')" },
      });

      const [startInput, endInput] = Array.from(
        document.querySelectorAll<HTMLInputElement>('input[type="date"]')
      );
      if (startInput)
        fireEvent.change(startInput, { target: { value: TODAY } });
      if (endInput) fireEvent.change(endInput, { target: { value: TOMORROW } });

      fireEvent.click(screen.getByRole('button', { name: 'Create Class' }));

      await waitFor(() => {
        expect(onSubmit).not.toHaveBeenCalled();
      });
    });

    it('does NOT call onSubmit when class_name is empty', async () => {
      renderModal();
      fireEvent.click(screen.getByRole('button', { name: 'Create Class' }));
      await waitFor(() => expect(defaultProps.onSubmit).not.toHaveBeenCalled());
    });
  });

  describe('Edit mode', () => {
    it('renders title, pre-filled fields, update button, and no student count input', () => {
      renderModal({ modalMode: 'edit', selectedClass: mockClass });
      expect(screen.getByTestId('modal-title')).toHaveTextContent('Edit Class');
      expect(screen.getByTestId('input-class_name')).toHaveValue('Math 101');
      expect(
        screen.getByRole('button', { name: 'Update Class' })
      ).toBeInTheDocument();
      expect(
        screen.queryByTestId('input-total_no_of_students')
      ).not.toBeInTheDocument();
    });
  });

  describe('Delete mode', () => {
    it('renders delete confirmation UI with correct text and functional buttons', () => {
      renderModal({ modalMode: 'delete' });
      expect(screen.getByText('Delete Class')).toBeInTheDocument();
      expect(
        screen.getByText(/Are you sure you want to delete/)
      ).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
      expect(defaultProps.onConfirmDelete).toHaveBeenCalledTimes(1);
    });

    it('disables Delete button while isDeleting is true', () => {
      renderModal({ modalMode: 'delete', isDeleting: true });
      expect(
        screen.getByRole('button', { name: 'Deleting...' })
      ).toBeDisabled();
    });

    it('calls onClose when Back button is clicked in delete mode', () => {
      renderModal({ modalMode: 'delete' });
      fireEvent.click(screen.getByRole('button', { name: 'Back' }));
      expect(defaultProps.onClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('Assign mode', () => {
    it('renders read-only class fields', () => {
      renderModal({ modalMode: 'assign', selectedClass: mockClass });
      expect(screen.getByTestId('input-class_name')).toHaveAttribute(
        'readonly'
      );
    });

    it('renders editable assign_count input', () => {
      renderModal({ modalMode: 'assign', selectedClass: mockClass });
      expect(screen.getByTestId('input-assign_count')).toBeInTheDocument();
    });

    it('calls onClose from Back button in assign mode', () => {
      renderModal({ modalMode: 'assign', selectedClass: mockClass });
      fireEvent.click(screen.getByRole('button', { name: 'Back' }));
      expect(defaultProps.onClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('Form reset', () => {
    it('calls onClose when Back button is clicked in create mode', () => {
      renderModal();
      fireEvent.click(screen.getByRole('button', { name: 'Back' }));
      expect(defaultProps.onClose).toHaveBeenCalled();
    });

    it('clears the student count when the modal reopens', async () => {
      const { rerender } = renderModal();
      fireEvent.change(screen.getByTestId('input-total_no_of_students'), {
        target: { value: '12' },
      });
      expect(screen.getByTestId('input-total_no_of_students')).toHaveValue(
        '12'
      );

      rerender(<ClassFormModal {...defaultProps} isOpen={false} />);
      rerender(<ClassFormModal {...defaultProps} isOpen={true} />);

      await waitFor(() =>
        expect(screen.getByTestId('input-total_no_of_students')).toHaveValue('')
      );
    });
  });
});
