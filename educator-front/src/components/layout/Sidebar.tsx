import { useMemo, useState, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import clsx from 'clsx';
import { useTranslation } from 'react-i18next';
import Logo from '../../../public/assets/RealityworksAI_logo.svg';
import loginEn from '../../locales/auth/login/en.json';
import loginEs from '../../locales/auth/login/es.json';
import { useSessionIdentity } from '../../features/auth/model/useSessionIdentity';
import { ROLE } from '../../features/auth/model/roles';
import { navItemsFor } from '../../routes/navFromRoutes';
import { buildRouteTree } from '../../routes/routeTree';
import { StudentAppLink } from './StudentAppLink';

type SupportedLang = 'en' | 'es';

const LANGUAGE_STORAGE_KEY = 'app_language';

/**
 * Built once, for the signed-in shape of the tree. The signed-out variant differs only
 * in where the simulation detail page is registered, and that page carries no `nav`,
 * so the menu is identical either way — and the sidebar only renders for a signed-in
 * visitor regardless.
 */
const NAV_ROUTE_TREE = buildRouteTree(true);

const getStoredLanguage = (): SupportedLang => {
  if (typeof window === 'undefined') {
    return 'en';
  }

  const saved = localStorage.getItem(LANGUAGE_STORAGE_KEY)?.toLowerCase();
  return saved === 'es' ? 'es' : 'en';
};

interface TooltipState {
  label: string;
  top: number;
}

function Tooltip({ label, top }: TooltipState) {
  return (
    <div
      className="fixed pointer-events-none z-[9999] bg-white border border-primary-400 text-primary-500 text-xs font-semibold px-3 py-1.5 rounded-md shadow-md whitespace-nowrap"
      style={{
        top,
        left: 80,
        transform: 'translateY(-50%)',
        animation: 'fadeIn 120ms ease-out',
      }}
    >
      {label}
    </div>
  );
}

export default function Sidebar() {
  const { t } = useTranslation('common');
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const logoRef = useRef<HTMLButtonElement>(null);
  const language = getStoredLanguage();
  const locale = useMemo(
    () => (language === 'es' ? loginEs : loginEn),
    [language]
  );

  const isActive = (path: string) =>
    location.pathname === path || location.pathname.startsWith(path + '/');

  /**
   * The menu is derived from the route tree, not maintained beside it.
   *
   * It used to be three hardcoded arrays — admin, educator and trial — each with its
   * own copy of the role check, the license check and the Google Classroom filter.
   * That is a second access table, and a second access table drifts: a link outliving
   * the route it points at, or a route quietly reachable with no way to find it.
   *
   * Now an item exists because its route declares `nav`, and it is shown when that
   * route's own guards would admit this visitor.
   */
  const identity = useSessionIdentity();
  const menuItems = useMemo(
    () =>
      navItemsFor(NAV_ROUTE_TREE, identity).map((item) => ({
        path: item.path,
        icon: item.icon,
        name: locale.sidebar[item.labelKey],
      })),
    [identity, locale]
  );

  const showTooltip = (label: string, el: HTMLElement) => {
    const rect = el.getBoundingClientRect();
    setTooltip({ label, top: rect.top + rect.height / 2 });
  };

  const hideTooltip = () => setTooltip(null);

  return (
    <>
      {collapsed && tooltip && (
        <Tooltip label={tooltip.label} top={tooltip.top} />
      )}

      <aside
        className={`
          relative h-screen flex flex-col flex-shrink-0
          bg-white border-r border-gray-100
          transition-[width] duration-300 ease-in-out
          ${collapsed ? 'w-20' : 'w-72'}
        `}
      >
        {/* Collapse button — visible only when expanded */}
        {!collapsed && (
          <button
            onClick={() => setCollapsed(true)}
            className="absolute z-50 flex items-center justify-center bg-white border border-gray-200 rounded-full shadow hover:bg-neutral-active hover:border-primary-300 focus:outline-none focus:border-primary-400 transition-colors"
            style={{
              right: '-12px',
              top: '32px',
              width: '24px',
              height: '24px',
            }}
            aria-label={locale.sidebar.collapseSidebar}
            title={locale.sidebar.collapseSidebar}
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
              aria-label={locale.sidebar.expandSidebar}
              title={locale.sidebar.expandSidebar}
              className="flex items-center justify-center gap-1.5 w-full h-9 cursor-pointer hover:bg-neutral-active rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-300 transition-colors"
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
        <nav
          aria-label={t('sidebar.primaryNav')}
          className="flex-1 px-2 py-6 space-y-1 overflow-y-auto"
        >
          {menuItems.map(({ path, name, icon: Icon }) => (
            <div
              key={path}
              onMouseEnter={(e) =>
                collapsed && showTooltip(name, e.currentTarget)
              }
              onMouseLeave={hideTooltip}
            >
              <Link
                to={path}
                className={clsx(
                  'flex items-center gap-4 py-3.5 rounded-xl border-2',
                  'font-semibold text-[14px] leading-[22px]',
                  'transition-all duration-200 overflow-hidden',
                  'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400',
                  collapsed ? 'justify-center px-0' : 'px-4 border-l-8',
                  isActive(path)
                    ? 'bg-neutral-active text-primary border-primary'
                    : 'text-text-secondary border-transparent hover:bg-gray-50 hover:text-gray-900'
                )}
              >
                <Icon
                  aria-hidden="true"
                  strokeWidth={2}
                  className={clsx(
                    'w-5 h-5 flex-shrink-0',
                    isActive(path) ? 'text-primary' : 'text-neutral-500'
                  )}
                />
                {!collapsed && (
                  <span
                    className={clsx(
                      'transition-all truncate min-w-0',
                      isActive(path)
                        ? 'text-neutral-800 text-body-base font-medium'
                        : 'text-neutral-500 text-body-sm font-normal'
                    )}
                  >
                    {name}
                  </span>
                )}
              </Link>
            </div>
          ))}
        </nav>

        {identity.role === ROLE.EDUCATOR && (
          <StudentAppLink
            collapsed={collapsed}
            onShowTooltip={showTooltip}
            onHideTooltip={hideTooltip}
          />
        )}
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
