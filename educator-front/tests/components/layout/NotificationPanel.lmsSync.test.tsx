import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import NotificationPanel from '../../../src/components/layout/NotificationPanel';
import type { AppNotification } from '../../../src/redux/notifications/NotificationsRedux';

const mockNavigate = vi.fn();
const mockDispatch = vi.fn();
let notifications: AppNotification[] = [];

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock('../../../src/store/hooks', () => ({
  useAppDispatch: () => mockDispatch,
  useAppSelector: (selector: (state: unknown) => unknown) =>
    selector({
      Notifications: {
        notifications,
        unreadCount: notifications.filter((n) => !n.isRead).length,
      },
    }),
}));

vi.mock('../../../src/hooks/useSwitchRole', () => ({
  useSwitchRole: () => ({ targetRole: null, switchRole: vi.fn() }),
}));

const gradeSyncFailure = (
  overrides: Partial<AppNotification> = {}
): AppNotification => ({
  id: 'notif-1',
  type: 'LMS_GRADE_SYNC_FAILED',
  title: 'LMS Grade Sync Failed',
  message: 'Grade sync failed for Ada Lovelace — Nursing 101.',
  recipientId: 'edu-1',
  recipientType: 'educator',
  isRead: false,
  metadata: {
    classId: 'class-1',
    className: 'Nursing 101',
    studentName: 'Ada Lovelace',
    simulationId: 'sim-1',
    failureCount: 1,
  },
  createdAt: new Date().toISOString(),
  ...overrides,
});

const openPanel = async () => {
  const user = userEvent.setup();
  render(
    <MemoryRouter>
      <NotificationPanel />
    </MemoryRouter>
  );
  await user.click(screen.getAllByRole('button')[0] as HTMLElement);
  return user;
};

describe('NotificationPanel LMS grade sync failure', () => {
  beforeEach(() => {
    mockNavigate.mockClear();
    mockDispatch.mockClear();
    localStorage.clear();
    notifications = [gradeSyncFailure()];
  });

  it('opens the class Reports sub-table when the notification is clicked', async () => {
    const user = await openPanel();

    await user.click(screen.getByText('LMS Grade Sync Failed'));

    expect(mockNavigate).toHaveBeenCalledWith('/classes', {
      state: {
        classId: 'class-1',
        expandType: 'reports',
        simulationId: 'sim-1',
      },
    });
  });

  it('names the student for a single failure', async () => {
    await openPanel();

    expect(
      screen.getByText('Grade sync failed for Ada Lovelace — Nursing 101.')
    ).toBeInTheDocument();
  });

  it('counts the failures once a class has more than one', async () => {
    notifications = [
      gradeSyncFailure({
        metadata: {
          classId: 'class-1',
          className: 'Nursing 101',
          studentName: 'Ada Lovelace',
          failureCount: 3,
        },
      }),
    ];

    await openPanel();

    expect(
      screen.getByText('3 grade sync failures in Nursing 101.')
    ).toBeInTheDocument();
  });

  it('uses the Spanish copy when the app language is Spanish', async () => {
    localStorage.setItem('app_language', 'es');

    await openPanel();

    expect(
      screen.getByText('Error de sincronización de calificaciones')
    ).toBeInTheDocument();
  });
});
