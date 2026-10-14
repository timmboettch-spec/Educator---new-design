import { useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Bell, ChevronDown, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useDashboardCardState } from '@/hooks/useDashboardCardState';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import {
  clearAllNotifications,
  deleteNotification,
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  markNotificationUnread,
  selectNotifications,
  selectNotificationsStatus,
  type AppNotification,
  type NotificationType,
} from '@/redux/notifications/NotificationsRedux';
import Modal from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/modal/ConfirmDialog';

type GroupKey =
  | 'all'
  | 'unread'
  | 'reports'
  | 'simulations'
  | 'classes'
  | 'seats'
  | 'products'
  | 'general';

type ActionKey = 'reports' | 'simulations' | 'classes' | 'products';

interface CategoryGroup {
  key: Exclude<GroupKey, 'all' | 'unread' | 'general'>;
  /** Typed as string: some (e.g. PRODUCTS_ASSOCIATED) aren't sent by the BE yet. */
  types: string[];
  action: ActionKey;
}

const CATEGORY_GROUPS: CategoryGroup[] = [
  {
    key: 'reports',
    types: ['STUDENT_REPORT_AVAILABLE', 'LMS_GRADE_SYNC_FAILED'],
    action: 'reports',
  },
  {
    key: 'simulations',
    types: [
      'SIMULATION_DUE_DATE_REMINDER',
      'SIMULATION_START_DATE_REMINDER',
      'SIMULATION_END_DATE_REMINDER',
    ],
    action: 'simulations',
  },
  {
    key: 'classes',
    types: [
      'CLASS_CREATED',
      'CLASS_TRANSFERRED',
      'CLASS_START_DATE_REMINDER',
      'CLASS_END_DATE_REMINDER',
    ],
    action: 'classes',
  },
  {
    key: 'seats',
    types: ['TOKENS_ALLOCATED', 'EDUCATOR_LOW_SEAT_WARNING'],
    action: 'products',
  },
  { key: 'products', types: ['PRODUCTS_ASSOCIATED'], action: 'products' },
];

const GROUP_ORDER: GroupKey[] = [
  'all',
  'unread',
  'reports',
  'simulations',
  'classes',
  'seats',
  'products',
  'general',
];

const RANGES = [
  { value: 'all', days: 0 },
  { value: '1d', days: 1 },
  { value: '3d', days: 3 },
  { value: '1w', days: 7 },
  { value: '2w', days: 14 },
  { value: '1m', days: 30 },
] as const;

type RangeValue = (typeof RANGES)[number]['value'];
type SortOrder = 'newest' | 'oldest';

const DAY_MS = 86_400_000;

// Every type has a translated label. Typed as a Record so a type added to
// `NotificationType` fails to compile until it is labelled here and in both
// locale files; `humanizeType` is only for values the server adds later.
const LABELLED_TYPES: Record<NotificationType | 'PRODUCTS_ASSOCIATED', true> = {
  EDUCATOR_REGISTERED: true,
  TOKENS_ALLOCATED: true,
  CLASS_CREATED: true,
  CLASS_TRANSFERRED: true,
  EDUCATOR_LOW_SEAT_WARNING: true,
  SCHOOL_LOW_SEAT_WARNING: true,
  EDUCATOR_SEAT_REQUEST: true,
  STUDENT_REPORT_AVAILABLE: true,
  LMS_GRADE_SYNC_FAILED: true,
  SIMULATION_DUE_DATE_REMINDER: true,
  SIMULATION_START_DATE_REMINDER: true,
  SIMULATION_END_DATE_REMINDER: true,
  CLASS_START_DATE_REMINDER: true,
  CLASS_END_DATE_REMINDER: true,
  SCHOOL_STATUS_CHANGED: true,
  SCHOOL_REMOVED: true,
  EMAIL_REPORT: true,
  ASSESSMENT_REPORT: true,
  BATCH_EMAIL: true,
  SEND_STUDENT_CODE: true,
  ACCOUNT_REACTIVATED: true,
  FORGOT_PASSWORD: true,
  INVITE: true,
  GENERAL: true,
  PRODUCTS_ASSOCIATED: true,
};

type LabelledType = keyof typeof LABELLED_TYPES;

const isLabelledType = (type: string): type is LabelledType =>
  Object.prototype.hasOwnProperty.call(LABELLED_TYPES, type);

const groupOf = (type: string): CategoryGroup | undefined =>
  CATEGORY_GROUPS.find((group) => group.types.includes(type));

const matchesGroup = (notification: AppNotification, key: GroupKey) => {
  if (key === 'all') return true;
  if (key === 'unread') return !notification.isRead;
  if (key === 'general') return !groupOf(notification.type);
  return groupOf(notification.type)?.key === key;
};

const humanizeType = (type: string) =>
  type
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/^\w/, (c) => c.toUpperCase());

const metadataString = (
  metadata: Record<string, unknown> | undefined,
  ...keys: string[]
) => {
  for (const key of keys) {
    const value = metadata?.[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return undefined;
};

const SELECT_CLASSES =
  'text-xs rounded-md border border-gray-300 bg-white px-2 py-1 text-gray-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400';

const LINK_BUTTON =
  'font-medium rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 disabled:opacity-40 disabled:cursor-not-allowed';

function Pill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'px-3 py-1 rounded-full text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400',
        active
          ? 'bg-primary-500 text-white'
          : 'bg-[#e9e9e9] text-[#5f6060] hover:bg-gray-300'
      )}
    >
      {children}
    </button>
  );
}

/**
 * Educator dashboard Notification Center: a roomier view of the header-bell
 * notifications with category chips, a date range, sorting, bulk read/unread, and
 * a detail dialog linking to the relevant page. Reads and updates the shared
 * notifications slice (kept fresh by `useNotifications`). Collapsed by default.
 */
export function NotificationCenter() {
  const { t, i18n } = useTranslation('dashboard');
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const notifications = useAppSelector(selectNotifications);
  const status = useAppSelector(selectNotificationsStatus);
  const locale = i18n.language.startsWith('es') ? 'es-ES' : 'en-US';

  const [open, setOpen] = useDashboardCardState('notifications', false);
  const [filter, setFilter] = useState<GroupKey>('all');
  const [range, setRange] = useState<RangeValue>('all');
  const [sortOrder, setSortOrder] = useState<SortOrder>('newest');
  // The open notification is read from the store by id, so its status stays
  // current (e.g. once marked read); the snapshot covers a row that's removed
  // while the dialog is open.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedSnapshot, setSelectedSnapshot] =
    useState<AppNotification | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isClearConfirmOpen, setIsClearConfirmOpen] = useState(false);
  const [isClearing, setIsClearing] = useState(false);

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  const shown = useMemo(() => {
    const days = RANGES.find((r) => r.value === range)?.days ?? 0;
    const cutoff = days ? Date.now() - days * DAY_MS : null;
    const time = (n: AppNotification) => new Date(n.createdAt).getTime() || 0;

    return notifications
      .filter((n) => matchesGroup(n, filter))
      .filter((n) => cutoff === null || time(n) >= cutoff)
      .sort((a, b) =>
        sortOrder === 'newest' ? time(b) - time(a) : time(a) - time(b)
      );
  }, [notifications, filter, range, sortOrder]);

  const timeAgo = (iso: string) => {
    const then = new Date(iso).getTime();
    if (Number.isNaN(then)) return '';
    const minutes = Math.floor((Date.now() - then) / 60_000);
    if (minutes < 1) return t('notificationCenter.time.justNow');
    if (minutes < 60)
      return t('notificationCenter.time.minutes', { count: minutes });
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return t('notificationCenter.time.hours', { count: hours });
    return t('notificationCenter.time.days', {
      count: Math.floor(hours / 24),
    });
  };

  const fullDate = (iso: string) => {
    const date = new Date(iso);
    return Number.isNaN(date.getTime())
      ? '—'
      : date.toLocaleString(locale, {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
        });
  };

  const typeLabel = (type: string) =>
    isLabelledType(type)
      ? t(`notificationCenter.types.${type}`)
      : humanizeType(type);

  const selected =
    notifications.find((n) => n.id === selectedId) ?? selectedSnapshot;

  const openDetails = (notification: AppNotification) => {
    setSelectedId(notification.id);
    setSelectedSnapshot(notification);
    if (!notification.isRead)
      void dispatch(markNotificationRead(notification.id));
  };

  const toggleRead = (notification: AppNotification) => {
    void dispatch(
      notification.isRead
        ? markNotificationUnread(notification.id)
        : markNotificationRead(notification.id)
    );
  };

  const toggleSelect = (id: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const clearSelection = () => setSelectedIds(new Set());

  const allShownSelected =
    shown.length > 0 && shown.every((n) => selectedIds.has(n.id));

  const toggleSelectAllShown = () =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      shown.forEach((n) => {
        if (allShownSelected) next.delete(n.id);
        else next.add(n.id);
      });
      return next;
    });

  const bulkMark = (read: boolean) => {
    selectedIds.forEach((id) => {
      void dispatch(
        read ? markNotificationRead(id) : markNotificationUnread(id)
      );
    });
    clearSelection();
  };

  const deleteOne = (id: string) => {
    void dispatch(deleteNotification(id));
    setSelectedIds((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  const confirmClearAll = async () => {
    setIsClearing(true);
    try {
      await dispatch(clearAllNotifications()).unwrap();
      clearSelection();
      setIsClearConfirmOpen(false);
    } catch {
      // The list stays as it was; the user can try again.
    } finally {
      setIsClearing(false);
    }
  };

  const openSettings = () =>
    navigate('/account', { state: { scrollTo: 'notification-preferences' } });

  const closeDetails = () => {
    setSelectedId(null);
    setSelectedSnapshot(null);
  };

  const runAction = (notification: AppNotification, action: ActionKey) => {
    closeDetails();
    if (action === 'products') {
      document
        .getElementById('my-products-usage')
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    const classId = metadataString(
      notification.metadata,
      'classId',
      'class_id'
    );
    const simulationId = metadataString(
      notification.metadata,
      'simulationId',
      'simulation_id'
    );
    const expandType =
      action === 'reports'
        ? 'reports'
        : action === 'simulations'
          ? 'sims'
          : null;
    navigate('/classes', {
      state: classId
        ? {
            classId,
            ...(expandType ? { expandType } : {}),
            ...(simulationId && expandType === 'sims' ? { simulationId } : {}),
          }
        : undefined,
    });
  };

  const selectedAction = selected ? groupOf(selected.type)?.action : undefined;
  const isLoading = status === 'loading' && notifications.length === 0;
  const hasError = status === 'failed' && notifications.length === 0;

  const renderList = () => {
    if (isLoading) {
      return (
        <div
          role="status"
          className="py-6 space-y-3"
          aria-label={t('notificationCenter.loading')}
        >
          {[0, 1, 2].map((row) => (
            <div key={row} className="flex items-start gap-3 animate-pulse">
              <span className="mt-1 h-4 w-4 rounded bg-gray-200" />
              <div className="flex-1 space-y-2">
                <div className="h-3 w-1/3 rounded bg-gray-200" />
                <div className="h-3 w-2/3 rounded bg-gray-100" />
              </div>
            </div>
          ))}
          <span className="sr-only">{t('notificationCenter.loading')}</span>
        </div>
      );
    }

    if (hasError) {
      return (
        <div role="alert" className="py-10 text-center space-y-3">
          <p className="text-sm text-gray-600">
            {t('notificationCenter.error')}
          </p>
          <Button
            type="button"
            variant="outline"
            onClick={() => void dispatch(fetchNotifications())}
            className="h-9 rounded-full px-4 text-sm"
          >
            {t('notificationCenter.retry')}
          </Button>
        </div>
      );
    }

    if (shown.length === 0) {
      return (
        <p className="text-sm text-gray-500 py-10 text-center">
          {t('notificationCenter.empty')}
        </p>
      );
    }

    return (
      <>
        <div className="flex flex-wrap items-center gap-3 mb-2 text-xs">
          <label className="flex items-center gap-2 text-gray-500">
            <input
              type="checkbox"
              checked={allShownSelected}
              onChange={toggleSelectAllShown}
              aria-label={t('notificationCenter.selectAllShownAria')}
              className="accent-primary-500"
            />
            {t('notificationCenter.selectAllShown')}
          </label>
          {selectedIds.size > 0 && (
            <div className="flex flex-wrap items-center gap-3 px-2 py-1 rounded-md bg-[#e9e9e9]">
              <span className="font-medium text-gray-700">
                {t('notificationCenter.selected', { count: selectedIds.size })}
              </span>
              <button
                type="button"
                onClick={() => bulkMark(true)}
                className={cn(
                  LINK_BUTTON,
                  'text-primary-600 hover:text-primary-700'
                )}
              >
                {t('notificationCenter.markRead')}
              </button>
              <button
                type="button"
                onClick={() => bulkMark(false)}
                className={cn(
                  LINK_BUTTON,
                  'text-primary-600 hover:text-primary-700'
                )}
              >
                {t('notificationCenter.markUnread')}
              </button>
              <button
                type="button"
                onClick={clearSelection}
                className={cn(LINK_BUTTON, 'text-gray-500 hover:text-black')}
              >
                {t('notificationCenter.clearSelection')}
              </button>
            </div>
          )}
        </div>

        <ul className="divide-y divide-gray-100 max-h-[440px] overflow-y-auto">
          {shown.map((notification) => {
            const isSelected = selectedIds.has(notification.id);
            return (
              <li
                key={notification.id}
                className={cn(
                  'flex items-start gap-3 py-3 px-1',
                  !notification.isRead && 'bg-[#e9e9e9]/60',
                  isSelected && 'bg-[#e9e9e9]'
                )}
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => toggleSelect(notification.id)}
                  aria-label={t('notificationCenter.selectOne', {
                    title: notification.title,
                  })}
                  className="mt-1 accent-primary-500 flex-shrink-0"
                />
                <span
                  aria-hidden="true"
                  className={cn(
                    'mt-1.5 h-2 w-2 rounded-full flex-shrink-0',
                    notification.isRead
                      ? 'border border-gray-300'
                      : 'bg-primary-500'
                  )}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => openDetails(notification)}
                      className="min-w-0 text-left text-sm font-semibold text-gray-900 truncate hover:text-primary-600 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400"
                    >
                      <span className="sr-only">
                        {notification.isRead
                          ? t('notificationCenter.statusRead')
                          : t('notificationCenter.statusUnread')}
                        :{' '}
                      </span>
                      {notification.title}
                    </button>
                    <span className="text-xs text-gray-500 flex-shrink-0">
                      {timeAgo(notification.createdAt)}
                    </span>
                  </div>
                  <p className="text-xs text-gray-600 mt-0.5 break-words">
                    {notification.message}
                  </p>
                  <div className="mt-1.5 flex items-center gap-3 text-xs">
                    <button
                      type="button"
                      onClick={() => toggleRead(notification)}
                      className={cn(
                        LINK_BUTTON,
                        'text-gray-500 hover:text-black'
                      )}
                    >
                      {notification.isRead
                        ? t('notificationCenter.markUnread')
                        : t('notificationCenter.markRead')}
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteOne(notification.id)}
                      className={cn(
                        LINK_BUTTON,
                        'text-red-500 hover:text-red-600'
                      )}
                    >
                      {t('notificationCenter.delete')}
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </>
    );
  };

  return (
    <>
      <section
        id="notification-center"
        className="mt-6 bg-white border border-gray-300 rounded-md shadow-xl overflow-hidden"
      >
        {/* The gear sits over the toggle (not inside it) so buttons never nest. */}
        <div className="relative bg-[#e9e9e9]">
          <button
            type="button"
            onClick={() => setOpen((isOpen) => !isOpen)}
            aria-expanded={open}
            className="w-full flex justify-between items-center gap-2 pl-4 pr-4 py-3 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-400"
          >
            <h2 className="m-0 pr-10 flex flex-wrap items-center gap-2 text-[20px] font-semibold text-primary-500">
              <Bell size={20} className="shrink-0" aria-hidden="true" />
              <span>{t('notificationCenter.title')}</span>
              {unreadCount > 0 && (
                <span className="text-xs font-semibold bg-primary-500 text-white rounded-full px-2 py-0.5">
                  {t('notificationCenter.unread', { count: unreadCount })}
                </span>
              )}
            </h2>
            <ChevronDown
              size={20}
              aria-hidden="true"
              className={cn(
                'text-gray-500 shrink-0 transition-transform duration-200',
                !open && '-rotate-90'
              )}
            />
          </button>
          <button
            type="button"
            onClick={openSettings}
            aria-label={t('notificationCenter.settings')}
            title={t('notificationCenter.settings')}
            className="absolute right-11 top-1/2 -translate-y-1/2 p-1 rounded text-gray-500 hover:text-primary-500 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400"
          >
            <Settings size={18} aria-hidden="true" />
          </button>
        </div>

        {open && (
          <div className="p-4">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
              <div
                role="group"
                aria-label={t('notificationCenter.groupFilterLabel')}
                className="flex flex-wrap items-center gap-2"
              >
                {GROUP_ORDER.map((key) => (
                  <Pill
                    key={key}
                    active={filter === key}
                    onClick={() => setFilter(key)}
                  >
                    {t(`notificationCenter.groups.${key}`)} (
                    {notifications.filter((n) => matchesGroup(n, key)).length})
                  </Pill>
                ))}
              </div>
              <div className="flex items-center gap-3 text-sm">
                <button
                  type="button"
                  disabled={unreadCount === 0}
                  onClick={() => void dispatch(markAllNotificationsRead())}
                  className={cn(
                    LINK_BUTTON,
                    'text-primary-600 hover:text-primary-700'
                  )}
                >
                  {t('notificationCenter.markAllRead')}
                </button>
                <span className="text-gray-300" aria-hidden="true">
                  |
                </span>
                <button
                  type="button"
                  disabled={notifications.length === 0}
                  onClick={() => setIsClearConfirmOpen(true)}
                  className={cn(LINK_BUTTON, 'text-red-600 hover:text-red-700')}
                >
                  {t('notificationCenter.clearAll')}
                </button>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-4 mb-3 text-xs text-gray-500">
              <label className="flex items-center gap-2">
                {t('notificationCenter.dateRange')}
                <select
                  value={range}
                  onChange={(e) => {
                    const next = RANGES.find((r) => r.value === e.target.value);
                    if (next) setRange(next.value);
                  }}
                  aria-label={t('notificationCenter.dateRangeAria')}
                  className={SELECT_CLASSES}
                >
                  {RANGES.map((r) => (
                    <option key={r.value} value={r.value}>
                      {t(`notificationCenter.ranges.${r.value}`)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-2">
                {t('notificationCenter.sort')}
                <select
                  value={sortOrder}
                  onChange={(e) =>
                    setSortOrder(
                      e.target.value === 'oldest' ? 'oldest' : 'newest'
                    )
                  }
                  aria-label={t('notificationCenter.sortAria')}
                  className={SELECT_CLASSES}
                >
                  <option value="newest">
                    {t('notificationCenter.newest')}
                  </option>
                  <option value="oldest">
                    {t('notificationCenter.oldest')}
                  </option>
                </select>
              </label>
              <span aria-live="polite">
                {t('notificationCenter.showing', { count: shown.length })}
              </span>
            </div>

            {renderList()}
          </div>
        )}
      </section>

      {selected && (
        <Modal
          isOpen
          onClose={closeDetails}
          title={selected.title}
          footer={
            <div className="flex gap-3 justify-end">
              <Button
                type="button"
                variant="secondary"
                onClick={closeDetails}
                className="h-11 rounded-full px-5 text-sm font-medium"
              >
                {t('notificationCenter.detail.close')}
              </Button>
              {selectedAction && (
                <Button
                  type="button"
                  variant="gradient"
                  onClick={() => runAction(selected, selectedAction)}
                >
                  {t(`notificationCenter.actions.${selectedAction}`)}
                </Button>
              )}
            </div>
          }
        >
          <div className="space-y-4">
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs">
              <span className="text-gray-500">
                {t('notificationCenter.detail.category')}{' '}
                <span className="font-semibold text-gray-800">
                  {typeLabel(selected.type)}
                </span>
              </span>
              <span className="text-gray-500">
                {t('notificationCenter.detail.sent')}{' '}
                <span className="font-semibold text-gray-800">
                  {fullDate(selected.createdAt)}
                </span>
              </span>
              <span className="text-gray-500">
                {t('notificationCenter.detail.status')}{' '}
                <span className="font-semibold text-gray-800">
                  {selected.isRead
                    ? t('notificationCenter.statusRead')
                    : t('notificationCenter.statusUnread')}
                </span>
              </span>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">
                {t('notificationCenter.detail.trigger')}
              </p>
              <p className="text-sm text-gray-700 break-words">
                {selected.message}
              </p>
            </div>
          </div>
        </Modal>
      )}

      <ConfirmDialog
        isOpen={isClearConfirmOpen}
        onClose={() => setIsClearConfirmOpen(false)}
        onConfirm={() => void confirmClearAll()}
        title={t('notificationCenter.clearConfirm.title')}
        message={t('notificationCenter.clearConfirm.message', {
          count: notifications.length,
        })}
        confirmText={t('notificationCenter.clearConfirm.confirm')}
        cancelText={t('notificationCenter.clearConfirm.cancel')}
        isLoading={isClearing}
        loadingText={t('notificationCenter.clearConfirm.loading')}
      />
    </>
  );
}
