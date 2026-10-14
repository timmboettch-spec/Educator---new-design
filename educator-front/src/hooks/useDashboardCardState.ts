import { useCallback, useState } from 'react';
import { getParsedUser } from '@/utils/storage';
import { getEducatorId } from '@/utils/normalizeAuthUser';

export type DashboardCardId =
  'notifications' | 'alerts' | 'schools' | 'products' | 'chart';

const STORAGE_PREFIX = 'rwai_dashboard_cards:';

const storageKey = () => {
  const userId = getEducatorId(getParsedUser());
  return userId ? `${STORAGE_PREFIX}${userId}` : null;
};

const readCards = (key: string): Record<string, unknown> => {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(key) ?? '{}');
    return parsed && typeof parsed === 'object'
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
};

/**
 * A dashboard card's open/collapsed state, remembered per person in this browser
 * (keyed by the signed-in user's id). Falls back to `defaultOpen` when there's no
 * user or storage is unavailable.
 */
export function useDashboardCardState(
  cardId: DashboardCardId,
  defaultOpen: boolean
) {
  const [open, setOpenState] = useState(() => {
    const key = storageKey();
    const saved = key ? readCards(key)[cardId] : undefined;
    return typeof saved === 'boolean' ? saved : defaultOpen;
  });

  const setOpen = useCallback(
    (next: boolean | ((isOpen: boolean) => boolean)) => {
      setOpenState((current) => {
        const value = typeof next === 'function' ? next(current) : next;
        const key = storageKey();
        if (key) {
          try {
            localStorage.setItem(
              key,
              JSON.stringify({ ...readCards(key), [cardId]: value })
            );
          } catch {
            // Storage is optional; the card still toggles for this visit.
          }
        }
        return value;
      });
    },
    [cardId]
  );

  return [open, setOpen] as const;
}
