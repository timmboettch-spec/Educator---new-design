import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import loginEn from '../../../locales/auth/login/en.json';
import loginEs from '../../../locales/auth/login/es.json';

interface ActionMenuProps {
  id: string;
  open: boolean;
  onToggle: () => void;
  onAssignClass: (id: string) => void;
  onMoreInfo: (id: string) => void;
  onRemoveFromLibrary?: (id: string) => void;
  removingId?: string | null;
  fromBundle?: boolean;
  /** Names the simulation in the "More details" item's accessible label. */
  simulationTitle?: string;
  /** Id the details page opens with; marks the trigger for focus restore. */
  moreInfoId?: string;
}

const ActionMenu: React.FC<ActionMenuProps> = ({
  id,
  open,
  onToggle,
  onAssignClass,
  onMoreInfo,
  onRemoveFromLibrary,
  removingId,
  fromBundle,
  simulationTitle,
  moreInfoId,
}) => {
  const { t: tLibrary } = useTranslation('simulationLibrary');
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const firstItemRef = useRef<HTMLButtonElement>(null);
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});
  const openedByKeyboard = useRef(false);

  useLayoutEffect(() => {
    if (open && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setMenuStyle({
        position: 'fixed',
        top: rect.bottom + 4,
        right: window.innerWidth - rect.right,
        zIndex: 9999,
      });
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const close = () => onToggle();
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [open, onToggle]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(event.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(event.target as Node) &&
        open
      ) {
        onToggle();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open, onToggle]);

  useEffect(() => {
    if (open && openedByKeyboard.current) {
      firstItemRef.current?.focus();
    }
    if (!open) {
      openedByKeyboard.current = false;
    }
  }, [open]);

  const handleTriggerKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
      e.preventDefault();
      if (!open) {
        openedByKeyboard.current = true;
        onToggle();
      }
    }
    if (e.key === 'Escape' && open) {
      onToggle();
    }
  };

  const handleMenuKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onToggle();
      triggerRef.current?.focus();
      return;
    }
    // Menu pattern: arrows move between enabled items (wrapping), Home/End jump.
    const items = Array.from(
      menuRef.current?.querySelectorAll<HTMLButtonElement>(
        '[role="menuitem"]:not(:disabled)'
      ) ?? []
    );
    if (items.length === 0) return;
    const current = items.indexOf(document.activeElement as HTMLButtonElement);
    const target =
      e.key === 'ArrowDown'
        ? items[(current + 1) % items.length]
        : e.key === 'ArrowUp'
          ? items[(current - 1 + items.length) % items.length]
          : e.key === 'Home'
            ? items[0]
            : e.key === 'End'
              ? items[items.length - 1]
              : undefined;
    if (target) {
      e.preventDefault();
      target.focus();
    }
  };

  /**
   * Runs a menu choice with focus back on the trigger first, so a dialog the
   * choice opens returns focus there when it closes (the item itself is gone).
   */
  const choose = (action: () => void) => {
    triggerRef.current?.focus();
    action();
    onToggle();
  };

  // Escape and arrow keys bubble to the menu's own handler; items only add Tab.
  const handleLastItemKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Tab' && !e.shiftKey) {
      onToggle();
    }
  };

  const handleFirstItemKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Tab' && e.shiftKey) {
      onToggle();
      e.preventDefault();
      triggerRef.current?.focus();
    }
  };

  const t = (
    localStorage.getItem('app_language')?.toLowerCase() === 'es'
      ? loginEs
      : loginEn
  ).simulationCard;

  return (
    <div className="flex flex-col items-center justify-center">
      <button
        ref={triggerRef}
        data-more-info-id={moreInfoId ?? id}
        onClick={onToggle}
        onKeyDown={handleTriggerKeyDown}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Actions"
        className="flex items-center gap-1 p-2 rounded-full hover:bg-gray-100 focus:outline-none focus-visible:border-2 focus-visible:border-orange-400"
      >
        {[0, 1, 2].map((d) => (
          <span
            key={d}
            className="w-1.5 h-1.5 rounded-full bg-gray-500 inline-block"
          />
        ))}
      </button>

      {open &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            aria-label="Actions menu"
            onKeyDown={handleMenuKeyDown}
            style={menuStyle}
            className="bg-white border border-slate-200 rounded-xl shadow-lg w-50 overflow-hidden p-1 flex flex-col gap-0.5"
          >
            <button
              ref={firstItemRef}
              role="menuitem"
              onClick={() => choose(() => onAssignClass(id))}
              onKeyDown={handleFirstItemKeyDown}
              className="w-full text-left px-4 py-2.5 text-[13px] text-slate-700 rounded-lg hover:bg-slate-50 transition-colors focus:outline-none focus:ring-2 focus:ring-inset focus:ring-orange-400"
            >
              {t.assign}
            </button>

            <div className={fromBundle ? 'cursor-not-allowed' : ''}>
              <button
                role="menuitem"
                disabled={removingId === id || fromBundle === true}
                onClick={() =>
                  choose(() => {
                    if (!fromBundle) onRemoveFromLibrary?.(id);
                  })
                }
                className={`w-full text-left px-4 py-2.5 text-[13px] text-slate-700 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-inset focus:ring-orange-400 disabled:opacity-50 ${fromBundle ? 'pointer-events-none opacity-50' : 'hover:bg-slate-50 cursor-pointer'}`}
              >
                <span className="text-red-500">
                  {removingId === id ? t.removing : t.removeFromLibrary}
                </span>
              </button>
            </div>
            <button
              role="menuitem"
              onClick={() => choose(() => onMoreInfo(id))}
              onKeyDown={handleLastItemKeyDown}
              aria-label={
                simulationTitle
                  ? tLibrary('card.moreInfoAbout', {
                      title: simulationTitle.trim(),
                    })
                  : undefined
              }
              className="w-full text-left px-4 py-2.5 text-[13px] text-slate-700 rounded-lg hover:bg-slate-50 transition-colors focus:outline-none focus:ring-2 focus:ring-inset focus:ring-orange-400"
            >
              {t.moreDetails}
            </button>
          </div>,
          document.body
        )}
    </div>
  );
};

export default ActionMenu;
