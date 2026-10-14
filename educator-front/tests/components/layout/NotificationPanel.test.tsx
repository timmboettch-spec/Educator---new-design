import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, describe, test, expect, beforeEach } from 'vitest';
import NotificationPanel from '../../../src/components/layout/NotificationPanel';
import loginEn from '../../../src/locales/auth/login/en.json';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

const mockSwitchRole = vi.fn();
const mockUseSwitchRole = vi.fn();
vi.mock('../../../src/hooks/useSwitchRole', () => ({
  useSwitchRole: () => mockUseSwitchRole(),
}));

const reportNotification = {
  id: 'n1',
  type: 'STUDENT_REPORT_AVAILABLE',
  title: 'New student report',
  message: 'A report is ready',
  recipientId: 'admin-1',
  recipientType: 'admin',
  isRead: true,
  metadata: { classId: 'class-1', educatorId: 'edu-1', studentId: 'stu-1' },
  createdAt: '2026-09-20T10:00:00.000Z',
};

const mockDispatch = vi.fn();
vi.mock('../../../src/store/hooks', () => ({
  useAppDispatch: () => mockDispatch,
  useAppSelector: (selector: (state: unknown) => unknown) =>
    selector({
      Notifications: {
        notifications: [reportNotification],
        unreadCount: 0,
        status: 'succeeded',
        error: null,
      },
    }),
}));

const openReportNotification = () => {
  render(<NotificationPanel />);
  fireEvent.click(screen.getByRole('button', { name: 'Notifications' }));
  fireEvent.click(screen.getByText(loginEn.notifications.typeStudentReport));
};

describe('NotificationPanel – admin student report', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
  });

  test('a multi-role admin switches to educator and queues the report view', async () => {
    mockSwitchRole.mockResolvedValue(true);
    mockUseSwitchRole.mockReturnValue({
      targetRole: 'educator',
      isSwitching: false,
      switchRole: mockSwitchRole,
    });

    openReportNotification();

    await waitFor(() => expect(mockSwitchRole).toHaveBeenCalled());
    expect(
      JSON.parse(sessionStorage.getItem('rwai_post_switch_nav') ?? '{}')
    ).toEqual({
      to: '/classes',
      state: {
        classId: 'class-1',
        expandType: 'reports',
        pinStudentId: 'stu-1',
      },
    });
    expect(mockNavigate).not.toHaveBeenCalledWith(
      '/educators',
      expect.anything()
    );
  });

  test('a failed switch falls back to the educators list', async () => {
    mockSwitchRole.mockResolvedValue(false);
    mockUseSwitchRole.mockReturnValue({
      targetRole: 'educator',
      isSwitching: false,
      switchRole: mockSwitchRole,
    });

    openReportNotification();

    await waitFor(() =>
      expect(mockNavigate).toHaveBeenCalledWith('/educators', {
        state: { educatorId: 'edu-1' },
      })
    );
    expect(sessionStorage.getItem('rwai_post_switch_nav')).toBeNull();
  });

  test('an admin with no educator role goes to the educators list', () => {
    mockUseSwitchRole.mockReturnValue({
      targetRole: null,
      isSwitching: false,
      switchRole: mockSwitchRole,
    });

    openReportNotification();

    expect(mockSwitchRole).not.toHaveBeenCalled();
    expect(mockNavigate).toHaveBeenCalledWith('/educators', {
      state: { educatorId: 'edu-1' },
    });
  });
});
