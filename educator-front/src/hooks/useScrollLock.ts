import { useEffect } from 'react';

let lockCount = 0;
let scrollEl: HTMLElement | null = null;
let savedOverflow = '';
let savedPaddingRight = '';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getScrollTarget(): HTMLElement {
  return document.querySelector<HTMLElement>('main') ?? document.body;
}

const MODAL_SELECTOR = '[aria-modal="true"]';

// ─── Event interceptors (defined once, reused across lock/unlock calls) ────────

function preventWheel(e: WheelEvent): void {
  const target = e.target as Element | null;
  // Allow scrolling inside the modal itself
  if (target?.closest(MODAL_SELECTOR)) return;
  // Allow scrolling inside portaled dropdowns (rendered outside the modal DOM)
  if (target?.closest('[role="listbox"]') || target?.closest('[data-select-dropdown]')) return;
  e.preventDefault();
  e.stopPropagation();
}

function preventTouchMove(e: TouchEvent): void {
  const target = e.target as Element | null;
  if (target?.closest(MODAL_SELECTOR)) return;
  if (target?.closest('[role="listbox"]') || target?.closest('[data-select-dropdown]')) return;
  e.preventDefault();
}

// ─── Lock / unlock ────────────────────────────────────────────────────────────

function applyScrollLock(): void {
  lockCount++;
  if (lockCount !== 1) return;

  scrollEl = getScrollTarget();
  savedOverflow = scrollEl.style.overflow;
  savedPaddingRight = scrollEl.style.paddingRight;

  const scrollbarWidth = scrollEl.offsetWidth - scrollEl.clientWidth;
  if (scrollbarWidth > 0) {
    scrollEl.style.paddingRight = `${scrollbarWidth}px`;
  }
  scrollEl.style.overflow = 'hidden';

  document.addEventListener('wheel', preventWheel, { passive: false });
  document.addEventListener('touchmove', preventTouchMove, { passive: false });
}

function releaseScrollLock(): void {
  lockCount = Math.max(0, lockCount - 1);
  if (lockCount !== 0) return;

  if (scrollEl) {
    scrollEl.style.overflow = savedOverflow;
    scrollEl.style.paddingRight = savedPaddingRight;
    scrollEl = null;
  }
  savedOverflow = '';
  savedPaddingRight = '';

  document.removeEventListener('wheel', preventWheel);
  document.removeEventListener('touchmove', preventTouchMove);
}

// ─── Public hook ──────────────────────────────────────────────────────────────

export function useScrollLock(active: boolean): void {
  useEffect(() => {
    if (!active) return;

    applyScrollLock();
    return releaseScrollLock;
  }, [active]);
}
