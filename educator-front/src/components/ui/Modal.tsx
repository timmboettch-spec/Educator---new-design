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

// Open modals, oldest first; the last one is on top.
const openModalStack: symbol[] = [];

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
  subtitle?: string;
  footer?: React.ReactNode;
  /** Id of an element inside `children` that names the dialog when `title` is empty. */
  ariaLabelledBy?: string;
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
  ariaLabelledBy,
}) => {
  const modalRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });
  useScrollLock(isOpen);
  // Move focus in on open; put it back where it was on close. The cleanup runs
  // both when `isOpen` turns false and when a parent unmounts the modal
  // outright (e.g. `if (!isOpen) return null`), so focus is never stranded.
  useEffect(() => {
    if (!isOpen) return;
    const previous = document.activeElement;
    const frame = requestAnimationFrame(() => {
      modalRef.current?.focus();
    });
    return () => {
      cancelAnimationFrame(frame);
      // Skip an opener that is gone, e.g. after closing to navigate away.
      if (previous instanceof HTMLElement && previous.isConnected) {
        previous.focus();
      }
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    // Only the topmost open modal handles keys and focus, so a dialog opened on
    // top (e.g. a confirm) doesn't also close or steal focus from the one below.
    const token = Symbol('modal');
    openModalStack.push(token);
    const isTopmost = () => openModalStack[openModalStack.length - 1] === token;

    // Dropdowns are portaled to <body> but belong to a field inside the modal:
    // Escape there closes the dropdown, and focus there stays put.
    const isInFieldDropdown = (target: EventTarget | null) =>
      target instanceof Element && !!target.closest('[data-select-dropdown]');

    const handleEscape = (e: KeyboardEvent) => {
      if (!isTopmost()) return;
      if (e.key === 'Escape' && !isInFieldDropdown(e.target)) {
        onCloseRef.current();
      }
    };

    const handleTab = (e: KeyboardEvent) => {
      if (!isTopmost()) return;
      if (e.key !== 'Tab' || !modalRef.current) return;
      const focusable = Array.from(
        modalRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTORS)
      );
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
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

    // Guards against another body-level focus trap fighting this one: focus() dispatches
    // focusin synchronously, so without this two traps recurse until the stack overflows.
    let redirectingFocus = false;
    const handleFocusIn = (e: FocusEvent) => {
      if (redirectingFocus || !isTopmost()) return;
      if (isInFieldDropdown(e.target)) return;
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
        e.stopPropagation();
        const first =
          modalRef.current.querySelector<HTMLElement>(FOCUSABLE_SELECTORS);
        redirectingFocus = true;
        first?.focus();
        redirectingFocus = false;
      }
    };

    window.addEventListener('keydown', handleEscape);
    window.addEventListener('keydown', handleTab);
    document.addEventListener('focusin', handleFocusIn, true);
    return () => {
      window.removeEventListener('keydown', handleEscape);
      window.removeEventListener('keydown', handleTab);
      document.removeEventListener('focusin', handleFocusIn, true);
      openModalStack.splice(openModalStack.indexOf(token), 1);
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabelledBy ? undefined : title || undefined}
        aria-labelledby={ariaLabelledBy}
        tabIndex={-1}
        className={cn(
          'bg-white rounded-2xl w-full max-w-md shadow-xl animate-in fade-in zoom-in duration-200 flex flex-col overflow-hidden',
          'max-h-[min(calc(100vh-2rem),calc(100dvh-2rem))]',
          className
        )}
      >
        {title && (
          <div className="mb-4 px-6 pt-6 shrink-0">
            <div className="relative flex items-center justify-center">
              <h2 className="text-lg font-semibold text-primary-500 text-center">
                {title}
              </h2>

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

            {subtitle && (
              <p className="text-[14px] text-gray-500 mt-2 text-center">
                {subtitle}
              </p>
            )}
          </div>
        )}

        <div
          className={cn(
            // The scrollbar only appears when the content overflows;
            // `scrollbar-gutter:stable` reserves its space so content doesn't
            // shift when it does.
            'flex-1 overflow-y-auto overscroll-contain px-6 pb-2 [scrollbar-gutter:stable]',
            !title && 'pt-6',
            contentClassName
          )}
        >
          {children}
        </div>
        {footer && <div className="mt-4 px-6 pb-6 shrink-0">{footer}</div>}
      </div>
    </div>,
    document.body
  );
};

export default Modal;
