import { useCallback, useEffect, useMemo, useState } from 'react';

/**
 * Multi-select for the library's grid and list views. `visibleIds` is the list
 * currently shown (after filters and search): select-all covers exactly those,
 * and any selected item that stops being shown is dropped so the selected
 * count always matches what the educator can see. The selection lives only for
 * this page visit, seeded from `initialSelected` when returning from a
 * simulation's details. Pruning waits for `isLoaded`, so a restored selection
 * survives while the list is still loading.
 */
export function useLibrarySelection(
  visibleIds: string[],
  {
    initialSelected = [],
    isLoaded = true,
  }: {
    initialSelected?: string[];
    isLoaded?: boolean;
  } = {}
) {
  const [selectedIds, setSelectedIds] = useState<string[]>(initialSelected);

  const visibleSet = useMemo(() => new Set(visibleIds), [visibleIds]);

  useEffect(() => {
    if (!isLoaded) return;
    setSelectedIds((prev) => {
      const next = prev.filter((id) => visibleSet.has(id));
      return next.length === prev.length ? prev : next;
    });
  }, [visibleSet, isLoaded]);

  const toggle = useCallback(
    (id: string) =>
      setSelectedIds((prev) =>
        prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
      ),
    []
  );

  const selectAll = useCallback(() => setSelectedIds(visibleIds), [visibleIds]);

  const clear = useCallback(() => setSelectedIds([]), []);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  const isSelected = useCallback(
    (id: string) => selectedSet.has(id),
    [selectedSet]
  );

  const allSelected =
    visibleIds.length > 0 && visibleIds.every((id) => selectedSet.has(id));
  const someSelected = selectedIds.length > 0 && !allSelected;

  return {
    selectedIds,
    isSelected,
    toggle,
    selectAll,
    clear,
    allSelected,
    someSelected,
  };
}
