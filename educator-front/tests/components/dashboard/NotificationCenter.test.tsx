import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '@/i18n';
import type { AppNotification } from '@/redux/notifications/NotificationsRedux';
import { NotificationCenter } from '@/components/dashboard/NotificationCenter';

// Who's signed in, for the per-person collapsed state (none by default).
const mockCardUser = vi.hoisted(() => ({
  current: null as Record<string, unknown> | null,
}));
vi.mock('@/utils/storage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/utils/storage')>()),
  getParsedUser: () => mockCardUser.current,
}));

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router-dom')>()),
  useNavigate: () => mockNavigate,
}));

let mockState: {
  Notifications: {
    notifications: AppNotification[];
    status: 'idle' | 'loading' | 'succeeded' | 'failed';
  };
};
const mockDispatch = vi.fn((action: unknown) => ({
  action,
  unwrap: () => Promise.resolve(),
}));

vi.mock('@/store/hooks', () => ({
  useAppDispatch: () => mockDispatch,
  useAppSelector: (selector: (state: unknown) => unknown) =>
    selector(mockState),
}));

const thunks = vi.hoisted(
  () => ({}) as Record<string, ReturnType<typeof vi.fn>>
);

vi.mock('@/redux/notifications/NotificationsRedux', async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import('@/redux/notifications/NotificationsRedux')
    >();
  const make = (type: string) => {
    const fn = vi.fn((arg?: unknown) => ({
      type: `notifications/${type}`,
      arg,
    }));
    thunks[type] = fn;
    return fn;
  };
  return {
    ...actual,
    fetchNotifications: make('fetchAll'),
    markNotificationRead: make('markRead'),
    markNotificationUnread: make('markUnread'),
    markAllNotificationsRead: make('markAllRead'),
    deleteNotification: make('deleteOne'),
    clearAllNotifications: make('clearAll'),
  };
});

const HOUR = 3_600_000;
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();

const note = (overrides: Partial<AppNotification>): AppNotification => ({
  id: 'n',
  type: 'GENERAL',
  title: 'Title',
  message: 'Message',
  recipientId: 'r1',
  recipientType: 'educator',
  isRead: false,
  createdAt: ago(HOUR),
  ...overrides,
});

const NOTIFICATIONS: AppNotification[] = [
  note({
    id: 'report',
    type: 'STUDENT_REPORT_AVAILABLE',
    title: 'New report from Ana',
    message: 'Ana finished Sim A.',
    metadata: { classId: 'c1' },
    createdAt: ago(2 * HOUR),
  }),
  note({
    id: 'sim',
    type: 'SIMULATION_DUE_DATE_REMINDER',
    title: 'Sim due soon',
    isRead: true,
    createdAt: ago(5 * 24 * HOUR),
  }),
  note({
    id: 'seats',
    type: 'TOKENS_ALLOCATED',
    title: 'Seats allocated',
    createdAt: ago(40 * 24 * HOUR),
  }),
  note({
    id: 'other',
    type: 'EMAIL_REPORT',
    title: 'Weekly email',
    isRead: true,
    createdAt: ago(10 * 60_000),
  }),
];

const renderCenter = () =>
  render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter>
        <div id="my-products-usage" />
        <NotificationCenter />
      </MemoryRouter>
    </I18nextProvider>
  );

const expand = async () => {
  const user = userEvent.setup();
  renderCenter();
  await user.click(
    screen.getByRole('button', { name: /notification center/i })
  );
  return user;
};

const listTitles = () =>
  within(screen.getByRole('list'))
    .getAllByRole('listitem')
    .map((item) => within(item).getAllByRole('button')[0]?.textContent);

describe('NotificationCenter', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
    localStorage.clear();
    mockCardUser.current = null;
    mockState = {
      Notifications: { notifications: NOTIFICATIONS, status: 'succeeded' },
    };
    Element.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('is collapsed by default and shows the unread count', () => {
    renderCenter();
    const toggle = screen.getByRole('button', { name: /notification center/i });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveTextContent('2 unread');
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('stays expanded for the same person after a remount', async () => {
    mockCardUser.current = { id: 'educator-1' };
    const user = userEvent.setup();
    const { unmount } = renderCenter();
    await user.click(
      screen.getByRole('button', { name: /notification center/i })
    );
    unmount();

    renderCenter();
    expect(
      screen.getByRole('button', { name: /notification center/i })
    ).toHaveAttribute('aria-expanded', 'true');
  });

  it('counts each category and filters the list by chip', async () => {
    const user = await expand();
    const chips = screen.getByRole('group', { name: /filter notifications/i });

    expect(
      within(chips).getByRole('button', { name: 'All (4)' })
    ).toHaveAttribute('aria-pressed', 'true');
    expect(
      within(chips).getByRole('button', { name: 'Unread (2)' })
    ).toBeInTheDocument();
    expect(
      within(chips).getByRole('button', { name: 'Student reports (1)' })
    ).toBeInTheDocument();
    expect(
      within(chips).getByRole('button', { name: 'Products (0)' })
    ).toBeInTheDocument();
    expect(
      within(chips).getByRole('button', { name: 'General (1)' })
    ).toBeInTheDocument();

    await user.click(within(chips).getByRole('button', { name: 'Unread (2)' }));
    expect(listTitles()).toEqual([
      'Unread: New report from Ana',
      'Unread: Seats allocated',
    ]);

    await user.click(
      within(chips).getByRole('button', { name: 'General (1)' })
    );
    expect(listTitles()).toEqual(['Read: Weekly email']);
  });

  it('filters by date range and sorts oldest first', async () => {
    const user = await expand();

    await user.selectOptions(
      screen.getByRole('combobox', { name: /date range/i }),
      '1d'
    );
    expect(screen.getByText('Showing 2')).toBeInTheDocument();

    await user.selectOptions(
      screen.getByRole('combobox', { name: /date range/i }),
      'all'
    );
    await user.selectOptions(
      screen.getByRole('combobox', { name: /sort notifications/i }),
      'oldest'
    );
    expect(listTitles()[0]).toBe('Unread: Seats allocated');
  });

  it('marks all read, and clears all only after confirming', async () => {
    const user = await expand();

    await user.click(screen.getByRole('button', { name: 'Mark all read' }));
    expect(thunks.markAllRead).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: 'Clear all' }));
    expect(thunks.clearAll).not.toHaveBeenCalled();
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('This removes all 4 notifications.');

    await user.click(within(dialog).getByRole('button', { name: 'Clear all' }));
    expect(thunks.clearAll).toHaveBeenCalledTimes(1);
  });

  it('marks one read or unread and deletes one', async () => {
    const user = await expand();
    const rows = within(screen.getByRole('list')).getAllByRole('listitem');
    const reportRow = rows.find((row) =>
      row.textContent?.includes('New report from Ana')
    );
    if (!reportRow) throw new Error('report row missing');

    await user.click(
      within(reportRow).getByRole('button', { name: 'Mark read' })
    );
    expect(thunks.markRead).toHaveBeenCalledWith('report');

    await user.click(within(reportRow).getByRole('button', { name: 'Delete' }));
    expect(thunks.deleteOne).toHaveBeenCalledWith('report');
  });

  it('marks the selected notifications in bulk', async () => {
    const user = await expand();

    await user.click(
      screen.getByRole('checkbox', { name: 'Select Sim due soon' })
    );
    await user.click(
      screen.getByRole('checkbox', { name: 'Select Weekly email' })
    );
    expect(screen.getByText('2 selected')).toBeInTheDocument();

    const bar = screen.getByText('2 selected').parentElement;
    if (!bar) throw new Error('bulk bar missing');
    await user.click(within(bar).getByRole('button', { name: 'Mark unread' }));

    expect(thunks.markUnread).toHaveBeenCalledWith('sim');
    expect(thunks.markUnread).toHaveBeenCalledWith('other');
    expect(screen.queryByText('2 selected')).not.toBeInTheDocument();
  });

  it('shows the read status once the open notification is marked read', async () => {
    const user = userEvent.setup();
    const { rerender } = renderCenter();
    await user.click(
      screen.getByRole('button', { name: /notification center/i })
    );
    await user.click(
      screen.getByRole('button', { name: /new report from ana/i })
    );
    expect(screen.getByRole('dialog')).toHaveTextContent('Status: Unread');

    // The mark-read request succeeded and the store row updated.
    mockState.Notifications.notifications = NOTIFICATIONS.map((n) =>
      n.id === 'report' ? { ...n, isRead: true } : n
    );
    rerender(
      <I18nextProvider i18n={i18n}>
        <MemoryRouter>
          <div id="my-products-usage" />
          <NotificationCenter />
        </MemoryRouter>
      </I18nextProvider>
    );
    expect(screen.getByRole('dialog')).toHaveTextContent('Status: Read');
  });

  it('labels every known type in the active language', async () => {
    await i18n.changeLanguage('es');
    const user = userEvent.setup();
    renderCenter();
    await user.click(
      screen.getByRole('button', {
        name: new RegExp(i18n.t('dashboard:notificationCenter.title'), 'i'),
      })
    );

    await user.click(screen.getByRole('button', { name: /weekly email/i }));
    expect(screen.getByRole('dialog')).toHaveTextContent('Informe por correo');
    expect(screen.getByRole('dialog')).not.toHaveTextContent('Email report');
  });

  it('opens the details, marks it read and links to the class reports', async () => {
    const user = await expand();

    await user.click(
      screen.getByRole('button', { name: /new report from ana/i })
    );
    expect(thunks.markRead).toHaveBeenCalledWith('report');

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('Student report available');
    expect(dialog).toHaveTextContent('Ana finished Sim A.');

    await user.click(
      within(dialog).getByRole('button', { name: 'View reports' })
    );
    expect(mockNavigate).toHaveBeenCalledWith('/classes', {
      state: { classId: 'c1', expandType: 'reports' },
    });
  });

  it('scrolls to My Products & Usage from a seats notification', async () => {
    const user = await expand();

    await user.click(screen.getByRole('button', { name: /seats allocated$/i }));
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'View products & usage',
      })
    );
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('opens the notification preferences from the gear', async () => {
    const user = userEvent.setup();
    renderCenter();
    await user.click(
      screen.getByRole('button', { name: 'Notification settings' })
    );
    expect(mockNavigate).toHaveBeenCalledWith('/account', {
      state: { scrollTo: 'notification-preferences' },
    });
  });

  it('shows the empty state', async () => {
    mockState.Notifications.notifications = [];
    await expand();
    expect(
      screen.getByText('No notifications match these filters.')
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Clear all' })).toBeDisabled();
  });

  it('shows a loading state while the first fetch runs', async () => {
    mockState.Notifications = { notifications: [], status: 'loading' };
    await expand();
    expect(
      screen.getByRole('status', { name: 'Loading notifications…' })
    ).toBeInTheDocument();
  });

  it('shows an error with a retry when the fetch fails', async () => {
    mockState.Notifications = { notifications: [], status: 'failed' };
    const user = await expand();
    expect(screen.getByRole('alert')).toHaveTextContent(
      "We couldn't load your notifications."
    );
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(thunks.fetchAll).toHaveBeenCalledTimes(1);
  });
});
