import { useCallback, useMemo, useState } from 'react';

interface ReportSelectionOptions {
  // Paged tables: keep ids from other pages selected. `reportIds` is then the current page.
  keepOffscreen?: boolean;
}

/**
 * Row / select-all selection for a report table, keyed by report id so it survives re-sorts
 * and refreshes. Ids that leave the table are dropped unless `keepOffscreen` is set, in which
 * case select-all and the partial state refer to the rows currently shown.
 */
export function useReportSelection(
  reportIds: string[],
  { keepOffscreen = false }: ReportSelectionOptions = {}
) {
  const [picked, setPicked] = useState<Set<string>>(() => new Set());

  // Without keepOffscreen, only ids still in the table count, so a refresh never leaves
  // hidden rows selected.
  const selectedIds = useMemo(() => {
    if (keepOffscreen) return [...picked];
    const visible = new Set(reportIds);
    return [...picked].filter((id) => visible.has(id));
  }, [picked, reportIds, keepOffscreen]);

  const selectedHere = reportIds.filter((id) => picked.has(id)).length;
  const total = reportIds.length;
  const isAllSelected = total > 0 && selectedHere === total;
  const isPartial = selectedHere > 0 && !isAllSelected;

  const toggle = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // Select-all acts on the rows shown; selections elsewhere are kept.
  const toggleAll = () =>
    setPicked((prev) => {
      const next = new Set(prev);
      reportIds.forEach((id) =>
        isAllSelected ? next.delete(id) : next.add(id)
      );
      return next;
    });

  // Stable, so callers can clear from an effect (e.g. when a filter changes).
  const clear = useCallback(() => setPicked(new Set()), []);

  return {
    selectedIds,
    isSelected: (id: string) =>
      picked.has(id) && (keepOffscreen || reportIds.includes(id)),
    isAllSelected,
    isPartial,
    toggle,
    toggleAll,
    clear,
  };
}
