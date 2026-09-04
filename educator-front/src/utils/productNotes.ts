/**
 * Admin-local product notes: a custom Unit Name and a set of associated
 * educators per licensed unit (keyed by its entitlement key). This is purely
 * organisational bookkeeping for the admin to track where a product is used —
 * it has NO effect on entitlement, seats, or hours. There is no backend for
 * this yet, so it persists in localStorage.
 */

export interface ProductNote {
  unitName?: string;
  educatorIds: string[];
  /**
   * Avatar seats allocated per educator on this specific product license
   * (educatorId → seats). Admin-local only; avatar (online) products only.
   */
  allocations?: Record<string, number>;
}

const STORAGE_KEY = 'product_notes_v1';

export function getAllProductNotes(): Record<string, ProductNote> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, ProductNote>) : {};
  } catch {
    return {};
  }
}

export function getProductNote(entitlementKey: string): ProductNote {
  return getAllProductNotes()[entitlementKey] ?? { educatorIds: [] };
}

export function saveProductNote(entitlementKey: string, note: ProductNote): void {
  if (typeof window === 'undefined') return;
  const all = getAllProductNotes();
  all[entitlementKey] = {
    unitName: note.unitName?.trim() || undefined,
    educatorIds: note.educatorIds,
    allocations: note.allocations,
  };
  writeAll(all);
}

/** Avatar seats allocated to an educator on a specific product license. */
export function getEducatorProductAllocation(
  educatorId: string,
  entitlementKey: string,
): number {
  const n = getAllProductNotes()[entitlementKey];
  return n?.allocations?.[educatorId] ?? 0;
}

/** Set (or clear when 0) the avatar seats allocated to an educator on a license. */
export function setEducatorProductAllocation(
  educatorId: string,
  entitlementKey: string,
  seats: number,
): void {
  if (typeof window === 'undefined') return;
  const all = getAllProductNotes();
  const note: ProductNote = all[entitlementKey] ?? { educatorIds: [] };
  const allocations = { ...(note.allocations ?? {}) };
  if (seats > 0) allocations[educatorId] = seats;
  else delete allocations[educatorId];
  all[entitlementKey] = { ...note, allocations };
  writeAll(all);
}

/** Bulk set an educator's per-product avatar-seat allocations (by product key). */
export function setEducatorProductAllocations(
  educatorId: string,
  allocationByKey: Record<string, number>,
): void {
  Object.entries(allocationByKey).forEach(([key, seats]) =>
    setEducatorProductAllocation(educatorId, key, seats),
  );
}

function writeAll(all: Record<string, ProductNote>): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch {
    /* ignore quota / serialization errors */
  }
}

/** Entitlement keys this educator is currently associated with (reverse lookup). */
export function getProductKeysForEducator(educatorId: string): string[] {
  const all = getAllProductNotes();
  return Object.keys(all).filter((k) => all[k].educatorIds.includes(educatorId));
}

/**
 * Reconcile one educator's product associations against the full set of product
 * keys: the educator is added to notes whose key is in `selectedKeys` and
 * removed from all others in `allKeys`.
 */
export function setEducatorProductAssociations(
  educatorId: string,
  selectedKeys: string[],
  allKeys: string[],
): void {
  if (typeof window === 'undefined') return;
  const all = getAllProductNotes();
  const selected = new Set(selectedKeys);
  allKeys.forEach((key) => {
    const note = all[key] ?? { educatorIds: [] };
    const has = note.educatorIds.includes(educatorId);
    const shouldHave = selected.has(key);
    if (shouldHave && !has) {
      note.educatorIds = [...note.educatorIds, educatorId];
    } else if (!shouldHave && has) {
      note.educatorIds = note.educatorIds.filter((id) => id !== educatorId);
    }
    all[key] = note;
  });
  writeAll(all);
}
