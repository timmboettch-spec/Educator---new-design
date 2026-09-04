import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi, type Mock } from 'vitest';
import StudentEmailReportModal from '../../../src/components/class/student/StudentEmailReportModal';
import { toast } from '../../../src/components/common/Toast';

import {
  clearEmailReportState,
  sendEmailReportRequest,
  selectEmailReportError,
  selectEmailReportLoading,
  selectEmailReportSuccess,
} from '../../../src/redux/class/StudentEmailReportRedux';
import { useAppSelector } from '../../../src/store/hooks';

const mockDispatch = vi.fn();
const mockOnClose = vi.fn();

vi.mock('../../../src/store/hooks', () => ({
  useAppDispatch: () => mockDispatch,
  useAppSelector: vi.fn(),
}));

vi.mock('../../../src/components/common/Toast', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../../../src/redux/class/StudentEmailReportRedux', () => ({
  selectEmailReportLoading: vi.fn(),
  selectEmailReportSuccess: vi.fn(),
  selectEmailReportError: vi.fn(),
  sendEmailReportRequest: vi.fn((payload) => ({
    type: 'sendEmailReportRequest',
    payload,
  })),
  clearEmailReportState: vi.fn(() => ({
    type: 'clearEmailReportState',
  })),
}));

describe('StudentEmailReportModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    (useAppSelector as unknown as Mock).mockImplementation((selector) =>
      selector({
        StudentEmailReport: {
          message: 'Report sent successfully',
        },
      }),
    );

    (selectEmailReportLoading as unknown as Mock).mockReturnValue(false);
    (selectEmailReportSuccess as unknown as Mock).mockReturnValue(false);
    (selectEmailReportError as unknown as Mock).mockReturnValue(null);
  });

  const renderComponent = (
    overrides?: Partial<Parameters<typeof StudentEmailReportModal>[0]['student']>,
    includePdfGenerator?: boolean,
  ) =>
    render(
      <StudentEmailReportModal
        student={{
          student_id: '1',
          student_name: 'John',
          email: 'test@test.com',
          class_id: 'class-1',
          ...overrides,
        }}
        onClose={mockOnClose}
        pdfGeneratorFn={includePdfGenerator ? () => 'mock-pdf-base64' : undefined}
      />,
    );

  test('renders modal correctly', () => {
    renderComponent();

    expect(screen.getByText('Email Report')).toBeInTheDocument();
    expect(screen.getByDisplayValue('test@test.com')).toBeInTheDocument();
  });

  test('dispatches sendEmailReport with correct payload', () => {
    renderComponent();

    fireEvent.change(screen.getByPlaceholderText(/Add a message/i), {
      target: { value: 'Test message' },
    });
    fireEvent.click(screen.getByText(/Send Mail/i));

    expect(mockDispatch).toHaveBeenCalled();

    expect(sendEmailReportRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: 'Student Progress Report',
        message: 'Test message',
        sendPdf: false,
        class_id: 'class-1',
        student_id: '1',
        email: 'test@test.com',
        student_name: 'John',
      }),
    );
  });

  test('includes PDF flag when include PDF is checked', () => {
    renderComponent({}, true);

    fireEvent.change(screen.getByPlaceholderText(/Add a message/i), {
      target: { value: 'Test message' },
    });
    fireEvent.click(screen.getByLabelText(/Include PDF Report/i));
    fireEvent.click(screen.getByText(/Send Mail/i));

    expect(sendEmailReportRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        sendPdf: true,
      }),
    );
  });

  test('shows last sent timestamp when provided', () => {
    renderComponent({ last_sent_date: '2026-05-07 10:30 AM' });

    expect(screen.getByText(/Last Sent 2026-05-07 10:30 AM/i)).toBeInTheDocument();
  });

  test('shows loading state', () => {
    (selectEmailReportLoading as unknown as Mock).mockReturnValue(true);

    renderComponent();

    expect(screen.getByText(/Sending.../i)).toBeInTheDocument();
  });

  test('shows error toast when error exists', async () => {
    (selectEmailReportError as unknown as Mock).mockReturnValue('Error occurred');

    renderComponent();

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Error occurred');
    });
  });

  test('shows success toast and closes modal', async () => {
    (selectEmailReportSuccess as unknown as Mock).mockReturnValue(true);

    renderComponent();

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('Report sent successfully');

      expect(mockDispatch).toHaveBeenCalledWith(clearEmailReportState());
      expect(mockOnClose).toHaveBeenCalled();
    });
  });

  test('shows redux success message in success toast', async () => {
    (selectEmailReportSuccess as unknown as Mock).mockReturnValue(true);

    renderComponent({ email: null });

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('Report sent successfully');
    });
  });
});
