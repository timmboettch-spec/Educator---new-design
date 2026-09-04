import { useMemo, useState, type ReactNode } from 'react';
import { Bell, ChevronDown, Settings } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import {
  selectNotifications,
  markNotificationRead,
  markNotificationUnread,
  markAllNotificationsRead,
  deleteNotification,
  clearAllNotifications,
  type AppNotification,
} from '../../redux/notifications/NotificationsRedux';
import Modal from '../ui/Modal';
import { Button } from '../ui/Button';

/**
 * Notification Center — a fuller, roomier place to review and manage every
 * notification. Reuses the header-bell notifications store (mark read/unread,
 * delete, mark-all-read, clear-all) and adds:
 *   • role-aware quick category filters (admin vs educator show different sets),
 *   • a date-range filter, and
 *   • oldest/newest sorting.
 *
 * Collapsible; minimized by default.
 */

interface Group {
  key: string;
  label: string;
  types?: string[];
}

const HEAD_GROUPS: Group[] = [
  { key: 'all', label: 'All' },
  { key: 'unread', label: 'Unread' },
];

// Admins receive org/seat/educator events…
const ADMIN_GROUPS: Group[] = [
  { key: 'educators', label: 'Educators', types: ['EDUCATOR_REGISTERED'] },
  { key: 'seat_requests', label: 'Seat requests', types: ['EDUCATOR_SEAT_REQUEST'] },
  { key: 'low_seats', label: 'Low seat warnings', types: ['EDUCATOR_LOW_SEAT_WARNING', 'SCHOOL_LOW_SEAT_WARNING'] },
  { key: 'high_usage', label: 'High usage warnings', types: ['HIGH_USAGE_WARNING', 'WORKSTATION_HIGH_USAGE_WARNING'] },
  { key: 'seats_allocated', label: 'Seats allocated', types: ['TOKENS_ALLOCATED'] },
  { key: 'general', label: 'General', types: ['GENERAL'] },
];

// …educators receive class/simulation/report events.
const EDUCATOR_GROUPS: Group[] = [
  { key: 'reports', label: 'Student reports', types: ['STUDENT_REPORT_AVAILABLE'] },
  { key: 'simulations', label: 'Simulations', types: ['SIMULATION_ASSIGNED', 'SIMULATION_DUE_DATE_REMINDER'] },
  { key: 'classes', label: 'Classes', types: ['CLASS_CREATED'] },
  { key: 'seats_allocated', label: 'Seats allocated', types: ['TOKENS_ALLOCATED'] },
  { key: 'products', label: 'Products', types: ['PRODUCTS_ASSOCIATED'] },
  { key: 'general', label: 'General', types: ['GENERAL'] },
];

const RANGES: { value: string; label: string; days?: number }[] = [
  { value: 'all', label: 'All dates' },
  { value: '1d', label: 'Past 1 day', days: 1 },
  { value: '3d', label: 'Past 3 days', days: 3 },
  { value: '1w', label: 'Past 1 week', days: 7 },
  { value: '2w', label: 'Past 2 weeks', days: 14 },
  { value: '1m', label: 'Past 1 month', days: 30 },
];

const TYPE_LABELS: Record<string, string> = {
  EDUCATOR_REGISTERED: 'Educator registered',
  EDUCATOR_SEAT_REQUEST: 'Seat request',
  EDUCATOR_LOW_SEAT_WARNING: 'Low seat warning',
  SCHOOL_LOW_SEAT_WARNING: 'Low school seat warning',
  HIGH_USAGE_WARNING: 'High usage warning',
  WORKSTATION_HIGH_USAGE_WARNING: 'High usage warning',
  TOKENS_ALLOCATED: 'Seats allocated',
  SIMULATION_ASSIGNED: 'Simulation assigned',
  SIMULATION_DUE_DATE_REMINDER: 'Simulation due date reminder',
  STUDENT_REPORT_AVAILABLE: 'Student report available',
  CLASS_CREATED: 'Class created',
  PRODUCTS_ASSOCIATED: 'Products associated',
  GENERAL: 'General',
};

function humanKey(k: string): string {
  return k.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function fullDate(iso: string): string {
  const d = new Date(iso);
  return isNaN(d.getTime())
    ? '—'
    : d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

/** The actionable next step for a notification type. */
function actionFor(type: string): { label: string; route: string } | null {
  switch (type) {
    case 'EDUCATOR_SEAT_REQUEST':
      return { label: 'Manage educator seats', route: '/educators' };
    case 'EDUCATOR_REGISTERED':
      return { label: 'View educators', route: '/educators' };
    case 'EDUCATOR_LOW_SEAT_WARNING':
      return { label: 'View usage & seats', route: '/products' };
    case 'SCHOOL_LOW_SEAT_WARNING':
      return { label: 'View schools & seats', route: '/schools' };
    case 'HIGH_USAGE_WARNING':
    case 'WORKSTATION_HIGH_USAGE_WARNING':
      return { label: 'View products & usage', route: '/products' };
    case 'TOKENS_ALLOCATED':
      return { label: 'View products & usage', route: '/products' };
    case 'STUDENT_REPORT_AVAILABLE':
      return { label: 'View educators', route: '/educators' };
    case 'PRODUCTS_ASSOCIATED':
      return { label: 'View my products', route: '/products' };
    case 'SIMULATION_ASSIGNED':
    case 'SIMULATION_DUE_DATE_REMINDER':
    case 'CLASS_CREATED':
      return { label: 'Go to dashboard', route: '/admin-dashboard' };
    default:
      return null;
  }
}

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (isNaN(then)) return '';
  const diff = Date.now() - then;
  const min = Math.floor(diff / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.floor(hr / 24);
  return `${d}d ago`;
}

function Pill({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
        active ? 'bg-primary-500 text-white' : 'bg-[#e9e9e9] text-[#5f6060] hover:bg-gray-300'
      }`}
    >
      {children}
    </button>
  );
}

const selectCls =
  'text-xs rounded-md border border-gray-300 bg-white px-2 py-1 text-gray-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400';

export default function NotificationCenter({
  role,
  isDualRole = false,
}: {
  role?: string;
  isDualRole?: boolean;
}) {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const notifications = useAppSelector(selectNotifications);
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<string>('all');
  const [range, setRange] = useState<string>('all');
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest');
  const [selected, setSelected] = useState<AppNotification | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const isEducator = (role ?? '').toLowerCase().includes('educator');

  // Role-aware category set (dual-role sees both, de-duplicated by key).
  const groups = useMemo<Group[]>(() => {
    const roleGroups = isDualRole
      ? [...EDUCATOR_GROUPS, ...ADMIN_GROUPS.filter((a) => !EDUCATOR_GROUPS.some((e) => e.key === a.key))]
      : isEducator
        ? EDUCATOR_GROUPS
        : ADMIN_GROUPS;
    return [...HEAD_GROUPS, ...roleGroups];
  }, [isEducator, isDualRole]);

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  const countFor = (g: Group): number => {
    if (g.key === 'all') return notifications.length;
    if (g.key === 'unread') return unreadCount;
    return notifications.filter((n) => (g.types ?? []).includes(n.type)).length;
  };

  const shown = useMemo(() => {
    let list = notifications;

    // Category filter
    if (filter === 'unread') list = list.filter((n) => !n.isRead);
    else if (filter !== 'all') {
      const types = groups.find((g) => g.key === filter)?.types ?? [];
      list = list.filter((n) => types.includes(n.type));
    }

    // Date-range filter
    const days = RANGES.find((r) => r.value === range)?.days;
    if (days) {
      const cutoff = Date.now() - days * 86_400_000;
      list = list.filter((n) => {
        const t = new Date(n.createdAt).getTime();
        return !isNaN(t) && t >= cutoff;
      });
    }

    // Sort by date
    return [...list].sort((a, b) => {
      const ta = new Date(a.createdAt).getTime() || 0;
      const tb = new Date(b.createdAt).getTime() || 0;
      return sortOrder === 'newest' ? tb - ta : ta - tb;
    });
  }, [notifications, filter, range, sortOrder, groups]);

  // Open the detail modal and auto-mark the notification read.
  const openDetails = (n: AppNotification) => {
    setSelected(n);
    if (!n.isRead) void dispatch(markNotificationRead(n.id));
  };

  // Multi-select
  const toggleSelect = (id: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const clearSelection = () => setSelectedIds(new Set());
  const allVisibleSelected = shown.length > 0 && shown.every((n) => selectedIds.has(n.id));
  const toggleSelectAllVisible = () =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) shown.forEach((n) => next.delete(n.id));
      else shown.forEach((n) => next.add(n.id));
      return next;
    });
  const bulkMark = (read: boolean) => {
    selectedIds.forEach((id) =>
      void dispatch(read ? markNotificationRead(id) : markNotificationUnread(id)),
    );
    clearSelection();
  };

  const selectedAction = selected ? actionFor(selected.type) : null;

  return (
    <>
    <div
      id="notification-center"
      className="mt-6 bg-white border border-gray-300 rounded-md shadow-xl overflow-hidden"
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="w-full flex justify-between items-center bg-[#e9e9e9] px-4 py-3 text-left"
      >
        <div>
          <p className="flex items-center gap-2 text-[20px] font-semibold text-primary-500">
            <Bell size={20} className="shrink-0" aria-hidden="true" />
            <span>Notification Center</span>
            {unreadCount > 0 && (
              <span className="align-middle text-xs font-semibold bg-primary-500 text-white rounded-full px-2 py-0.5">
                {unreadCount} unread
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation();
              navigate("/account", {
                state: { scrollTo: "notification-preferences" },
              });
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                e.stopPropagation();
                navigate("/account", {
                  state: { scrollTo: "notification-preferences" },
                });
              }
            }}
            aria-label="Notification settings"
            title="Notification settings"
            className="p-1 rounded text-gray-500 hover:text-primary-500 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400"
          >
            <Settings size={18} />
          </span>
          <ChevronDown
            size={20}
            className={`text-gray-500 transition-transform ${open ? '' : '-rotate-90'}`}
            aria-hidden="true"
          />
        </div>
      </button>

      {open && (
        <div className="p-4">
          {/* Category quick filters (role-aware) + bulk actions */}
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <div className="flex flex-wrap items-center gap-2">
              {groups.map((g) => (
                <Pill key={g.key} active={filter === g.key} onClick={() => setFilter(g.key)}>
                  {g.label} ({countFor(g)})
                </Pill>
              ))}
            </div>
            <div className="flex items-center gap-3 text-sm">
              <button
                type="button"
                disabled={unreadCount === 0}
                onClick={() => void dispatch(markAllNotificationsRead())}
                className="text-primary-600 hover:text-primary-700 font-medium disabled:opacity-40"
              >
                Mark all read
              </button>
              <span className="text-gray-300">|</span>
              <button
                type="button"
                disabled={notifications.length === 0}
                onClick={() => void dispatch(clearAllNotifications())}
                className="text-red-600 hover:text-red-700 font-medium disabled:opacity-40"
              >
                Clear all
              </button>
            </div>
          </div>

          {/* Date range + sort */}
          <div className="flex flex-wrap items-center gap-4 mb-3 text-xs text-gray-500">
            <label className="flex items-center gap-2">
              Date range
              <select value={range} onChange={(e) => setRange(e.target.value)} className={selectCls} aria-label="Filter by date range">
                {RANGES.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2">
              Sort
              <select
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value as 'newest' | 'oldest')}
                className={selectCls}
                aria-label="Sort notifications"
              >
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
              </select>
            </label>
            <span className="text-gray-500">Showing {shown.length}</span>
          </div>

          {shown.length === 0 ? (
            <p className="text-sm text-gray-500 py-10 text-center">No notifications match these filters.</p>
          ) : (
            <>
              {/* Select-all + bulk selection toolbar */}
              <div className="flex flex-wrap items-center gap-3 mb-2 text-xs">
                <label className="flex items-center gap-2 text-gray-500">
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={toggleSelectAllVisible}
                    aria-label="Select all shown notifications"
                    className="accent-primary-500"
                  />
                  Select all shown
                </label>
                {selectedIds.size > 0 && (
                  <div className="flex flex-wrap items-center gap-3 px-2 py-1 rounded-md bg-[#e9e9e9]">
                    <span className="font-medium text-gray-700">{selectedIds.size} selected</span>
                    <button
                      type="button"
                      onClick={() => bulkMark(true)}
                      className="text-primary-600 hover:text-primary-700 font-medium"
                    >
                      Mark read
                    </button>
                    <button
                      type="button"
                      onClick={() => bulkMark(false)}
                      className="text-primary-600 hover:text-primary-700 font-medium"
                    >
                      Mark unread
                    </button>
                    <button
                      type="button"
                      onClick={clearSelection}
                      className="text-gray-500 hover:text-black font-medium"
                    >
                      Clear selection
                    </button>
                  </div>
                )}
              </div>

              <ul className="divide-y divide-gray-100 max-h-[440px] overflow-y-auto">
                {shown.map((n) => (
                  <li
                    key={n.id}
                    className={`flex items-start gap-3 py-3 px-1 ${!n.isRead ? 'bg-[#e9e9e9]/60' : ''} ${
                      selectedIds.has(n.id) ? 'bg-[#e9e9e9]' : ''
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedIds.has(n.id)}
                      onChange={() => toggleSelect(n.id)}
                      aria-label={`Select ${n.title}`}
                      className="mt-1 accent-primary-500 flex-shrink-0"
                    />
                    <span
                      className={`mt-1.5 h-2 w-2 rounded-full flex-shrink-0 ${
                        n.isRead ? 'border border-gray-300' : 'bg-primary-500'
                      }`}
                      aria-hidden="true"
                    />
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => openDetails(n)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          openDetails(n);
                        }
                      }}
                      className="min-w-0 flex-1 cursor-pointer"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-gray-900 truncate hover:text-primary-600">{n.title}</p>
                        <span className="text-xs text-gray-500 flex-shrink-0">{timeAgo(n.createdAt)}</span>
                      </div>
                      <p className="text-xs text-gray-600 mt-0.5">{n.message}</p>
                      <div className="mt-1.5 flex items-center gap-3 text-xs">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            void dispatch(n.isRead ? markNotificationUnread(n.id) : markNotificationRead(n.id));
                          }}
                          className="text-gray-500 hover:text-black"
                        >
                          {n.isRead ? 'Mark unread' : 'Mark read'}
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            void dispatch(deleteNotification(n.id));
                          }}
                          className="text-red-500 hover:text-red-600"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>

    {selected && (
      <Modal
        isOpen
        onClose={() => setSelected(null)}
        title={selected.title}
        footer={
          <div className="flex gap-3 justify-end">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setSelected(null)}
              className="h-11 rounded-full px-5 text-sm font-medium"
            >
              Close
            </Button>
            {selectedAction && (
              <Button
                type="button"
                variant="gradient"
                onClick={() => {
                  navigate(selectedAction.route);
                  setSelected(null);
                }}
              >
                {selectedAction.label}
              </Button>
            )}
          </div>
        }
      >
        <div className="space-y-4">
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs">
            <span className="text-gray-500">
              Category:{' '}
              <span className="font-semibold text-gray-800">
                {TYPE_LABELS[selected.type] ?? humanKey(selected.type)}
              </span>
            </span>
            <span className="text-gray-500">
              Sent: <span className="font-semibold text-gray-800">{fullDate(selected.createdAt)}</span>
            </span>
            <span className="text-gray-500">
              Status:{' '}
              <span className="font-semibold text-gray-800">{selected.isRead ? 'Read' : 'Unread'}</span>
            </span>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">
              What triggered this
            </p>
            <p className="text-sm text-gray-700">{selected.message}</p>
          </div>
        </div>
      </Modal>
    )}
    </>
  );
}
