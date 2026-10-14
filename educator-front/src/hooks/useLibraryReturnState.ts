import { useEffect, useState } from 'react';

const STORAGE_KEY = 'simulationLibrary:return';

/**
 * Library state that lives outside the URL (search, selection, scroll
 * and the control that opened the details page), kept for the round trip to
 * a simulation's details so Back lands the educator exactly where they were.
 * View and filters already survive in the URL query string.
 */
export interface LibraryReturnState {
  search: string;
  selectedIds: string[];
  scrollTop: number;
  /** `data-more-info-id` of the control to refocus on return. */
  focusId: string | null;
}

/** Router state flag set by the details page's Back navigation. */
export interface LibraryReturnNavState {
  restoreLibrary?: boolean;
  /** Tells the layout not to reset the scroll position on this navigation. */
  preserveScroll?: boolean;
}

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string');

const parseReturnState = (raw: string | null): LibraryReturnState | null => {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object') return null;
    const v = value as Record<string, unknown>;
    if (typeof v.search !== 'string' || !isStringArray(v.selectedIds)) {
      return null;
    }
    return {
      search: v.search,
      selectedIds: v.selectedIds,
      scrollTop: typeof v.scrollTop === 'number' ? v.scrollTop : 0,
      focusId: typeof v.focusId === 'string' ? v.focusId : null,
    };
  } catch {
    return null;
  }
};

/** Saves the library's off-URL state just before opening a simulation's details. */
export function saveLibraryReturnState(state: LibraryReturnState): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage unavailable (private mode / quota): Back still restores the URL state.
  }
}

/**
 * Reads the saved state once on mount, only when arriving via the details
 * page's Back (`shouldRestore`), and always clears it so a later visit from
 * the sidebar starts fresh.
 */
export function useLibraryReturnState(
  shouldRestore: boolean
): LibraryReturnState | null {
  const [restored] = useState(() => {
    try {
      return shouldRestore
        ? parseReturnState(sessionStorage.getItem(STORAGE_KEY))
        : null;
    } catch {
      return null;
    }
  });

  useEffect(() => {
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // Nothing to clear.
    }
  }, []);

  return restored;
}

/** Nearest scrollable ancestor — the dashboard `<main>`, or the document. */
export function getScrollParent(el: HTMLElement | null): HTMLElement {
  let node = el?.parentElement ?? null;
  while (node) {
    const { overflowY } = getComputedStyle(node);
    if (
      (overflowY === 'auto' || overflowY === 'scroll') &&
      node.scrollHeight > node.clientHeight
    ) {
      return node;
    }
    node = node.parentElement;
  }
  return (document.scrollingElement as HTMLElement | null) ?? document.body;
}
