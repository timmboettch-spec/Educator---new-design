import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { vi } from 'vitest';
import BulkEmailAccessCodeModal from '../../../src/components/class/ClassEmailAccesscode';
import { toast } from '../../../src/components/common/Toast';
import type { RootState } from '@/store';
import type { Student } from '@/types';

const mockDispatch = vi.fn();
const mockSelector = vi.fn();

vi.mock('../../../src/store/hooks', () => ({
  useAppDispatch: () => mockDispatch,
  useAppSelector: (selector: (state: RootState) => unknown) => mockSelector(selector),
}));

vi.mock('../../../src/components/common/Toast', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../../../src/redux/class/StudentEmailAccessRedux', () => ({
  sendEmailAccessCodeRequest: vi.fn((p) => ({ type: 'SEND', payload: p })),
  clearEmailAccessCodeState: vi.fn(() => ({ type: 'CLEAR' })),
  selectEmailAccessCodeLoading: () => false,
  selectEmailAccessCodeSuccess: () => false,
  selectEmailAccessCodeError: () => null,
}));

const mockStudentsAllEmails: Student[] = [
  { id: '1', student_id: 'S001', student_name: 'Alice', email: 'alice@test.com', score: null },
  { id: '2', student_id: 'S002', student_name: 'Bob', email: 'bob@test.com', score: null },
];

const mockStudentsMissingEmails: Student[] = [
  { id: '1', student_id: 'S001', student_name: 'Alice', email: 'alice@test.com', score: null },
  { id: '2', student_id: 'S002', student_name: 'Bob', email: null, score: null },
  { id: '3', student_id: 'S003', student_name: 'Carol', email: '', score: null },
];

describe('BulkEmailAccessCodeModal', () => {
  const onClose = vi.fn();

  beforeEach(() => {
    cleanup();
    mockDispatch.mockClear();
    mockSelector.mockReturnValue(false);
    onClose.mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders modal UI', () => {
    render(<BulkEmailAccessCodeModal class_id="1" onClose={onClose} />);
    expect(screen.getByText(/Email Student Code/i)).toBeInTheDocument();
    expect(screen.getByText(/Send Via Email/i)).toBeInTheDocument();
  });

  it('updates subject and message', () => {
    render(<BulkEmailAccessCodeModal class_id="1" onClose={onClose} />);

    fireEvent.change(screen.getByPlaceholderText(/Student Code/i), {
      target: { value: 'New Subject' },
    });
    fireEvent.change(screen.getByPlaceholderText(/Add a message/i), {
      target: { value: 'Hello' },
    });

    expect(screen.getByDisplayValue('New Subject')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Hello')).toBeInTheDocument();
  });

  it('shows validation error when message is empty and does not dispatch', () => {
    render(
      <BulkEmailAccessCodeModal class_id="1" students={mockStudentsAllEmails} onClose={onClose} />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Send Via Email/i }));

    expect(screen.getByText('Message is required')).toBeInTheDocument();
    expect(mockDispatch).not.toHaveBeenCalled();
  });

  it('clears validation error when message is typed', () => {
    render(
      <BulkEmailAccessCodeModal class_id="1" students={mockStudentsAllEmails} onClose={onClose} />,
    );

    fireEvent.click(screen.getByText(/Send Via Email/i));
    expect(screen.getByText('Message is required')).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText(/Add a message/i), {
      target: { value: 'Hello' },
    });
    expect(screen.queryByText('Message is required')).not.toBeInTheDocument();
  });

  it('dispatches sendEmailAccessCode directly when all students have emails', async () => {
    mockDispatch.mockReturnValue({
      unwrap: () => Promise.resolve({ message: 'sent' }),
    });

    render(
      <BulkEmailAccessCodeModal class_id="1" students={mockStudentsAllEmails} onClose={onClose} />,
    );

    fireEvent.change(screen.getByPlaceholderText(/Add a message/i), {
      target: { value: 'Hello students' },
    });

    fireEvent.click(screen.getByRole('button', { name: /Send Via Email/i }));

    fireEvent.click(screen.getByRole('button', { name: /Send to 2 Students/i }));

    await waitFor(() => {
      expect(mockDispatch).toHaveBeenCalled();
    });

    expect(screen.queryByText(/do not have email/i)).not.toBeInTheDocument();
  });

  it('shows confirmation popup with correct count when students have missing emails', () => {
    render(
      <BulkEmailAccessCodeModal
        class_id="1"
        students={mockStudentsMissingEmails}
        onClose={onClose}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText(/Add a message/i), {
      target: { value: 'Hello' },
    });
    fireEvent.click(screen.getByText(/Send Via Email/i));

    expect(
      screen.getByText(/students do not have an email address\. Reports cannot be sent to them\./i),
    ).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('cancels send when No is clicked in confirmation popup', () => {
    render(
      <BulkEmailAccessCodeModal
        class_id="1"
        students={mockStudentsMissingEmails}
        onClose={onClose}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText(/Add a message/i), {
      target: { value: 'Hello' },
    });
    fireEvent.click(screen.getByText(/Send Via Email/i));
    expect(
      screen.getByText(/students do not have an email address\. Reports cannot be sent to them\./i),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Cancel/i }));

    expect(screen.queryByText(/Missing Email Addresses/i)).not.toBeInTheDocument();
    expect(mockDispatch).not.toHaveBeenCalled();
  });

  it('dispatches send when Yes is clicked in confirmation popup', async () => {
    mockDispatch.mockReturnValue({ unwrap: () => Promise.resolve({ message: 'sent' }) });

    render(
      <BulkEmailAccessCodeModal
        class_id="1"
        students={mockStudentsMissingEmails}
        onClose={onClose}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText(/Add a message/i), {
      target: { value: 'Hello' },
    });
    fireEvent.click(screen.getByText(/Send Via Email/i));
    fireEvent.click(screen.getByRole('button', { name: /Send to 1 Students/i }));

    await waitFor(() => expect(mockDispatch).toHaveBeenCalled());
  });

  it('shows singular message when exactly 1 student has missing email', () => {
    const oneStudentMissing: Student[] = [
      { id: '1', student_id: 'S001', student_name: 'Alice', email: 'alice@test.com', score: null },
      { id: '2', student_id: 'S002', student_name: 'Bob', email: null, score: null },
    ];

    render(
      <BulkEmailAccessCodeModal class_id="1" students={oneStudentMissing} onClose={onClose} />,
    );

    fireEvent.change(screen.getByPlaceholderText(/Add a message/i), {
      target: { value: 'Hello' },
    });
    fireEvent.click(screen.getByText(/Send Via Email/i));

    expect(screen.getByText(/1 students do not have an email address/i)).toBeInTheDocument();
    expect(screen.getAllByText('1').length).toBeGreaterThanOrEqual(1);
  });

  it('shows success toast when email is sent successfully', async () => {
    mockDispatch.mockReturnValue({ unwrap: () => Promise.resolve({ message: 'sent', count: 2 }) });

    render(
      <BulkEmailAccessCodeModal class_id="1" students={mockStudentsAllEmails} onClose={onClose} />,
    );

    fireEvent.change(screen.getByPlaceholderText(/Add a message/i), {
      target: { value: 'Hello students' },
    });
    fireEvent.click(screen.getByText(/Send Via Email/i));
    fireEvent.click(
      screen.getByRole('button', {
        name: /Send to 2 Students/i,
      }),
    );

    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith('Email sent successfully to 2 students.'),
    );
    expect(onClose).toHaveBeenCalled();
  });
});
