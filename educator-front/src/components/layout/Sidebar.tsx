import { useMemo, useState, useRef } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAppSelector } from "../../store/hooks";
import { selectLoginResponse } from "../../redux/auth/LoginRedux";
import Logo from "../../../public/assets/RealityworksAI_logo.svg";
import {
  Home,
  School,
  Users,
  Package,
  Plug,
  CircleUser,
  Presentation,
  Library,
  BookOpen,
  ExternalLink,
  Copy,
  Check,
  type LucideIcon,
} from "lucide-react";
import { getParsedUser } from "../../utils/storage";
import loginEn from "../../locales/auth/login/en.json";
import loginEs from "../../locales/auth/login/es.json";

type SupportedLang = "en" | "es";

const LANGUAGE_STORAGE_KEY = "app_language";

// Placeholder student-app URL surfaced in the educator sidebar for quick access.
const STUDENT_APP_URL = "https://tutorpatient.realityworksai.com/";

const getStoredLanguage = (): SupportedLang => {
  if (typeof window === "undefined") {
    return "en";
  }

  const saved = localStorage.getItem(LANGUAGE_STORAGE_KEY)?.toLowerCase();
  return saved === "es" ? "es" : "en";
};

interface TooltipState {
  label: string;
  top: number;
}

type MenuItem = { name: string; path: string; icon: LucideIcon };

function Tooltip({ label, top }: TooltipState) {
  return (
    <div
      className="fixed pointer-events-none z-[9999] bg-white border border-primary-400 text-primary-500 text-xs font-semibold px-3 py-1.5 rounded-md shadow-md whitespace-nowrap"
      style={{
        top,
        left: 80,
        transform: "translateY(-50%)",
        animation: "fadeIn 120ms ease-out",
      }}
    >
      {label}
    </div>
  );
}

export default function Sidebar() {
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const logoRef = useRef<HTMLButtonElement>(null);
  const language = getStoredLanguage();
  const locale = useMemo(
    () => (language === "es" ? loginEs : loginEn),
    [language],
  );

  const isActive = (path: string) =>
    location.pathname === path || location.pathname.startsWith(path + "/");

  const adminMenuItems: MenuItem[] = [
    {
      name: locale.sidebar.dashboard,
      path: "/admin-dashboard",
      icon: Home,
    },
    { name: locale.sidebar.schools, path: "/schools", icon: School },
    { name: locale.sidebar.educators, path: "/educators", icon: Users },
    { name: locale.sidebar.myProducts, path: "/products", icon: Package },
    {
      name: locale.sidebar.lmsIntegration,
      path: "/lms-integration",
      icon: Plug,
    },
    { name: locale.sidebar.account, path: "/account", icon: CircleUser },
  ];

  const educatorMenuItems: MenuItem[] = [
    {
      name: locale.sidebar.dashboard,
      path: "/educator-dashboard",
      icon: Home,
    },
    {
      name: locale.sidebar.classManagement,
      path: "/classes",
      icon: Presentation,
    },
    {
      name: locale.sidebar.mySimulationLibrary,
      path: "/simulationlibrary",
      icon: Library,
    },
    {
      name: locale.sidebar.simulationCatalog,
      path: "/simulation-catalog",
      icon: BookOpen,
    },
    // { name: locale.sidebar.myProducts, path: '/products', icon: Package },
    { name: locale.sidebar.account, path: "/account", icon: CircleUser },
  ];

  const trialMenuItems: MenuItem[] = [
    {
      name: locale.sidebar.simulationCatalog,
      path: "/simulation-catalog",
      icon: BookOpen,
    },
    // Educator portal has no My Products page — products are listed on the dashboard.
    // { name: locale.sidebar.myProducts, path: "/products", icon: Package },
    { name: locale.sidebar.account, path: "/account", icon: CircleUser },
  ];

  const loginResponse = useAppSelector(selectLoginResponse);
  const cookieUser = getParsedUser();
  const reduxUser = loginResponse?.data?.user as
    | Record<string, unknown>
    | null
    | undefined;
  const user = cookieUser ?? reduxUser;
  const role = (
    typeof user?.role === "string"
      ? user.role
      : ((user?.role as Record<string, unknown>)?.role_name as string)
  )?.toLowerCase();
  const isLicenseActive = !!(
    reduxUser?.is_license_active ?? cookieUser?.is_license_active
  );
  const isTrialUser =
    !isLicenseActive && sessionStorage.getItem("skipped_redeem") === "true";

  const menuItems = isTrialUser
    ? trialMenuItems
    : role === "educator"
      ? educatorMenuItems
      : adminMenuItems;

  const showTooltip = (label: string, el: HTMLElement) => {
    const rect = el.getBoundingClientRect();
    setTooltip({ label, top: rect.top + rect.height / 2 });
  };

  const hideTooltip = () => setTooltip(null);

  const [copiedStudentUrl, setCopiedStudentUrl] = useState(false);
  const copyStudentUrl = async () => {
    try {
      await navigator.clipboard.writeText(STUDENT_APP_URL);
      setCopiedStudentUrl(true);
      setTimeout(() => setCopiedStudentUrl(false), 1500);
    } catch {
      /* clipboard unavailable — no-op */
    }
  };
  const showStudentApp = role === "educator" || isTrialUser;

  return (
    <>
      {collapsed && tooltip && (
        <Tooltip label={tooltip.label} top={tooltip.top} />
      )}

      <aside
        className={`
          sticky top-0 z-40 h-screen flex flex-col flex-shrink-0
          bg-white border-r border-gray-100
          transition-[width] duration-300 ease-in-out
          ${collapsed ? "w-20" : "w-72"}
        `}
      >
        {/* Collapse button — visible only when expanded */}
        {!collapsed && (
          <button
            onClick={() => setCollapsed(true)}
            className="absolute z-50 flex items-center justify-center bg-white border border-gray-200 rounded-full shadow hover:bg-[#e9e9e9] hover:border-primary-300 focus:outline-none focus:border-primary-400 transition-colors"
            style={{
              right: "-12px",
              top: "32px",
              width: "24px",
              height: "24px",
            }}
            aria-label="Collapse sidebar"
            title="Collapse sidebar"
          >
            <svg
              className="w-3.5 h-3.5 text-gray-500"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15 19l-7-7 7-7"
              />
            </svg>
          </button>
        )}

        {/* Header */}
        <div className="h-16 flex items-center px-4 border-b border-gray-200">
          {collapsed ? (
            <button
              ref={logoRef}
              aria-label="Expand sidebar"
              title="Expand sidebar"
              className="flex items-center justify-center gap-1.5 w-full h-9 cursor-pointer hover:bg-[#e9e9e9] rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-300 transition-colors"
              onClick={() => {
                hideTooltip();
                setCollapsed(false);
              }}
            >
              <img
                src={Logo}
                alt="Realityworks AI"
                className="w-7 h-7 object-contain flex-shrink-0"
              />
              <svg
                className="w-4 h-4 text-primary-500 flex-shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 5l7 7-7 7"
                />
              </svg>
            </button>
          ) : (
            <div className="flex items-center gap-3">
              <img
                src={Logo}
                alt="Realityworks AI"
                className="w-9 h-9 object-contain flex-shrink-0"
              />
              <span className="font-semibold text-gray-800 text-base tracking-tight whitespace-nowrap">
                Realityworks <span className="text-primary">AI</span>
              </span>
            </div>
          )}
        </div>

        {/* Nav */}
        <nav aria-label="Primary" className="flex-1 px-2 py-6 space-y-1 overflow-y-auto">
          {menuItems.map((item) => (
            <div
              key={item.path}
              onMouseEnter={(e) =>
                collapsed && showTooltip(item.name, e.currentTarget)
              }
              onMouseLeave={hideTooltip}
            >
              <Link
                to={item.path}
                aria-label={item.name}
                aria-current={isActive(item.path) ? "page" : undefined}
                className={`
                  flex items-center gap-4 px-4 py-3.5 rounded-xl border-2 border-l-8
                  font-semibold text-[14px] leading-[22px]
                  transition-all duration-200 overflow-hidden
                  focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400
                  ${collapsed ? "justify-center" : ""}
                  ${
                    isActive(item.path)
                      ? "bg-[#e9e9e9] text-primary border-primary"
                      : "text-text-secondary border-transparent hover:bg-gray-50 hover:text-gray-900"
                  }
                `}
              >
                {(() => {
                  const Icon = item.icon;
                  return (
                    <Icon
                      aria-hidden="true"
                      strokeWidth={2}
                      className={`w-5 h-5 flex-shrink-0 ${
                        isActive(item.path) ? "text-primary" : "text-neutral-500"
                      }`}
                    />
                  );
                })()}
                {!collapsed && (
                  <span
                    className={`transition-all truncate min-w-0 ${
                      isActive(item.path)
                        ? "text-neutral-800 text-body-base font-medium"
                        : "text-neutral-500 text-body-sm font-normal"
                    }`}
                  >
                    {item.name}
                  </span>
                )}
              </Link>
            </div>
          ))}
        </nav>

        {/* Student-app quick link (educators) */}
        {showStudentApp &&
          (collapsed ? (
            <div
              className="px-2 pb-4"
              onMouseEnter={(e) => showTooltip("Student app", e.currentTarget)}
              onMouseLeave={hideTooltip}
            >
              <a
                href={STUDENT_APP_URL}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Open the student app"
                title="Open the student app"
                className="flex items-center justify-center w-full h-10 rounded-xl border border-gray-200 text-primary-500 hover:bg-[#e9e9e9] hover:border-primary-300 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400"
              >
                <ExternalLink size={18} aria-hidden="true" />
              </a>
            </div>
          ) : (
            <div className="px-3 pb-4 pt-1">
              <div className="rounded-xl border border-gray-200 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-1.5">
                  Student App
                </p>
                <div className="flex items-center gap-2">
                  <a
                    href={STUDENT_APP_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={STUDENT_APP_URL}
                    className="inline-flex items-center gap-1 text-xs text-primary-600 hover:text-primary-700 hover:underline truncate min-w-0 flex-1"
                  >
                    <ExternalLink size={13} className="shrink-0" aria-hidden="true" />
                    <span className="truncate">{STUDENT_APP_URL}</span>
                  </a>
                  <button
                    type="button"
                    onClick={copyStudentUrl}
                    aria-label="Copy student app link"
                    title={copiedStudentUrl ? "Copied!" : "Copy link"}
                    className="p-1.5 rounded-md text-gray-500 hover:text-primary-500 hover:bg-[#e9e9e9] transition-colors flex-shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400"
                  >
                    {copiedStudentUrl ? (
                      <Check size={15} className="text-green-600" aria-hidden="true" />
                    ) : (
                      <Copy size={15} aria-hidden="true" />
                    )}
                  </button>
                </div>
              </div>
            </div>
          ))}
      </aside>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
      `}</style>
    </>
  );
}
