import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import loginEn from "../../../locales/auth/login/en.json";
import loginEs from "../../../locales/auth/login/es.json";

interface ActionMenuProps {
  id: string;
  open: boolean;
  onToggle: () => void;
  onAssignClass: (id: string) => void;
  onMoreInfo: (id: string) => void;
  onRemoveFromLibrary?: (id: string) => void;
  removingId?: string | null;
  fromBundle?: boolean;
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
}) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const firstItemRef = useRef<HTMLButtonElement>(null);
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});
  const openedByKeyboard = useRef(false);

  useLayoutEffect(() => {
    if (open && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setMenuStyle({
        position: "fixed",
        top: rect.bottom + 4,
        right: window.innerWidth - rect.right,
        zIndex: 9999,
      });
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const close = () => onToggle();
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
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
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
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
    if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) {
        openedByKeyboard.current = true;
        onToggle();
      }
    }
    if (e.key === "Escape" && open) {
      onToggle();
    }
  };

  const handleMenuKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      onToggle();
      triggerRef.current?.focus();
    }
  };

  const handleLastItemKeyDown = (e: React.KeyboardEvent) => {
    handleMenuKeyDown(e);
    if (e.key === "Tab" && !e.shiftKey) {
      onToggle();
    }
  };

  const handleFirstItemKeyDown = (e: React.KeyboardEvent) => {
    handleMenuKeyDown(e);
    if (e.key === "Tab" && e.shiftKey) {
      onToggle();
      e.preventDefault();
      triggerRef.current?.focus();
    }
  };

  const t = (
    localStorage.getItem("app_language")?.toLowerCase() === "es"
      ? loginEs
      : loginEn
  ).simulationCard;

  return (
    <div className="flex flex-col items-center justify-center">
      <button
        ref={triggerRef}
        onClick={onToggle}
        onKeyDown={handleTriggerKeyDown}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Actions"
        className="flex items-center gap-1 p-2 rounded-full hover:bg-gray-100 focus:outline-none focus-visible:border-2 focus-visible:border-primary-400"
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
              onClick={() => {
                onAssignClass(id);
                onToggle();
              }}
              onKeyDown={handleFirstItemKeyDown}
              className="w-full text-left px-4 py-2.5 text-[13px] text-slate-700 rounded-lg hover:bg-slate-50 transition-colors focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary-400"
            >
              {t.assign}
            </button>

            <div className={fromBundle ? "cursor-not-allowed" : ""}>
              <button
                role="menuitem"
                disabled={removingId === id || fromBundle === true}
                onClick={() => {
                  if (!fromBundle) onRemoveFromLibrary?.(id);
                  onToggle();
                }}
                onKeyDown={handleMenuKeyDown}
                className={`w-full text-left px-4 py-2.5 text-[13px] text-slate-700 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary-400 disabled:opacity-50 ${fromBundle ? "pointer-events-none opacity-50" : "hover:bg-slate-50 cursor-pointer"}`}
              >
                <span className="text-red-500">
                  {removingId === id ? t.removing : t.removeFromLibrary}
                </span>
              </button>
            </div>
            <button
              role="menuitem"
              onClick={() => {
                onMoreInfo(id);
                onToggle();
              }}
              onKeyDown={handleLastItemKeyDown}
              className="w-full text-left px-4 py-2.5 text-[13px] text-slate-700 rounded-lg hover:bg-slate-50 transition-colors focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary-400"
            >
              {t.moreDetails}
            </button>
          </div>,
          document.body,
        )}
    </div>
  );
};

export default ActionMenu;
