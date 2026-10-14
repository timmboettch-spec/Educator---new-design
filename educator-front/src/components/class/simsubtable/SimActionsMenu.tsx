import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';

const MENU_ITEMS = (
  isEmail: boolean,
  isEditDisabled: boolean,
  t: TFunction<'classManagement'>
) => [
  {
    label: t('simSubtable.menuEdit'),
    action: 'edit',
    disabled: isEditDisabled,
  },
  {
    label: t('simSubtable.menuViewDetails'),
    action: 'view_details',
    disabled: false,
  },
  {
    label: t('simSubtable.menuExportGrade'),
    action: 'export_grade',
    disabled: false,
  },
  {
    label: t('simSubtable.menuExportReports'),
    action: 'export_reports',
    disabled: false,
  },
  {
    label: t('rowActions.exportTranscripts'),
    action: 'export_transcripts',
    disabled: false,
  },
  {
    label: t('rowActions.markAllReviewed'),
    action: 'mark_all_reviewed',
    disabled: false,
  },
  {
    label: t('rowActions.markAllUnreviewed'),
    action: 'mark_all_unreviewed',
    disabled: false,
  },
  {
    label: t('simSubtable.menuAiInsights'),
    action: 'ai_insights',
    disabled: false,
  },
  {
    label: t('simSubtable.menuEmailReports'),
    action: 'email_reports',
    disabled: isEmail,
  },
  {
    label: t('simSubtable.menuCopySimId'),
    action: 'copy_sim_id',
    disabled: false,
  },
  {
    label: t('simSubtable.menuDelete'),
    action: 'delete',
    danger: true,
    disabled: false,
  },
];

/**
 * The per-assignment "···" menu, portalled to <body> and positioned beside its trigger.
 * Arrow keys move, Tab wraps, Escape closes and returns focus to the trigger.
 */
export function SimActionsMenu({
  anchorEl,
  onClose,
  onSelect,
  simId,
  isEmail,
  isEditDisabled,
}: {
  anchorEl: HTMLElement | null;
  onClose: () => void;
  onSelect: (action: string, simId: string) => void;
  simId: string;
  isEmail: boolean;
  /** A Past assignment is closed: its dates can't be edited. */
  isEditDisabled: boolean;
}) {
  const { t } = useTranslation('classManagement');
  const [style, setStyle] = useState<React.CSSProperties>();
  const dropdownRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!anchorEl) return;
    const rect = anchorEl.getBoundingClientRect();
    const DROPDOWN_HEIGHT = 416;
    const DROPDOWN_WIDTH = 220;
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;

    const top =
      spaceBelow >= DROPDOWN_HEIGHT
        ? rect.bottom + 4
        : spaceAbove >= DROPDOWN_HEIGHT
          ? rect.top - DROPDOWN_HEIGHT - 4
          : rect.bottom + 4;

    setStyle({
      position: 'fixed',
      top,
      left: rect.right - DROPDOWN_WIDTH,
      width: DROPDOWN_WIDTH,
      zIndex: 9999,
    });
  }, [anchorEl]);

  useEffect(() => {
    if (!anchorEl) return;
    window.addEventListener('scroll', onClose, true);
    window.addEventListener('resize', onClose);
    return () => {
      window.removeEventListener('scroll', onClose, true);
      window.removeEventListener('resize', onClose);
    };
  }, [anchorEl, onClose]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      const target = e.target as HTMLElement;
      if (
        !target.closest('[data-sim-dropdown]') &&
        !target.closest('[data-sim-trigger]')
      ) {
        onClose();
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [onClose]);

  useEffect(() => {
    if (!style || !dropdownRef.current) return;

    const rafId = requestAnimationFrame(() => {
      const first = dropdownRef.current?.querySelector<HTMLElement>(
        'button:not([disabled])'
      );
      first?.focus();
    });

    const handleKeyDown = (e: KeyboardEvent) => {
      if (!dropdownRef.current) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        (anchorEl as HTMLElement)?.focus();
        return;
      }
      const focusable = Array.from(
        dropdownRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled])'
        )
      );
      if (!focusable.length) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const idx = focusable.indexOf(document.activeElement as HTMLElement);
        focusable[idx < focusable.length - 1 ? idx + 1 : 0]?.focus();
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        const idx = focusable.indexOf(document.activeElement as HTMLElement);
        focusable[idx > 0 ? idx - 1 : focusable.length - 1]?.focus();
        return;
      }
      if (e.key === 'Tab') {
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last?.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first?.focus();
          }
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      cancelAnimationFrame(rafId);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [style, onClose, anchorEl]);

  if (!anchorEl) return null;
  const items = MENU_ITEMS(isEmail, isEditDisabled, t);

  return createPortal(
    <div
      ref={dropdownRef}
      style={style}
      data-sim-dropdown="true"
      className="bg-white border border-gray-300 rounded-xl overflow-hidden shadow-[0_8px_32px_rgba(0,0,0,0.18)]"
    >
      {items.map((item) => {
        const isDisabled = item.disabled;
        return (
          <button
            key={item.label}
            type="button"
            disabled={isDisabled}
            onClick={() => !isDisabled && onSelect(item.action, simId)}
            className={`
            w-full text-left px-5 py-3 text-sm font-normal transition-colors focus:outline-none focus-visible:bg-primary-100
            ${isDisabled ? 'text-gray-300 cursor-not-allowed' : item.danger ? 'text-red-500 hover:text-red-600 hover:bg-gray-50' : 'text-gray-700 hover:text-gray-900 hover:bg-gray-50'}
            ${item.danger ? 'border-t border-gray-100' : ''}
          `}
          >
            {item.label}
          </button>
        );
      })}
    </div>,
    document.body
  );
}
