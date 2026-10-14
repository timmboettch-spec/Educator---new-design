import { useEffect, useRef, useState } from 'react';
import dayjs from 'dayjs';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useMarkAllSimReports } from '../../hooks/useMarkAllSimReports';
import { useClassLmsLinkage } from '../../hooks/useClassLmsLinkage';
import { useClassSimulations } from '../../hooks/useClassSimulations';
import { useInlineSimDateEdit } from '../../hooks/useInlineSimDateEdit';
import {
  FetchSimulationsByClass,
  selectSimulationsByClassId,
} from '../../redux/class/GetSimsRedux';
import { clearAddSimulationState } from '../../redux/dashboard/simulationlibrary/addsimulationredux';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { getAssignmentTimeStatus, simIdOf } from '../../utils/simAssignment';
import {
  SKELETON_INITIAL_ROW_COUNT,
  SKELETON_REFETCH_ROW_COUNT,
} from '../../utils/constants/skeleton';
import { toast } from '../common/Toast';
import { SkeletonRows } from '../ui/Skeleton';
import { InfiniteListFooter, LoadErrorMessage } from './InfiniteListFooter';
import type { SimulationItem, SimulationReport, Student } from '@/types';
import { SimActionsMenu } from './simsubtable/SimActionsMenu';
import {
  CLOSED_SIM_MODALS,
  SimAssignmentModals,
  type SimModalState,
} from './simsubtable/SimAssignmentModals';
import { SimRow } from './simsubtable/SimRow';
import { SimsTableHeader } from './simsubtable/SimsTableHeader';
import type { AssignContextClass } from '../../types/simulationAssignment.types';
import type { ClassAvailability } from '../../utils/classUtils';
import { ClassAvailabilityTip } from './ClassAvailabilityTip';

interface SimsExpandedRowProps {
  classId: string;
  isLmsLinked?: boolean;
  className?: string;
  /** The class, for the assign modal's pre-selected school and class. */
  assignContext: AssignContextClass;
  schoolName?: string;
  simulations?: SimulationItem[];
  reports?: SimulationReport[];
  students: Student[];
  isClassArchived?: boolean;
  /** Ended classes can't be assigned to; inactive ones get a note. */
  availability?: ClassAvailability;
  targetSimulationId?: string;
  defaultSimReportsId?: string;
}

// Modals that open for one selected assignment.
type SimPickerModal =
  | 'editSim'
  | 'exportSim'
  | 'reportSim'
  | 'transcriptSim'
  | 'emailSim'
  | 'deleteSim'
  | 'insightsSim';

/** Menu action → which assignment modal it opens. */
const MODAL_FOR_ACTION: Partial<Record<string, SimPickerModal>> = {
  edit: 'editSim',
  export_grade: 'exportSim',
  export_reports: 'reportSim',
  export_transcripts: 'transcriptSim',
  email_reports: 'emailSim',
  delete: 'deleteSim',
  ai_insights: 'insightsSim',
};

const COLUMN_COUNT = 10;

/** Loading placeholders: the sim name column, then centred bars. */
const SKELETON_COLUMNS = Array.from({ length: COLUMN_COUNT }, (_, j) => ({
  barClassName: j === 0 ? undefined : 'w-1/2 mx-auto',
}));

/**
 * A class's simulation assignments from `/api/class-simulations`: sorted by the
 * BE and loaded page by page as it scrolls, with per-assignment stats, reports,
 * and an actions menu (edit, exports, review, AI insights, delete, …).
 */
export default function SimsExpandedRow({
  students,
  classId,
  className,
  assignContext,
  schoolName,
  simulations,
  isClassArchived,
  availability = 'open',
  targetSimulationId,
  defaultSimReportsId,
  isLmsLinked,
}: SimsExpandedRowProps) {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { t } = useTranslation('classManagement');
  const { markAll: markAllSimReports } = useMarkAllSimReports();
  const linkage = useClassLmsLinkage(classId, !!isLmsLinked);
  // The table's scroll box; the footer loads the next page as it scrolls in it.
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const assignments = useClassSimulations(classId);
  const { rows } = assignments;
  // The full legacy list, for the Add modal's overlap check across every page.
  const simsFromStore = useAppSelector(selectSimulationsByClassId(classId));
  const allSims = simsFromStore ?? simulations ?? [];
  const [now, setNow] = useState(() => dayjs());
  const [menuState, setMenuState] = useState<{
    simId: string;
    anchor: HTMLElement;
  } | null>(null);
  const [modals, setModals] = useState<SimModalState>(CLOSED_SIM_MODALS);
  const [highlightedSimulationId, setHighlightedSimulationId] = useState<
    string | null
  >(null);

  const openModal = <K extends keyof SimModalState>(
    key: K,
    value: SimModalState[K]
  ) => setModals((m) => ({ ...m, [key]: value }));
  const closeModal = (key: keyof SimModalState) =>
    setModals((m) => ({ ...m, [key]: CLOSED_SIM_MODALS[key] }));
  const openReports = (sim: SimulationItem) => openModal('reportsModal', sim);

  useEffect(() => {
    const timer = setInterval(() => setNow(dayjs()), 60_000);
    return () => clearInterval(timer);
  }, []);

  // Deep link to one assignment (highlight it) or to its reports ("back to
  // reports"): load pages until the assignment is in the list, then apply it
  // once. A failed page pauses the search without giving up: nothing is
  // re-requested until the footer's Retry, so a broken request can't loop,
  // and the link still applies once Retry brings the assignment in.
  const deepLinkAppliedRef = useRef(false);
  const {
    hasNextPage,
    isFetchingNextPage,
    isFetchNextPageError,
    fetchNextPage,
  } = assignments;
  useEffect(() => {
    if (deepLinkAppliedRef.current || rows.length === 0) return;
    if (!targetSimulationId && !defaultSimReportsId) return;

    const findSim = (id: string | undefined) => {
      const target = id?.trim();
      return target
        ? rows.find(
            (sim) =>
              String(sim.simulation_id ?? '').trim() === target ||
              String(sim.id ?? '').trim() === target
          )
        : undefined;
    };
    const highlightMatch = findSim(targetSimulationId);
    const reportsMatch = findSim(defaultSimReportsId);
    const isTargetMissing =
      (!!targetSimulationId && !highlightMatch) ||
      (!!defaultSimReportsId && !reportsMatch);
    if (isTargetMissing && hasNextPage) {
      if (!isFetchNextPageError && !isFetchingNextPage) fetchNextPage();
      return;
    }

    // Only after a match, or once every page has loaded.
    deepLinkAppliedRef.current = true;
    if (highlightMatch) setHighlightedSimulationId(String(highlightMatch.id));
    if (reportsMatch) {
      setModals((m) => ({
        ...m,
        reportsModal: reportsMatch,
      }));
    }
  }, [
    rows,
    targetSimulationId,
    defaultSimReportsId,
    hasNextPage,
    isFetchingNextPage,
    isFetchNextPageError,
    fetchNextPage,
  ]);

  // The deep-linked row is highlighted briefly.
  useEffect(() => {
    if (!highlightedSimulationId) return;
    const timer = setTimeout(() => setHighlightedSimulationId(null), 2500);
    return () => clearTimeout(timer);
  }, [highlightedSimulationId]);

  const reloadAssignments = () =>
    dispatch(FetchSimulationsByClass({ classId }));

  // The legacy list (Add's overlap check, the Reports tab's assignment
  // windows) isn't covered by the listing's cache tag, so reload it after an
  // inline save as the dialogs do.
  const dateEdit = useInlineSimDateEdit({ onSaved: reloadAssignments });

  // A Past assignment is closed and inactive (RE-35): its dates can't be
  // edited, in the row or through the Edit dialog. Reassign it instead.
  const isPastAssignment = (sim: SimulationItem) =>
    getAssignmentTimeStatus(sim.start_date, sim.end_date, now) === 'past';

  const handleMenuAction = (action: string, simId: string) => {
    setMenuState(null);
    const sim = rows.find((s) => s.id === simId) ?? null;
    if (action === 'edit' && sim && isPastAssignment(sim)) return;

    const modalKey = MODAL_FOR_ACTION[action];
    if (modalKey) {
      openModal(modalKey, sim);
      return;
    }
    if (!sim) return;
    const catalogSimId = simIdOf(sim);
    if (!catalogSimId) return;

    if (action === 'view_details') {
      navigate(`/simulationdetails/${encodeURIComponent(catalogSimId)}`, {
        state: {
          simulationId: catalogSimId,
          fromClasses: true,
          classId,
          expandType: 'sims' as const,
        },
      });
      return;
    }
    if (action === 'mark_all_reviewed' || action === 'mark_all_unreviewed') {
      // Scoped to this class: the same sim may be assigned to other classes too.
      void markAllSimReports(
        classId,
        catalogSimId,
        action === 'mark_all_reviewed'
      );
      return;
    }
    if (action === 'copy_sim_id') {
      navigator.clipboard
        .writeText(catalogSimId)
        .then(() => {
          toast.success(t('simSubtable.copySimIdSuccess'));
        })
        .catch(() => {
          toast.error(t('simSubtable.copySimIdError'));
        });
    }
  };

  const renderSkeletonRows = (count: number, label: string) => (
    <SkeletonRows
      rows={count}
      columns={SKELETON_COLUMNS}
      label={label}
      rowClassName="border-t border-gray-100"
      cellClassName="px-4 py-3"
    />
  );

  const renderStateRow = (content: React.ReactNode) => (
    <tr>
      <td
        colSpan={COLUMN_COUNT}
        className="text-center py-6 text-gray-400 text-xs"
      >
        {content}
      </td>
    </tr>
  );

  return (
    <div className="px-4 pt-4 pb-4 transition-opacity duration-150 ease-out">
      {/* The rounded frame clips the scroller's corners. */}
      <div className="rounded-xl border border-gray-200 overflow-hidden">
        {/* `relative` keeps the footer's sr-only status inside this scroller. */}
        <div
          ref={scrollContainerRef}
          className="relative overflow-x-auto overflow-y-auto max-h-[400px]"
        >
          <table className="w-full text-sm">
            <SimsTableHeader
              sortKey={assignments.sortField}
              sortDir={assignments.sortDirection}
              onSort={assignments.handleSort}
            />
            <tbody>
              {assignments.isLoading
                ? renderSkeletonRows(
                    SKELETON_INITIAL_ROW_COUNT,
                    t('simSubtable.loadingSims')
                  )
                : assignments.hasLoadFailed
                  ? renderStateRow(
                      <LoadErrorMessage
                        message={t('simSubtable.loadFailed')}
                        onRetry={assignments.refetch}
                      />
                    )
                  : assignments.isEmpty
                    ? renderStateRow(t('simSubtable.noSimsAssigned'))
                    : rows.map((sim) => (
                        <SimRow
                          key={sim.id}
                          sim={sim}
                          now={now}
                          stats={assignments.statsById.get(sim.id)}
                          lmsAssignment={linkage.assignmentBySimulationId.get(
                            simIdOf(sim)
                          )}
                          lmsProvider={linkage.provider}
                          isHighlighted={
                            highlightedSimulationId === String(sim.id)
                          }
                          isMenuOpen={menuState?.simId === sim.id}
                          onOpenReports={openReports}
                          onOpenMenu={(id, anchor) =>
                            setMenuState((current) =>
                              current?.simId === id
                                ? null
                                : { simId: id, anchor }
                            )
                          }
                          isClassArchived={Boolean(isClassArchived)}
                          editingDateField={
                            dateEdit.editing?.simId === sim.id
                              ? dateEdit.editing.field
                              : null
                          }
                          dateError={dateEdit.error}
                          isSavingDate={dateEdit.isSaving}
                          onEditDate={(row, field) =>
                            dateEdit.startEdit(row.id, field)
                          }
                          onSaveDate={dateEdit.saveDate}
                          onCancelDate={dateEdit.cancelEdit}
                        />
                      ))}
              {assignments.isFetchingNextPage &&
                renderSkeletonRows(
                  SKELETON_REFETCH_ROW_COUNT,
                  t('table.loadingMore')
                )}
            </tbody>
          </table>
          {rows.length > 0 && (
            <InfiniteListFooter
              key={JSON.stringify(assignments.queryArg)}
              itemCount={rows.length}
              hasNextPage={assignments.hasNextPage}
              isFetchingNextPage={assignments.isFetchingNextPage}
              isFetchNextPageError={assignments.isFetchNextPageError}
              fetchNextPage={assignments.fetchNextPage}
              isRefreshError={assignments.isRefreshError}
              refetch={assignments.refetch}
              endMessage={t('simSubtable.endOfSims')}
              loadedMoreMessage={(count) =>
                t('simSubtable.loadedMoreSims', { count })
              }
              scrollRootRef={scrollContainerRef}
              shouldShowLoadingMessage={false}
            />
          )}
        </div>
      </div>

      {menuState && (
        <SimActionsMenu
          anchorEl={menuState.anchor}
          simId={menuState.simId}
          onClose={() => setMenuState(null)}
          onSelect={handleMenuAction}
          isEmail={students[0]?.email ? false : true}
          isEditDisabled={rows.some(
            (sim) => sim.id === menuState.simId && isPastAssignment(sim)
          )}
        />
      )}
      {isClassArchived ? null : (
        <div className="flex justify-center mt-3">
          <ClassAvailabilityTip
            availability={availability}
            endedTip={t('classAvailability.endedAssign')}
          >
            <button
              type="button"
              disabled={availability === 'ended'}
              onClick={() => {
                if (isClassArchived || availability === 'ended') return;
                dispatch(clearAddSimulationState());
                openModal('isAddOpen', true);
              }}
              className={`flex items-center gap-2 px-5 py-2.5 bg-gradient-btn text-white text-sm font-semibold rounded-full transition-opacity shadow-md shadow-primary-200 ${
                availability === 'ended'
                  ? 'opacity-50 pointer-events-none'
                  : isClassArchived
                    ? 'cursor-not-allowed'
                    : 'hover:opacity-90'
              }`}
            >
              ＋ {t('simSubtable.createAssignment')}
            </button>
          </ClassAvailabilityTip>
        </div>
      )}

      <SimAssignmentModals
        modals={modals}
        onClose={closeModal}
        classId={classId}
        className={className}
        assignContext={assignContext}
        schoolName={schoolName}
        students={students}
        simulations={allSims}
        onAssignmentsChanged={reloadAssignments}
      />
    </div>
  );
}
