import { useEffect, useRef, useState } from 'react';
import { Bell, CheckCheck, Trash2, X } from 'lucide-react';
import loginEn from '../../locales/auth/login/en.json';
import loginEs from '../../locales/auth/login/es.json';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import {
  selectNotifications,
  selectUnreadCount,
  markNotificationRead,
  markNotificationUnread,
  markAllNotificationsRead,
  markAllNotificationsUnread,
  deleteNotification,
  clearAllNotifications,
  fetchNotifications,
  type AppNotification,
  type NotificationType,
} from '../../redux/notifications/NotificationsRedux';
import { useSwitchRole } from '../../hooks/useSwitchRole';
import { useNavigate } from 'react-router-dom';

const TYPE_CONFIG: Record<NotificationType, { dot: string; label: string }> = {
  EDUCATOR_REGISTERED: { dot: 'bg-green-500', label: 'Registered' },
  TOKENS_ALLOCATED: { dot: 'bg-purple-500', label: 'Seats' },
  CLASS_CREATED: { dot: 'bg-emerald-500', label: 'Class' },
  CLASS_TRANSFERRED: { dot: 'bg-orange-500', label: 'Transfer' },
  CLASS_START_DATE_REMINDER: { dot: 'bg-teal-500', label: 'Class Start' },
  CLASS_END_DATE_REMINDER: { dot: 'bg-teal-600', label: 'Class End' },
  EDUCATOR_LOW_SEAT_WARNING: { dot: 'bg-yellow-500', label: 'Low Seats' },
  SCHOOL_LOW_SEAT_WARNING: { dot: 'bg-yellow-600', label: 'Low Seats' },
  EDUCATOR_SEAT_REQUEST: { dot: 'bg-orange-500', label: 'Seat Request' },
  STUDENT_REPORT_AVAILABLE: { dot: 'bg-cyan-500', label: 'Reports' },
  LMS_GRADE_SYNC_FAILED: { dot: 'bg-red-500', label: 'LMS Sync' },
  SIMULATION_DUE_DATE_REMINDER: { dot: 'bg-rose-500', label: 'Due Date' },
  SIMULATION_START_DATE_REMINDER: { dot: 'bg-rose-400', label: 'Start Date' },
  SIMULATION_END_DATE_REMINDER: { dot: 'bg-rose-600', label: 'End Date' },
  EMAIL_REPORT: { dot: 'bg-blue-400', label: 'Email' },
  ASSESSMENT_REPORT: { dot: 'bg-blue-500', label: 'Assessment' },
  BATCH_EMAIL: { dot: 'bg-blue-600', label: 'Batch' },
  SEND_STUDENT_CODE: { dot: 'bg-indigo-400', label: 'Code' },
  ACCOUNT_REACTIVATED: { dot: 'bg-green-400', label: 'Account' },
  FORGOT_PASSWORD: { dot: 'bg-gray-500', label: 'Password' },
  INVITE: { dot: 'bg-violet-400', label: 'Invite' },
  GENERAL: { dot: 'bg-gray-400', label: 'Info' },
};

function timeAgo(dateStr: string, t: Record<string, string>): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return t.timeJustNow ?? 'just now';
  if (mins < 60)
    return (t.timeMinutesAgo ?? '{n}m ago').replace('{n}', String(mins));
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)
    return (t.timeHoursAgo ?? '{n}h ago').replace('{n}', String(hrs));
  return (t.timeDaysAgo ?? '{n}d ago').replace(
    '{n}',
    String(Math.floor(hrs / 24))
  );
}

function getMetadataString(
  metadata: Record<string, unknown> | undefined,
  ...keys: string[]
): string | undefined {
  for (const key of keys) {
    const value = metadata?.[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
}

function getNotificationTitle(
  notification: AppNotification,
  t: Record<string, string>
): string {
  const typeMap: Partial<Record<NotificationType, string>> = {
    CLASS_CREATED: t.typeClassCreated,
    CLASS_TRANSFERRED: t.typeClassTransferred,
    CLASS_START_DATE_REMINDER: t.typeClassStartReminder,
    CLASS_END_DATE_REMINDER: t.typeClassEndReminder,
    EDUCATOR_REGISTERED: t.typeEducatorRegistered,
    TOKENS_ALLOCATED: t.typeTokensAllocated,
    STUDENT_REPORT_AVAILABLE: t.typeStudentReport,
    LMS_GRADE_SYNC_FAILED: t.typeLmsSyncFailed,
    SIMULATION_DUE_DATE_REMINDER: t.typeDueDateReminder,
    SIMULATION_START_DATE_REMINDER: t.typeStartDateReminder,
    SIMULATION_END_DATE_REMINDER: t.typeEndDateReminder,
    EDUCATOR_LOW_SEAT_WARNING: t.typeLowSeats,
    SCHOOL_LOW_SEAT_WARNING: t.typeLowSeats,
    EDUCATOR_SEAT_REQUEST: t.typeSeatRequest,
    GENERAL: t.typeGeneral,
  };
  return typeMap[notification.type] ?? notification.title;
}

function formatNotificationMessage(
  notification: AppNotification,
  t: Record<string, string>
): string {
  if (notification.type === 'LMS_GRADE_SYNC_FAILED') {
    const className = getMetadataString(
      notification.metadata,
      'className',
      'class_name'
    );
    if (!className) return notification.message;
    const countRaw =
      notification.metadata?.failureCount ??
      notification.metadata?.failure_count;
    const count = typeof countRaw === 'number' ? countRaw : 1;
    if (count > 1) {
      return (t.msgLmsSyncFailedN ?? '{count} grade sync failures in {cls}.')
        .replace('{count}', String(count))
        .replace('{cls}', className);
    }
    const studentName =
      getMetadataString(notification.metadata, 'studentName', 'student_name') ??
      'Student';
    return (t.msgLmsSyncFailed1 ?? 'Grade sync failed for {student} — {cls}.')
      .replace('{student}', studentName)
      .replace('{cls}', className);
  }

  if (notification.type === 'STUDENT_REPORT_AVAILABLE') {
    // Count-based consolidated message takes priority over per-report metadata
    const countRaw =
      notification.metadata?.reportCount ?? notification.metadata?.report_count;
    if (typeof countRaw === 'number' && countRaw >= 1) {
      return countRaw === 1
        ? (t.msgStudentReport1 ?? '1 student report is available.')
        : (
            t.msgStudentReportN ?? '{count} student reports are available.'
          ).replace('{count}', String(countRaw));
    }
    const studentName =
      getMetadataString(notification.metadata, 'studentName', 'student_name') ??
      'Student';
    const simulationTitle = getMetadataString(
      notification.metadata,
      'simulationTitle',
      'simulation_title'
    );
    if (simulationTitle) {
      return (
        t.msgStudentReport ??
        'Report is available for {student} in simulation "{sim}".'
      )
        .replace('{student}', studentName)
        .replace('{sim}', simulationTitle);
    }
    const match = notification.message?.match(
      /Report is available for (.+?) in simulation "([^"]+)"/i
    );
    if (match) {
      return (
        t.msgStudentReport ??
        'Report is available for {student} in simulation "{sim}".'
      )
        .replace('{student}', match[1])
        .replace('{sim}', match[2]);
    }
    // Fallback: return the raw message (covers count-based text stored on the backend)
    if (notification.message) return notification.message;
  }

  if (notification.type === 'EDUCATOR_REGISTERED') {
    const educatorName = getMetadataString(
      notification.metadata,
      'educatorName',
      'educator_name'
    );
    const completedAt = getMetadataString(
      notification.metadata,
      'completedAt',
      'completed_at'
    );
    if (educatorName && completedAt) {
      const d = new Date(completedAt);
      const utcStr = d.toLocaleString('en-US', {
        timeZone: 'UTC',
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });
      return (
        t.msgEducatorRegistered ?? '{edu} completed registration on {date} UTC.'
      )
        .replace('{edu}', educatorName)
        .replace('{date}', utcStr);
    }
    const match = notification.message?.match(
      /(.+?) completed registration on (.+)/i
    );
    if (match) {
      return (
        t.msgEducatorRegistered ?? '{edu} completed registration on {date} UTC.'
      )
        .replace('{edu}', match[1])
        .replace('{date}', match[2]);
    }
  }

  if (notification.type === 'SCHOOL_LOW_SEAT_WARNING') {
    const schoolName = getMetadataString(
      notification.metadata,
      'schoolName',
      'school_name'
    );
    const remainingRaw =
      notification.metadata?.remainingSchoolSeats ??
      notification.metadata?.remaining_school_seats;
    const remainingSeats =
      typeof remainingRaw === 'number'
        ? remainingRaw
        : typeof remainingRaw === 'string'
          ? Number(remainingRaw)
          : NaN;

    if (schoolName && Number.isFinite(remainingSeats)) {
      return (
        t.msgSchoolLowSeats ?? '{school} has only {seats} seats remaining.'
      )
        .replace('{school}', schoolName)
        .replace('{seats}', String(remainingSeats));
    }
    const match = notification.message?.match(
      /(.+?) has only (\d+) seats remaining/i
    );
    if (match) {
      return (
        t.msgSchoolLowSeats ?? '{school} has only {seats} seats remaining.'
      )
        .replace('{school}', match[1])
        .replace('{seats}', match[2]);
    }
  }

  if (notification.type === 'EDUCATOR_LOW_SEAT_WARNING') {
    const educatorName = getMetadataString(
      notification.metadata,
      'educatorName',
      'educator_name'
    );
    const remainingRaw =
      notification.metadata?.remainingSeats ??
      notification.metadata?.remaining_seats;
    const remainingSeats =
      typeof remainingRaw === 'number'
        ? remainingRaw
        : typeof remainingRaw === 'string'
          ? Number(remainingRaw)
          : NaN;

    if (educatorName && Number.isFinite(remainingSeats)) {
      return (
        t.msgEducatorLowSeats ?? '{edu} has only {seats} seats remaining.'
      )
        .replace('{edu}', educatorName)
        .replace('{seats}', String(remainingSeats));
    }
    const match = notification.message?.match(
      /(.+?) has only (\d+) seats remaining/i
    );
    if (match) {
      return (
        t.msgEducatorLowSeats ?? '{edu} has only {seats} seats remaining.'
      )
        .replace('{edu}', match[1])
        .replace('{seats}', match[2]);
    }
  }

  if (notification.type === 'CLASS_CREATED') {
    const className = getMetadataString(
      notification.metadata,
      'className',
      'class_name'
    );
    const educatorName = getMetadataString(
      notification.metadata,
      'educatorName',
      'educator_name'
    );
    if (className && educatorName) {
      return (t.msgClassCreated ?? 'Educator {edu} created class "{cls}".')
        .replace('{edu}', educatorName)
        .replace('{cls}', className);
    }
    const match = notification.message?.match(
      /Educator (.+?) created class "([^"]+)"/i
    );
    if (match) {
      return (t.msgClassCreated ?? 'Educator {edu} created class "{cls}".')
        .replace('{edu}', match[1])
        .replace('{cls}', match[2]);
    }
  }

  if (notification.type === 'SIMULATION_DUE_DATE_REMINDER') {
    const simulationTitle = getMetadataString(
      notification.metadata,
      'simulationTitle',
      'simulation_title'
    );
    const className = getMetadataString(
      notification.metadata,
      'className',
      'class_name'
    );
    const dueDate = getMetadataString(
      notification.metadata,
      'dueDate',
      'due_date'
    );
    if (simulationTitle && className && dueDate) {
      return (
        t.msgDueDateReminder ??
        'Simulation "{sim}" for class "{cls}" is due on {date}.'
      )
        .replace('{sim}', simulationTitle)
        .replace('{cls}', className)
        .replace('{date}', dueDate);
    }
    const match = notification.message?.match(
      /Simulation "([^"]+)" for class "([^"]+)" is due on (.+)/i
    );
    if (match) {
      return (
        t.msgDueDateReminder ??
        'Simulation "{sim}" for class "{cls}" is due on {date}.'
      )
        .replace('{sim}', match[1])
        .replace('{cls}', match[2])
        .replace('{date}', match[3]);
    }
  }

  if (notification.type === 'SIMULATION_START_DATE_REMINDER') {
    const simulationTitle = getMetadataString(
      notification.metadata,
      'simulationTitle',
      'simulation_title'
    );
    const className = getMetadataString(
      notification.metadata,
      'className',
      'class_name'
    );
    const startDate = getMetadataString(
      notification.metadata,
      'startDate',
      'start_date'
    );
    if (simulationTitle && className && startDate) {
      return (
        t.msgSimStartDateReminder ??
        'Simulation "{sim}" for class "{cls}" starts on {date}.'
      )
        .replace('{sim}', simulationTitle)
        .replace('{cls}', className)
        .replace('{date}', startDate);
    }
    const match = notification.message?.match(
      /Simulation "([^"]+)" for class "([^"]+)" starts on (.+)/i
    );
    if (match) {
      return (
        t.msgSimStartDateReminder ??
        'Simulation "{sim}" for class "{cls}" starts on {date}.'
      )
        .replace('{sim}', match[1])
        .replace('{cls}', match[2])
        .replace('{date}', match[3]);
    }
  }

  if (notification.type === 'SIMULATION_END_DATE_REMINDER') {
    const simulationTitle = getMetadataString(
      notification.metadata,
      'simulationTitle',
      'simulation_title'
    );
    const className = getMetadataString(
      notification.metadata,
      'className',
      'class_name'
    );
    const endDate = getMetadataString(
      notification.metadata,
      'endDate',
      'end_date'
    );
    if (simulationTitle && className && endDate) {
      return (
        t.msgSimEndDateReminder ??
        'Simulation "{sim}" for class "{cls}" closes on {date}.'
      )
        .replace('{sim}', simulationTitle)
        .replace('{cls}', className)
        .replace('{date}', endDate);
    }
    const match = notification.message?.match(
      /Simulation "([^"]+)" for class "([^"]+)" closes on (.+)/i
    );
    if (match) {
      return (
        t.msgSimEndDateReminder ??
        'Simulation "{sim}" for class "{cls}" closes on {date}.'
      )
        .replace('{sim}', match[1])
        .replace('{cls}', match[2])
        .replace('{date}', match[3]);
    }
  }

  if (notification.type === 'CLASS_START_DATE_REMINDER') {
    const className = getMetadataString(
      notification.metadata,
      'className',
      'class_name'
    );
    const startDate = getMetadataString(
      notification.metadata,
      'startDate',
      'start_date'
    );
    if (className && startDate) {
      return (t.msgClassStartReminder ?? 'Class "{cls}" is starting on {date}.')
        .replace('{cls}', className)
        .replace('{date}', startDate);
    }
    const match = notification.message?.match(
      /Class "([^"]+)" is starting on (.+)/i
    );
    if (match) {
      return (t.msgClassStartReminder ?? 'Class "{cls}" is starting on {date}.')
        .replace('{cls}', match[1])
        .replace('{date}', match[2]);
    }
  }

  if (notification.type === 'CLASS_END_DATE_REMINDER') {
    const className = getMetadataString(
      notification.metadata,
      'className',
      'class_name'
    );
    const endDate = getMetadataString(
      notification.metadata,
      'endDate',
      'end_date'
    );
    if (className && endDate) {
      return (t.msgClassEndReminder ?? 'Class "{cls}" is ending on {date}.')
        .replace('{cls}', className)
        .replace('{date}', endDate);
    }
    const match = notification.message?.match(
      /Class "([^"]+)" is ending on (.+)/i
    );
    if (match) {
      return (t.msgClassEndReminder ?? 'Class "{cls}" is ending on {date}.')
        .replace('{cls}', match[1])
        .replace('{date}', match[2]);
    }
  }

  if (notification.type === 'TOKENS_ALLOCATED') {
    const seatsRaw =
      notification.metadata?.allocatedSeats ??
      notification.metadata?.allocated_seats;
    const seats =
      typeof seatsRaw === 'number'
        ? seatsRaw
        : typeof seatsRaw === 'string'
          ? Number(seatsRaw)
          : NaN;
    if (Number.isFinite(seats)) {
      return (
        t.msgTokensAllocated ??
        '{seats} AI seat(s) have been allocated to your account.'
      ).replace('{seats}', String(seats));
    }
    const match = notification.message?.match(
      /^(\d+) AI seats? have been allocated/i
    );
    if (match) {
      return (
        t.msgTokensAllocated ??
        '{seats} AI seat(s) have been allocated to your account.'
      ).replace('{seats}', match[1]);
    }
  }

  if (notification.type === 'CLASS_TRANSFERRED') {
    const className = getMetadataString(
      notification.metadata,
      'className',
      'class_name'
    );
    const targetEducatorName = getMetadataString(
      notification.metadata,
      'targetEducatorName',
      'target_educator_name'
    );
    const sourceEducatorName = getMetadataString(
      notification.metadata,
      'sourceEducatorName',
      'source_educator_name'
    );
    const transferredAt = getMetadataString(
      notification.metadata,
      'transferredAt',
      'transferred_at'
    );
    if (className && targetEducatorName && transferredAt) {
      return (
        t.msgClassTransferredSource ??
        'Your class "{cls}" has been transferred to {target} on {date}.'
      )
        .replace('{cls}', className)
        .replace('{target}', targetEducatorName)
        .replace('{date}', transferredAt);
    }
    if (className && sourceEducatorName && transferredAt) {
      return (
        t.msgClassTransferredTarget ??
        'Class "{cls}" has been assigned to you from {source} on {date}.'
      )
        .replace('{cls}', className)
        .replace('{source}', sourceEducatorName)
        .replace('{date}', transferredAt);
    }
  }

  if (notification.type === 'EDUCATOR_SEAT_REQUEST') {
    const educatorName = getMetadataString(
      notification.metadata,
      'educatorName',
      'educator_name'
    );
    const remainingRaw =
      notification.metadata?.remainingSeats ??
      notification.metadata?.remaining_seats;
    const remainingSeats =
      typeof remainingRaw === 'number'
        ? remainingRaw
        : typeof remainingRaw === 'string'
          ? Number(remainingRaw)
          : NaN;
    const requestedRaw =
      notification.metadata?.requestedSeats ??
      notification.metadata?.requested_seats;
    const requestedSeats =
      typeof requestedRaw === 'number'
        ? requestedRaw
        : typeof requestedRaw === 'string'
          ? Number(requestedRaw)
          : NaN;
    if (educatorName && Number.isFinite(remainingSeats)) {
      if (Number.isFinite(requestedSeats) && requestedSeats > 0) {
        return (
          t.msgSeatRequestSpecific ??
          '{edu} is requesting {count} additional AI seat(s) (currently has {remaining} remaining).'
        )
          .replace('{edu}', educatorName)
          .replace('{count}', String(requestedSeats))
          .replace('{remaining}', String(remainingSeats));
      }
      return (
        t.msgSeatRequestGeneric ??
        '{edu} is requesting more AI seats (currently has {remaining} remaining).'
      )
        .replace('{edu}', educatorName)
        .replace('{remaining}', String(remainingSeats));
    }
  }

  if (notification.message) {
    const reportMatch = notification.message.match(
      /Report is available for (.+?) in simulation "([^"]+)"/i
    );
    if (reportMatch) {
      return (
        t.msgStudentReport ??
        'Report is available for {student} in simulation "{sim}".'
      )
        .replace('{student}', reportMatch[1])
        .replace('{sim}', reportMatch[2]);
    }
  }

  return notification.message;
}

function NotificationItem({
  notification,
  onOpen,
  onMarkUnread,
  onDelete,
  t,
}: {
  notification: AppNotification;
  onOpen: (notification: AppNotification) => void;
  onMarkUnread: (id: string) => void;
  onDelete: (id: string) => void;
  t: Record<string, string>;
}) {
  const cfg = TYPE_CONFIG[notification.type] ?? TYPE_CONFIG.GENERAL;
  return (
    <div
      className={`flex items-start gap-3 px-4 py-3 hover:bg-gray-50 transition-colors cursor-pointer ${
        !notification.isRead ? 'bg-orange-50/50' : ''
      }`}
      onClick={() => onOpen(notification)}
    >
      <span
        className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${!notification.isRead ? cfg.dot : 'bg-gray-200'}`}
      />
      <div className="flex-1 min-w-0">
        <p
          className={`text-sm leading-snug ${!notification.isRead ? 'font-semibold text-gray-900' : 'font-medium text-gray-700'}`}
        >
          {getNotificationTitle(notification, t)}
        </p>
        <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">
          {formatNotificationMessage(notification, t)}
        </p>
        <p className="text-[11px] text-gray-400 mt-1">
          {timeAgo(notification.createdAt, t)}
        </p>
      </div>
      <div className="flex items-center gap-0.5 shrink-0">
        {notification.isRead && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onMarkUnread(notification.id);
            }}
            className="p-1"
            title={t.markAsUnread}
          >
            <span className="w-2.5 h-2.5 rounded-full border-2 border-orange-500 inline-block" />
          </button>
        )}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete(notification.id);
          }}
          className="p-1 text-gray-300 hover:text-red-400 transition-colors"
          title={t.delete}
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

/** Read by the educator dashboard to finish navigation after a role switch. */
const POST_SWITCH_NAV_KEY = 'rwai_post_switch_nav';

export default function NotificationPanel() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { targetRole: switchTargetRole, switchRole } = useSwitchRole();
  const t = (
    localStorage.getItem('app_language')?.toLowerCase() === 'es'
      ? loginEs
      : loginEn
  ).notifications;
  const notifications = useAppSelector(selectNotifications);
  const unreadCount = useAppSelector(selectUnreadCount);
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    void dispatch(fetchNotifications());
    const handleClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const handleRead = (id: string) => void dispatch(markNotificationRead(id));
  const handleUnread = (id: string) =>
    void dispatch(markNotificationUnread(id));
  const handleDelete = (id: string) => void dispatch(deleteNotification(id));
  const handleMarkAll = () => void dispatch(markAllNotificationsRead());
  const handleMarkAllUnread = () => void dispatch(markAllNotificationsUnread());
  const handleClearAll = () => {
    void dispatch(clearAllNotifications());
  };

  const handleOpenNotification = (notification: AppNotification) => {
    if (!notification.isRead) {
      handleRead(notification.id);
    }

    if (
      notification.type === 'STUDENT_REPORT_AVAILABLE' ||
      notification.type === 'LMS_GRADE_SYNC_FAILED' ||
      notification.type === 'SIMULATION_DUE_DATE_REMINDER' ||
      notification.type === 'CLASS_CREATED'
    ) {
      const rawClassId =
        notification.metadata?.classId ?? notification.metadata?.class_id;
      const classId = typeof rawClassId === 'string' ? rawClassId : '';
      const rawSimulationId =
        notification.metadata?.simulationId ??
        notification.metadata?.simulation_id ??
        notification.metadata?.scenarioId ??
        notification.metadata?.scenario_id;
      const simulationId =
        typeof rawSimulationId === 'string' ? rawSimulationId : '';

      if (
        notification.type === 'STUDENT_REPORT_AVAILABLE' &&
        notification.recipientType === 'admin'
      ) {
        const rawClassId =
          notification.metadata?.classId ?? notification.metadata?.class_id;
        const classId = typeof rawClassId === 'string' ? rawClassId : '';
        const rawEducatorId =
          notification.metadata?.educatorId ??
          notification.metadata?.educator_id;
        const educatorId =
          typeof rawEducatorId === 'string' ? rawEducatorId : '';
        const rawStudentId =
          notification.metadata?.studentId ?? notification.metadata?.student_id;
        const notifStudentId =
          typeof rawStudentId === 'string' ? rawStudentId : '';

        const openEducatorsList = () => {
          navigate('/educators', {
            state: educatorId ? { educatorId } : undefined,
          });
          setOpen(false);
        };

        // Multi-role admin: switch to the educator role and open the class
        // report table once the educator dashboard mounts.
        if (switchTargetRole === 'educator') {
          if (classId) {
            sessionStorage.setItem(
              POST_SWITCH_NAV_KEY,
              JSON.stringify({
                to: '/classes',
                state: {
                  classId,
                  expandType: 'reports',
                  pinStudentId: notifStudentId || undefined,
                },
              })
            );
          }
          void switchRole().then((switched) => {
            if (switched) {
              setOpen(false);
              return;
            }
            sessionStorage.removeItem(POST_SWITCH_NAV_KEY);
            openEducatorsList();
          });
          return;
        }

        // Pure admin (no educator role): navigate to the educators list
        openEducatorsList();
        return;
      }

      // Educator path for SIMULATION_DUE_DATE_REMINDER, CLASS_CREATED, or STUDENT_REPORT_AVAILABLE
      const expandType =
        notification.type === 'STUDENT_REPORT_AVAILABLE' ||
        notification.type === 'LMS_GRADE_SYNC_FAILED'
          ? 'reports'
          : 'sims';
      navigate('/classes', {
        state: classId
          ? {
              classId,
              expandType,
              ...(simulationId ? { simulationId } : {}),
            }
          : undefined,
      });
      setOpen(false);
      return;
    }

    if (notification.type === 'CLASS_TRANSFERRED') {
      const rawClassId =
        notification.metadata?.classId ?? notification.metadata?.class_id;
      const classId = typeof rawClassId === 'string' ? rawClassId : '';
      navigate('/classes', {
        state: classId ? { classId } : undefined,
      });
      setOpen(false);
      return;
    }

    if (
      notification.type === 'EDUCATOR_LOW_SEAT_WARNING' ||
      notification.type === 'EDUCATOR_REGISTERED' ||
      notification.type === 'EDUCATOR_SEAT_REQUEST'
    ) {
      const rawEducatorId =
        notification.metadata?.educatorId ?? notification.metadata?.educator_id;
      const educatorId = typeof rawEducatorId === 'string' ? rawEducatorId : '';
      navigate('/educators', {
        state: educatorId ? { educatorId } : undefined,
      });
      setOpen(false);
      return;
    }

    if (
      notification.type === 'SCHOOL_LOW_SEAT_WARNING' ||
      notification.type === 'TOKENS_ALLOCATED'
    ) {
      const rawSchoolId =
        notification.metadata?.schoolId ?? notification.metadata?.school_id;
      const schoolId = typeof rawSchoolId === 'string' ? rawSchoolId : '';
      const schoolName = getMetadataString(
        notification.metadata,
        'schoolName',
        'school_name'
      );

      navigate('/schools', {
        state:
          schoolId || schoolName
            ? {
                ...(schoolId ? { schoolId } : {}),
                ...(schoolName ? { schoolName } : {}),
              }
            : undefined,
      });
      setOpen(false);
      return;
    }

    setOpen(false);
  };

  return (
    <div className="relative z-[9999]" ref={panelRef}>
      {/* Bell button */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative p-1 text-gray-500 hover:text-gray-700 transition-colors"
        aria-label="Notifications"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute top-0 right-0 min-w-[16px] h-4 px-0.5 rounded-full bg-orange-500 text-[10px] font-bold text-white flex items-center justify-center leading-none">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown panel */}
      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 sm:w-96 bg-white rounded-xl shadow-2xl border border-gray-200 z-[9999] max-h-[480px] overflow-y-auto">
          {/* Header — sticky so it stays visible while the list scrolls */}
          <div className="sticky top-0 z-10 flex flex-col gap-2 px-4 pt-3 pb-2.5 border-b border-gray-200 bg-gray-50 rounded-t-xl">
            {/* Title row */}
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-gray-800">
                {t.title}
                {unreadCount > 0 && (
                  <span className="ml-2 text-xs font-semibold text-white bg-orange-500 rounded-full px-2 py-0.5">
                    {unreadCount} {t.unread}
                  </span>
                )}
              </h3>
              {notifications.length > 0 && (
                <button
                  onClick={handleClearAll}
                  className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                  title={t.clearAll}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
            {/* Action row */}
            {notifications.length > 0 && (
              <div className="flex items-center gap-3">
                {unreadCount > 0 && (
                  <button
                    onClick={handleMarkAll}
                    className="flex items-center gap-1.5 text-xs font-medium text-orange-500 whitespace-nowrap"
                    title={t.markAllAsRead}
                  >
                    <CheckCheck className="w-3.5 h-3.5 shrink-0" />
                    <span>{t.markAllRead}</span>
                  </button>
                )}
                {unreadCount < notifications.length && (
                  <button
                    onClick={handleMarkAllUnread}
                    className="flex items-center gap-1.5 text-xs font-medium text-orange-500 whitespace-nowrap"
                    title={t.markAllAsUnread}
                  >
                    <span className="w-3 h-3 rounded-full border-2 border-current inline-block shrink-0" />
                    <span>{t.markAllUnread}</span>
                  </button>
                )}
              </div>
            )}
          </div>

          {/* List */}
          <div className="divide-y divide-gray-50">
            {notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                <Bell className="w-8 h-8 mb-2 opacity-30" />
                <p className="text-sm">{t.noNotificationsYet}</p>
              </div>
            ) : (
              notifications.map((n) => (
                <NotificationItem
                  key={n.id}
                  notification={n}
                  onOpen={handleOpenNotification}
                  onMarkUnread={handleUnread}
                  onDelete={handleDelete}
                  t={t as Record<string, string>}
                />
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
