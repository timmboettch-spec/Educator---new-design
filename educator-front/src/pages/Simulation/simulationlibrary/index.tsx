import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Trans, useTranslation } from 'react-i18next';
import { Heart } from 'lucide-react';
import { SearchBar } from '../../../components/common/SearchBar';
import FilterPanel from '../../../components/common/FilterPanel';
import FilterChips from '../../../components/common/FilterChips';
import { toast } from '../../../components/common/Toast';
import { ConfirmDialog } from '../../../components/modal/ConfirmDialog';
import { AddSimulationModal } from '../../../components/modal/AddSimulationModal';
import ErrorState from '../../../components/simulation/ErrorState';
import { LibraryEmptyState } from '../../../components/simulation/LibraryEmptyState';
import { QuickFilters } from '../../../components/simulation/QuickFilters';
import { LibrarySelectionToolbar } from '../../../components/simulation/LibrarySelectionToolbar';
import LoadingState from '../../../components/simulation/LoadingState';
import { InfiniteListFooter } from '../../../components/class/InfiniteListFooter';
import SimulationGrid from '../../../components/simulation/SimulationGrid';
import ViewToggle from '../../../components/simulation/ViewToggle';
import { useInfiniteMyLibrary } from '../../../hooks/useInfiniteMyLibrary';
import type { FilterOptionsField } from '../../../hooks/useClassFilterOptions';
import { useLibraryFilterOptions } from '../../../hooks/useLibraryFilterOptions';
import { useLibraryFilters } from '../../../hooks/useLibraryFilters';
import { useLibrarySelection } from '../../../hooks/useLibrarySelection';
import {
  getScrollParent,
  saveLibraryReturnState,
  useLibraryReturnState,
  type LibraryReturnNavState,
} from '../../../hooks/useLibraryReturnState';
import { buildListMyLibraryParams } from '../../../redux/api/myLibrary/myLibraryService';
import { fetchMyLibrary } from '../../../redux/simulation/MyLibraryRedux';
import { RemoveFromLibraryRequest } from '../../../redux/simulation/RemoveFromLibraryRedux';
import { useAppDispatch } from '../../../store/hooks';
import type { Simulation } from '../../../types/simulation.types';
import {
  LIBRARY_SERVER_FILTER_FIELDS,
  countActiveFilters,
} from '../../../utils/libraryFilters';

const MyLibraryPage: React.FC = () => {
  const { t } = useTranslation('simulationLibrary');
  const { t: tCommon } = useTranslation('common');
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const panelId = useId();
  const pageRef = useRef<HTMLDivElement>(null);
  // Search, sort, selection, scroll and focus saved when "More Info" opened a
  // simulation's details; only restored when coming back via its Back link.
  const navState = location.state as LibraryReturnNavState | null;
  const returnState = useLibraryReturnState(navState?.restoreLibrary === true);

  // The restore flags belong to this one arrival: drop them from the history
  // entry so a later browser Back/Forward to it gets the normal scroll reset.
  const hasNavFlags = Boolean(
    navState?.restoreLibrary || navState?.preserveScroll
  );
  useEffect(() => {
    if (!hasNavFlags) return;
    navigate(`${location.pathname}${location.search}`, {
      replace: true,
      state: null,
    });
    // Mount-only: the flags are read once on arrival.
  }, []);

  // Unit, Target Audience and Required Product Name options, from the BE's
  // dropdown routes.
  const filterOptions = useLibraryFilterOptions();
  const filters = useLibraryFilters({ unitNames: filterOptions.unitNames });
  const [search, setSearch] = useState(returnState?.search ?? '');

  // The list itself is searched, filtered and paged by the API.
  const listParams = useMemo(
    () => buildListMyLibraryParams(filters.applied, search),
    [filters.applied, search]
  );
  // An old link's unit name only becomes a unit id once the units have
  // loaded; until then the request waits rather than send the name as an id.
  const library = useInfiniteMyLibrary(listParams, {
    skip: filters.hasUnresolvedUnit && !filterOptions.isUnitNamesSettled,
  });
  const { rows, total } = library;
  const hasQuery = countActiveFilters(filters.applied) > 0 || !!search.trim();

  const [isAssignOpen, setIsAssignOpen] = useState(false);
  const [assignSimIds, setAssignSimIds] = useState<string[]>([]);
  // Only an assignment started from the bulk selection consumes it; a single
  // card/row "Assign to Class" leaves the educator's selection alone.
  const [isBulkAssign, setIsBulkAssign] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<Simulation | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  // Select-all covers the rows loaded so far, not the pages still to come.
  const visibleIds = useMemo(() => rows.map((s) => s.id), [rows]);
  // Real library data (a failed load is not data): until then an empty list
  // must not prune a restored selection.
  const hasLibraryData = library.hasLoaded;
  const selection = useLibrarySelection(visibleIds, {
    initialSelected: returnState?.selectedIds,
    isLoaded: hasLibraryData,
  });

  /** A panel field's options: fixed values, or one of the BE's dropdowns. */
  const getFieldOptions = (
    field: (typeof LIBRARY_SERVER_FILTER_FIELDS)[number]
  ): FilterOptionsField => {
    switch (field) {
      case 'unit':
        return filterOptions.unitField;
      case 'targetAudience':
        return filterOptions.targetAudienceField;
      case 'productName':
        return filterOptions.productNameField;
      default:
        return { options: filters.fixedOptions[field] };
    }
  };

  const clearFiltersAndSearch = () => {
    filters.resetFilters();
    setSearch('');
  };

  const openAssign = (ids: string[], fromSelection: boolean) => {
    if (ids.length === 0) return;
    setAssignSimIds(ids);
    setIsBulkAssign(fromSelection);
    setIsAssignOpen(true);
  };

  // No refetch here: assigning doesn't change what's in the library, and the
  // modal already refreshes it after a successful assignment.
  const handleAssignClose = () => setIsAssignOpen(false);

  const goToDetails = (id: string) => {
    const opener =
      document.activeElement instanceof HTMLElement
        ? document.activeElement.dataset.moreInfoId
        : undefined;
    saveLibraryReturnState({
      search,
      selectedIds: selection.selectedIds,
      scrollTop: getScrollParent(pageRef.current).scrollTop,
      focusId: opener ?? id,
    });
    navigate(`/simulationdetails/${id}`, {
      state: {
        fromLibrary: true,
        simulationId: id,
        returnTo: `${location.pathname}${location.search}`,
      },
    });
  };

  const confirmRemove = async () => {
    if (!removeTarget || removingId) return;
    const { id } = removeTarget;
    setRemovingId(id);
    try {
      // The request refreshes the list and its dropdowns itself, and drops
      // the assign modal's out-of-date full copy.
      await dispatch(RemoveFromLibraryRequest({ scenario_id: id })).unwrap();
      toast.success(t('remove.success'));
      void dispatch(fetchMyLibrary());
    } catch {
      toast.error(t('remove.failed'));
    } finally {
      setRemovingId(null);
      setRemoveTarget(null);
    }
  };

  // Once the list is back on screen, put the scroll position and focus back
  // where they were when "More Info" was used.
  // If that control is gone (e.g. the restored search now matches nothing),
  // focus falls back to the page content landmark, as on any navigation.
  // A failed load gets that fallback focus too, but keeps the restore pending
  // so a successful Retry still brings everything back.
  const hasRestoredRef = useRef(false);
  useEffect(() => {
    if (!returnState || hasRestoredRef.current) return;
    if (!hasLibraryData) {
      if (library.isLoadError) {
        pageRef.current
          ?.closest<HTMLElement>('main')
          ?.focus({ preventScroll: true });
      }
      return;
    }
    hasRestoredRef.current = true;
    getScrollParent(pageRef.current).scrollTop = returnState.scrollTop;
    const opener = Array.from(
      pageRef.current?.querySelectorAll<HTMLElement>('[data-more-info-id]') ??
        []
    ).find((el) => el.dataset.moreInfoId === returnState.focusId);
    const target = opener ?? pageRef.current?.closest<HTMLElement>('main');
    target?.focus({ preventScroll: true });
  }, [returnState, hasLibraryData, library.isLoadError]);

  // A search or filter change starts a new list, so it shows the skeleton too;
  // a refresh of the same list keeps the rows on screen.
  const isInitialLoad = library.isInitialLoading;
  const hasFailed = library.isLoadError;
  const hasResults = rows.length > 0;
  const isLibraryEmpty =
    library.hasLoaded && !hasResults && !hasQuery && !hasFailed;

  const renderContent = () => {
    if (isInitialLoad) {
      return (
        <LoadingState
          count={6}
          layout={filters.viewMode}
          label={t('states.loading')}
        />
      );
    }
    if (hasFailed) {
      return (
        <ErrorState
          title={t('states.errorTitle')}
          message={t('states.errorBody')}
          retryLabel={t('states.retry')}
          onRetry={() => void library.refetch()}
        />
      );
    }
    if (isLibraryEmpty) return <LibraryEmptyState variant="empty" />;
    if (!hasResults) {
      return (
        <LibraryEmptyState
          variant="noMatches"
          onClearFilters={clearFiltersAndSearch}
        />
      );
    }
    return (
      <>
        <SimulationGrid
          simulations={rows}
          viewMode={filters.viewMode}
          isSelected={selection.isSelected}
          onToggleSelect={selection.toggle}
          allSelected={selection.allSelected}
          someSelected={selection.someSelected}
          onToggleSelectAll={
            selection.allSelected ? selection.clear : selection.selectAll
          }
          onAssignClass={(id) => openAssign([id], false)}
          onMoreInfo={goToDetails}
          onRemoveFromLibrary={setRemoveTarget}
          removingId={removingId}
        />
        {/* Keyed by the query so a new search or filter doesn't announce the
            previous list's "more loaded" count. */}
        <InfiniteListFooter
          key={JSON.stringify(listParams)}
          itemCount={rows.length}
          hasNextPage={library.hasNextPage}
          isFetchingNextPage={library.isFetchingNextPage}
          isFetching={library.isFetching}
          isFetchNextPageError={library.isFetchNextPageError}
          fetchNextPage={() => void library.fetchNextPage()}
          isRefreshError={library.isRefreshError}
          refetch={() => void library.refetch()}
          endMessage={t('states.endOfList')}
          loadedMoreMessage={(count) => t('states.loadedMore', { count })}
        />
      </>
    );
  };

  return (
    <div
      ref={pageRef}
      className="p-4 sm:p-6 min-h-full font-sans text-text-primary"
    >
      {/* Row 1: page title + grid/list toggle. */}
      <div className="flex items-start justify-between gap-3 mb-2">
        <h1 className="text-xl font-bold text-primary-500 mb-0.5">
          {t('title')}
        </h1>
        <ViewToggle
          viewMode={filters.viewMode}
          onViewModeChange={filters.setViewMode}
        />
      </div>

      {/* Row 2: caption + search + result count. */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-3">
        <h2 className="text-lg sm:text-xl font-bold text-neutral-strong sm:flex-shrink-0">
          {tCommon('simulationFilters.caption')}
        </h2>
        <div className="w-full sm:flex-1 min-w-0 sm:max-w-md sm:ml-auto">
          <SearchBar
            value={search}
            onSearch={setSearch}
            placeholder={t('searchPlaceholder')}
            debounceMs={300}
          />
        </div>
        <span
          className="text-sm text-gray-500 flex-shrink-0"
          aria-live="polite"
          aria-atomic="true"
        >
          {total !== undefined && t('resultCount', { count: total })}
        </span>
      </div>

      <QuickFilters
        isActive={filters.isQuickActive}
        onToggle={filters.toggleQuick}
        fieldLabel={filters.fieldLabel}
        valueLabel={filters.valueLabel}
        filterButton={{
          activeCount: filters.activeCount,
          isPanelOpen: filters.isPanelOpen,
          onTogglePanel: filters.togglePanel,
          panelId,
        }}
      />

      {filters.isPanelOpen && (
        <div id={panelId}>
          <FilterPanel
            title={tCommon('simulationFilters.panel.title')}
            resetLabel={tCommon('simulationFilters.panel.reset')}
            applyLabel={tCommon('simulationFilters.panel.apply')}
            noFiltersMessage={tCommon('simulationFilters.panel.noneApplied')}
            onClose={filters.closePanel}
            onApply={filters.applyPanel}
            onReset={filters.resetFilters}
            isApplyDisabled={!filters.canApply}
            fields={LIBRARY_SERVER_FILTER_FIELDS.map((field) => ({
              label: filters.fieldLabel(field),
              placeholder: tCommon(
                'simulationFilters.panel.selectPlaceholder',
                {
                  field: filters.fieldLabel(field),
                }
              ),
              multiple: true as const,
              searchable: true,
              ...getFieldOptions(field),
              values: filters.pending[field],
              onValuesChange: (values: string[]) =>
                filters.setPendingField(field, values),
              error: filters.pendingErrors[field],
              // "3 selected" rather than a chip per value: a long selection
              // would otherwise stretch the panel.
              summarize: (count: number) =>
                tCommon('simulationFilters.panel.selected', { count }),
            }))}
          />
        </div>
      )}

      {filters.chips.length > 0 && (
        <FilterChips
          filters={filters.chips}
          onRemoveFilter={filters.removeChip}
          onClearAll={filters.resetFilters}
        />
      )}

      {hasResults && !hasFailed && (
        <LibrarySelectionToolbar
          visibleCount={rows.length}
          selectedCount={selection.selectedIds.length}
          allSelected={selection.allSelected}
          onSelectAll={selection.selectAll}
          onClear={selection.clear}
          onAssign={() => openAssign(selection.selectedIds, true)}
        />
      )}

      {renderContent()}

      <AddSimulationModal
        isOpen={isAssignOpen}
        onClose={handleAssignClose}
        onAssigned={isBulkAssign ? selection.clear : undefined}
        simulationIds={assignSimIds}
        // The library isn't a class: there are no existing class assignments
        // to check against here.
        simulations={[]}
      />

      <ConfirmDialog
        isOpen={removeTarget !== null}
        onClose={() => setRemoveTarget(null)}
        onConfirm={() => void confirmRemove()}
        variant="compact"
        icon={
          <Heart
            size={16}
            className="text-primary-500"
            fill="currentColor"
            aria-hidden="true"
          />
        }
        title={t('remove.confirmTitle')}
        message={
          <Trans
            t={t}
            i18nKey="remove.confirmBody"
            values={{ title: removeTarget?.title.trim() ?? '' }}
            components={{
              name: <span className="font-medium text-gray-700" />,
            }}
          />
        }
        confirmText={t('remove.confirm')}
        cancelText={t('remove.cancel')}
        isLoading={removingId !== null}
        loadingText={t('remove.removing')}
      />
    </div>
  );
};

export default MyLibraryPage;
