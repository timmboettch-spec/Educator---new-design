import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

import { cn } from '../../lib/utils';
import { useScrollLock } from '../../hooks/useScrollLock';

const FOCUSABLE_SELECTORS = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([tabindex="-1"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
  subtitle?: string;
  footer?: React.ReactNode;
}

const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  className,
  contentClassName,
  footer,
}) => {
  const modalRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });
  useScrollLock(isOpen);
  useEffect(() => {
    if (!isOpen) return;
    previousFocusRef.current = document.activeElement as HTMLElement;
    requestAnimationFrame(() => {
      modalRef.current?.focus();
    });
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen && previousFocusRef.current) {
      previousFocusRef.current.focus();
      previousFocusRef.current = null;
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current();
    };

    const handleTab = (e: KeyboardEvent) => {
      if (e.key !== 'Tab' || !modalRef.current) return;
      const focusable = Array.from(
        modalRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTORS),
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    const handleFocusIn = (e: FocusEvent) => {
      const target = e.target as HTMLElement | null;
      // Allow focus inside portaled dropdowns (rendered outside the modal DOM,
      // e.g. Select/MultiSelect menus) — otherwise the trap steals focus from
      // their search inputs on every keystroke.
      if (target?.closest?.("[data-select-dropdown]")) return;
      if (modalRef.current && !modalRef.current.contains(target as Node)) {
        e.stopPropagation();
        const first = modalRef.current.querySelector<HTMLElement>(FOCUSABLE_SELECTORS);
        first?.focus();
      }
    };

    window.addEventListener('keydown', handleEscape);
    window.addEventListener('keydown', handleTab);
    document.addEventListener('focusin', handleFocusIn, true);
    return () => {
      window.removeEventListener('keydown', handleEscape);
      window.removeEventListener('keydown', handleTab);
      document.removeEventListener('focusin', handleFocusIn, true);
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-label={title || undefined}
        tabIndex={-1}
        className={cn(
          'bg-white rounded-2xl w-full max-w-md shadow-xl animate-in fade-in zoom-in duration-200 flex flex-col overflow-hidden',
          'max-h-[min(calc(100vh-2rem),calc(100dvh-2rem))]',
          className,
        )}
      >
        {title && (
          <div className="mb-4 px-6 pt-6 shrink-0">
            <div className="relative flex items-center justify-center">
              <h2 className="text-lg font-semibold text-primary-500 text-center">{title}</h2>

              <button
                type="button"
                onClick={onClose}
                className="absolute right-0 text-gray-500 hover:text-gray-600 transition-colors"
                aria-label="Close"
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            {subtitle && <p className="text-[14px] text-gray-500 mt-2 text-center">{subtitle}</p>}
          </div>
        )}

        <div
          className={cn(
            // Brand-styled scrollbar appears ONLY when the content actually
            // overflows (overflow-y-auto) — small dialogs like the sign-out
            // confirm show no scrollbar or scroll arrows. `scrollbar-gutter:stable`
            // reserves the gutter so content doesn't shift when it does appear.
            'flex-1 overflow-y-auto overscroll-contain px-6 pb-2',
            ' [scrollbar-gutter:stable]',
            !title && 'pt-6',
            contentClassName,
          )}
        >
          {children}
        </div>
        {footer && <div className="mt-4 px-6 pb-6 shrink-0">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
};

export default Modal;
