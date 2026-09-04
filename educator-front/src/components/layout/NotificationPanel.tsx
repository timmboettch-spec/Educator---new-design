import { useEffect, useRef, useState } from "react";
import { Bell, CheckCheck, Settings, Trash2, X } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import loginEn from "../../locales/auth/login/en.json";
import loginEs from "../../locales/auth/login/es.json";
import { useAppDispatch, useAppSelector } from "../../store/hooks";
import {
  selectNotifications,
  selectUnreadCount,
  markNotificationRead,
  markNotificationUnread,
  markAllNotificationsRead,
  markAllNotificationsUnread,
  deleteNotification,
  clearAllNotifications,
  resetNotifications,
  fetchNotifications,
  fetchUnreadCount,
  type AppNotification,
  type NotificationType,
} from "../../redux/notifications/NotificationsRedux";
import { restoreSession } from "../../redux/auth/LoginRedux";
import {
  swapRoles,
  getSecondaryToken,
  getSecondaryUser,
  getToken,
  getParsedUser,
} from "../../utils/storage";
import { toast } from "../common/Toast";
import { AUTH_MESSAGES } from "../../utils/messages/auth";

// Unread dots use the brand orange consistently; the only non-brand exceptions
// kept are the SEMANTIC warning yellows (low-seat warnings) and neutral GENERAL.
const TYPE_CONFIG: Record<NotificationType, { dot: string; label: string }> = {
  EDUCATOR_REGISTERED: { dot: "bg-primary-500", label: "Registered" },
  TOKENS_ALLOCATED: { dot: "bg-primary-500", label: "Seats" },
  CLASS_CREATED: { dot: "bg-primary-500", label: "Class" },
  CLASS_TRANSFERRED: { dot: "bg-primary-500", label: "Transfer" },
  SIMULATION_ASSIGNED: { dot: "bg-primary-500", label: "Simulation" },
  EDUCATOR_LOW_SEAT_WARNING: { dot: "bg-yellow-500", label: "Low Seats" },
  SCHOOL_LOW_SEAT_WARNING: { dot: "bg-yellow-600", label: "Low Seats" },
  EDUCATOR_SEAT_REQUEST: { dot: "bg-primary-500", label: "Seat Request" },
  STUDENT_REPORT_AVAILABLE: { dot: "bg-primary-500", label: "Report" },
  SIMULATION_DUE_DATE_REMINDER: { dot: "bg-primary-500", label: "Reminder" },
  PRODUCTS_ASSOCIATED: { dot: "bg-primary-500", label: "Products" },
  GENERAL: { dot: "bg-gray-400", label: "Info" },
};

function timeAgo(dateStr: string, t: Record<string, string>): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return t.timeJustNow ?? "just now";
  if (mins < 60)
    return (t.timeMinutesAgo ?? "{n}m ago").replace("{n}", String(mins));
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)
    return (t.timeHoursAgo ?? "{n}h ago").replace("{n}", String(hrs));
  return (t.timeDaysAgo ?? "{n}d ago").replace(
    "{n}",
    String(Math.floor(hrs / 24)),
  );
}

function getMetadataString(
  metadata: Record<string, unknown> | undefined,
  ...keys: string[]
): string | undefined {
  for (const key of keys) {
    const value = metadata?.[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
}

function getNotificationTitle(
  notification: AppNotification,
  t: Record<string, string>,
): string {
  const typeMap: Partial<Record<NotificationType, string>> = {
    SIMULATION_ASSIGNED: t.typeSimulationAssigned,
    CLASS_CREATED: t.typeClassCreated,
    CLASS_TRANSFERRED: t.typeClassTransferred,
    EDUCATOR_REGISTERED: t.typeEducatorRegistered,
    TOKENS_ALLOCATED: t.typeTokensAllocated,
    STUDENT_REPORT_AVAILABLE: t.typeStudentReport,
    SIMULATION_DUE_DATE_REMINDER: t.typeDueDateReminder,
    EDUCATOR_LOW_SEAT_WARNING: t.typeLowSeats,
    SCHOOL_LOW_SEAT_WARNING: t.typeLowSeats,
    EDUCATOR_SEAT_REQUEST: t.typeSeatRequest,
    GENERAL: t.typeGeneral,
  };
  return typeMap[notification.type] ?? notification.title;
}

function formatNotificationMessage(
  notification: AppNotification,
  t: Record<string, string>,
): string {
  if (notification.type === "EDUCATOR_REGISTERED") {
    const educatorName = getMetadataString(
      notification.metadata,
      "educatorName",
      "educator_name",
    );
    const completedAt = getMetadataString(
      notification.metadata,
      "completedAt",
      "completed_at",
    );
    if (educatorName && completedAt) {
      const d = new Date(completedAt);
      const utcStr = d.toLocaleString("en-US", {
        timeZone: "UTC",
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
      return (
        t.msgEducatorRegistered ?? "{edu} completed registration on {date} UTC."
      )
        .replace("{edu}", educatorName)
        .replace("{date}", utcStr);
    }
  }

  if (notification.type === "SCHOOL_LOW_SEAT_WARNING") {
    const schoolName = getMetadataString(
      notification.metadata,
      "schoolName",
      "school_name",
    );
    const remainingRaw =
      notification.metadata?.remainingSchoolSeats ??
      notification.metadata?.remaining_school_seats;
    const remainingSeats =
      typeof remainingRaw === "number"
        ? remainingRaw
        : typeof remainingRaw === "string"
          ? Number(remainingRaw)
          : NaN;

    if (schoolName && Number.isFinite(remainingSeats)) {
      return (
        t.msgSchoolLowSeats ?? "{school} has only {seats} seats remaining."
      )
        .replace("{school}", schoolName)
        .replace("{seats}", String(remainingSeats));
    }
  }

  if (
    notification.type === "SIMULATION_ASSIGNED" &&
    notification.recipientType === "admin"
  ) {
    const educatorName = getMetadataString(
      notification.metadata,
      "educatorName",
      "educator_name",
    );
    const className = getMetadataString(
      notification.metadata,
      "className",
      "class_name",
    );
    const simulationTitle = getMetadataString(
      notification.metadata,
      "simulationTitle",
      "simulation_title",
    );
    if (educatorName && className && simulationTitle) {
      return (
        t.msgSimAssignedAdmin ??
        'Educator {edu} assigned simulation "{sim}" to class "{cls}".'
      )
        .replace("{edu}", educatorName)
        .replace("{sim}", simulationTitle)
        .replace("{cls}", className);
    }
  }
  // Build message from metadata for educator-recipient SIMULATION_ASSIGNED
  if (notification.type === "SIMULATION_ASSIGNED") {
    const simulationTitle = getMetadataString(
      notification.metadata,
      "simulationTitle",
      "simulation_title",
    );
    const className = getMetadataString(
      notification.metadata,
      "className",
      "class_name",
    );
    if (simulationTitle && className) {
      return (
        t.msgSimAssigned ??
        'Simulation "{sim}" has been assigned to class "{cls}".'
      )
        .replace("{sim}", simulationTitle)
        .replace("{cls}", className);
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
        !notification.isRead ? "bg-[#e9e9e9]/60" : ""
      }`}
      onClick={() => onOpen(notification)}
    >
      <span
        className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${!notification.isRead ? cfg.dot : "bg-gray-200"}`}
      />
      <div className="flex-1 min-w-0">
        <p
          className={`text-sm leading-snug ${!notification.isRead ? "font-semibold text-gray-900" : "font-medium text-gray-700"}`}
        >
          {getNotificationTitle(notification, t)}
        </p>
        <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">
          {formatNotificationMessage(notification, t)}
        </p>
        <p className="text-[11px] text-gray-500 mt-1">
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
            title="Mark as unread"
          >
            <span className="w-2.5 h-2.5 rounded-full border-2 border-primary-500 inline-block" />
          </button>
        )}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete(notification.id);
          }}
          className="p-1 text-gray-300 hover:text-red-400 transition-colors"
          title="Delete"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

export default function NotificationPanel() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const t = (
    localStorage.getItem("app_language")?.toLowerCase() === "es"
      ? loginEs
      : loginEn
  ).notifications;
  const notifications = useAppSelector(selectNotifications);
  const unreadCount = useAppSelector(selectUnreadCount);
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
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

  // Settings gear → Account page, Notification Preferences (scrolled to top).
  const goToPreferences = () => {
    setOpen(false);
    navigate("/account", { state: { scrollTo: "notification-preferences" } });
  };
  // Footer → the Notification Center on the user's dashboard.
  const goToNotificationCenter = () => {
    setOpen(false);
    const user = getParsedUser() as { role?: unknown } | null;
    const r = user?.role;
    const roleName =
      typeof r === "string"
        ? r.toLowerCase()
        : ((r as Record<string, string> | undefined)?.role_name ?? "").toLowerCase();
    const dashRoute =
      roleName === "educator" ? "/educator-dashboard" : "/admin-dashboard";
    navigate(dashRoute, { state: { scrollTo: "notification-center" } });
  };

  const handleOpenNotification = (notification: AppNotification) => {
    if (!notification.isRead) {
      handleRead(notification.id);
    }

    if (
      notification.type === "SIMULATION_ASSIGNED" ||
      notification.type === "STUDENT_REPORT_AVAILABLE" ||
      notification.type === "SIMULATION_DUE_DATE_REMINDER" ||
      notification.type === "CLASS_CREATED"
    ) {
      const rawClassId =
        notification.metadata?.classId ?? notification.metadata?.class_id;
      const classId = typeof rawClassId === "string" ? rawClassId : "";
      const rawSimulationId =
        notification.metadata?.simulationId ??
        notification.metadata?.simulation_id ??
        notification.metadata?.scenarioId ??
        notification.metadata?.scenario_id;
      const simulationId =
        typeof rawSimulationId === "string" ? rawSimulationId : "";
      const rawStudentId =
        notification.metadata?.studentId ?? notification.metadata?.student_id;
      const notifStudentId =
        typeof rawStudentId === "string" ? rawStudentId : "";

      if (
        notification.type === "SIMULATION_ASSIGNED" &&
        notification.recipientType === "admin" &&
        simulationId
      ) {
        const backTo = `${location.pathname}${location.search}${location.hash}`;
        const rawTitle =
          notification.metadata?.title ??
          notification.metadata?.simulation_title ??
          notification.metadata?.simulationTitle ??
          "";
        const rawImage =
          notification.metadata?.image ??
          notification.metadata?.imageUrl ??
          notification.metadata?.image_url ??
          "";
        navigate(
          `/simulationdetails/${simulationId}?source=admin-assigned-notification`,
          {
            state: {
              fromAdminAssignedNotification: true,
              backTo,
              initialData: {
                id: 0,
                scenarioId: simulationId,
                title:
                  typeof rawTitle === "string" && rawTitle.trim()
                    ? rawTitle
                    : "",
                image: typeof rawImage === "string" ? rawImage : "",
                cta: "View",
              },
            },
          },
        );
        setOpen(false);
        return;
      }

      const expandType =
        notification.type === "SIMULATION_ASSIGNED"
          ? "sims"
          : notification.type === "STUDENT_REPORT_AVAILABLE"
            ? "reports"
            : notification.type === "SIMULATION_DUE_DATE_REMINDER" ||
                notification.type === "CLASS_CREATED"
              ? "sims"
              : "students";

      if (
        notification.type === "STUDENT_REPORT_AVAILABLE" &&
        notification.recipientType === "admin"
      ) {
        const secToken = getSecondaryToken();
        const secUser = getSecondaryUser();
        const secRoleRaw = (() => {
          if (!secUser) return "";
          const r = secUser.role;
          if (typeof r === "string") return r.toLowerCase();
          if (r && typeof r === "object") {
            const n = (r as Record<string, unknown>).role_name;
            if (typeof n === "string") return n.toLowerCase();
          }
          return "";
        })();
        if (secToken && secUser && secRoleRaw === "educator" && swapRoles()) {
          const newToken = getToken();
          const newUser = getParsedUser();
          if (newToken && newUser) {
            dispatch(resetNotifications());
            dispatch(
              restoreSession({
                data: { tokens: { accessToken: newToken }, user: newUser },
                message: "",
                status: "success",
              }),
            );
            void dispatch(fetchNotifications());
            void dispatch(fetchUnreadCount());
            toast.success(AUTH_MESSAGES.TOAST.SWITCHED_TO_EDUCATOR);
            if (classId) {
              sessionStorage.setItem(
                "rwai_post_switch_nav",
                JSON.stringify({
                  to: "/classes",
                  state: {
                    classId,
                    expandType: "reports",
                    pinStudentId: notifStudentId || undefined,
                    ...(simulationId ? { simulationId } : {}),
                  },
                }),
              );
            }
            navigate("/educator-dashboard");
            setOpen(false);
            return;
          }
        }
      }

      navigate("/classes", {
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

    if (
      notification.type === "EDUCATOR_LOW_SEAT_WARNING" ||
      notification.type === "EDUCATOR_REGISTERED" ||
      notification.type === "EDUCATOR_SEAT_REQUEST"
    ) {
      const rawEducatorId =
        notification.metadata?.educatorId ?? notification.metadata?.educator_id;
      const educatorId = typeof rawEducatorId === "string" ? rawEducatorId : "";
      navigate("/educators", {
        state: educatorId ? { educatorId } : undefined,
      });
      setOpen(false);
      return;
    }

    if (
      notification.type === "SCHOOL_LOW_SEAT_WARNING" ||
      notification.type === "TOKENS_ALLOCATED"
    ) {
      const rawSchoolId =
        notification.metadata?.schoolId ?? notification.metadata?.school_id;
      const schoolId = typeof rawSchoolId === "string" ? rawSchoolId : "";
      const schoolName = getMetadataString(
        notification.metadata,
        "schoolName",
        "school_name",
      );

      navigate("/schools", {
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
    <div className="relative z-[70]" ref={panelRef}>
      {/* Bell button */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative p-1 text-gray-500 hover:text-gray-700 transition-colors"
        aria-label="Notifications"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute top-0 right-0 min-w-[16px] h-4 px-0.5 rounded-full bg-primary-500 text-[10px] font-bold text-white flex items-center justify-center leading-none">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown panel */}
      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 sm:w-96 bg-white rounded-xl shadow-xl border border-gray-100 z-[80] flex flex-col max-h-[480px]">
          {/* Header */}
          <div className="flex flex-col gap-2 px-4 pt-3 pb-2.5 border-b border-gray-200 shrink-0 bg-gray-50 rounded-t-xl">
            {/* Title row */}
            <div className="flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-base font-bold text-gray-800">
                <Bell className="w-4 h-4 text-primary-500 shrink-0" aria-hidden="true" />
                <span>{t.title}</span>
                {unreadCount > 0 && (
                  <span className="text-xs font-semibold text-white bg-primary-500 rounded-full px-2 py-0.5">
                    {unreadCount} {t.unread}
                  </span>
                )}
              </h3>
              <div className="flex items-center gap-1">
                <button
                  onClick={goToPreferences}
                  className="p-1 text-gray-500 hover:text-primary-500 transition-colors"
                  title="Notification settings"
                  aria-label="Notification settings"
                >
                  <Settings className="w-4 h-4" />
                </button>
                {notifications.length > 0 && (
                  <button
                    onClick={handleClearAll}
                    className="p-1 text-gray-500 hover:text-red-500 transition-colors"
                    title="Clear all"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
            {/* Action row */}
            {notifications.length > 0 && (
              <div className="flex items-center gap-3">
                {unreadCount > 0 && (
                  <button
                    onClick={handleMarkAll}
                    className="flex items-center gap-1.5 text-xs font-medium text-primary-500 whitespace-nowrap"
                    title="Mark all as read"
                  >
                    <CheckCheck className="w-3.5 h-3.5 shrink-0" />
                    <span>{t.markAllRead}</span>
                  </button>
                )}
                {unreadCount < notifications.length && (
                  <button
                    onClick={handleMarkAllUnread}
                    className="flex items-center gap-1.5 text-xs font-medium text-primary-500 whitespace-nowrap"
                    title="Mark all as unread"
                  >
                    <span className="w-3 h-3 rounded-full border-2 border-current inline-block shrink-0" />
                    <span>{t.markAllUnread}</span>
                  </button>
                )}
              </div>
            )}
          </div>

          {/* List */}
          <div className="overflow-y-auto flex-1 divide-y divide-gray-50">
            {notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-gray-500">
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

          {/* Footer: jump to the full Notification Center on the dashboard. */}
          <div className="border-t border-gray-100 px-4 py-2.5 shrink-0">
            <button
              type="button"
              onClick={goToNotificationCenter}
              className="w-full text-center text-sm font-semibold text-primary-600 hover:text-primary-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 rounded"
            >
              Go to Notification Center
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
