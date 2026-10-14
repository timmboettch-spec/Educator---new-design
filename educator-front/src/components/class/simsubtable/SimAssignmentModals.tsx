import type { SimulationItem, Student } from '@/types';
import { simIdOf } from '@/utils/simAssignment';
import EmailReportModal from '../BulkEmailReportModal';
import AIInsightsModal from '../simulation/AIInsightsModal';
import { AddSimulationModal } from '../../modal/AddSimulationModal';
import type { AssignContextClass } from '../../../types/simulationAssignment.types';
import DeleteSimulationModal from '../simulation/DeleteSimulationModal';
import { EditSimulationModal } from '../simulation/EditSimulationModal';
import ExportGradeModal from '../simulation/ExportGradeModal';
import ExportReportModal from '../simulation/ExportReportModal';
import ExportTranscriptModal from '../simulation/ExportTranscriptModal';
import SimulationReportsModal from '../simulation/SimulationReportsModal';

/** Which assignment each modal is open for (null = closed). */
export interface SimModalState {
  isAddOpen: boolean;
  editSim: SimulationItem | null;
  exportSim: SimulationItem | null;
  reportSim: SimulationItem | null;
  transcriptSim: SimulationItem | null;
  reportsModal: SimulationItem | null;
  emailSim: SimulationItem | null;
  insightsSim: SimulationItem | null;
  deleteSim: SimulationItem | null;
}

export const CLOSED_SIM_MODALS: SimModalState = {
  isAddOpen: false,
  editSim: null,
  exportSim: null,
  reportSim: null,
  transcriptSim: null,
  reportsModal: null,
  emailSim: null,
  insightsSim: null,
  deleteSim: null,
};

interface SimAssignmentModalsProps {
  modals: SimModalState;
  onClose: (key: keyof SimModalState) => void;
  classId: string;
  className?: string;
  /** The class, for the assign modal's pre-selected school and class. */
  assignContext: AssignContextClass;
  schoolName?: string;
  students: Student[];
  simulations: SimulationItem[];
  /** Reload the class's assignments after one is added, edited or deleted. */
  onAssignmentsChanged: () => unknown;
}

// The export modals take the assignment's catalog id, falling back to its row id.
const simSource = (
  sim: SimulationItem,
  classId: string,
  className?: string
) => ({
  type: 'sim' as const,
  simId: sim.simulation_id || sim.id,
  simName: sim.simulation_title,
  startDate: sim.start_date,
  endDate: sim.end_date,
  class_id: classId,
  className,
});

/** Every modal the Sims sub-table can open, each shown for its selected assignment. */
export function SimAssignmentModals({
  modals,
  onClose,
  classId,
  className,
  assignContext,
  schoolName,
  students,
  simulations,
  onAssignmentsChanged,
}: SimAssignmentModalsProps) {
  const {
    isAddOpen,
    editSim,
    exportSim,
    reportSim,
    transcriptSim,
    reportsModal,
    emailSim,
    insightsSim,
    deleteSim,
  } = modals;

  return (
    <>
      {isAddOpen && (
        <AddSimulationModal
          isOpen={isAddOpen}
          classContext={assignContext}
          simulations={simulations}
          onAssigned={async () => {
            await onAssignmentsChanged();
          }}
          onClose={async () => {
            onClose('isAddOpen');
          }}
        />
      )}

      {editSim && (
        <EditSimulationModal
          sim={editSim}
          onClose={() => {
            onClose('editSim');
            // Small delay ensures the DB has committed before refetching
            setTimeout(onAssignmentsChanged, 300);
          }}
        />
      )}

      {exportSim && (
        <ExportGradeModal
          sim={exportSim}
          className={className}
          classId={classId}
          students={students}
          onClose={() => onClose('exportSim')}
        />
      )}

      {reportSim && (
        <ExportReportModal
          source={simSource(reportSim, classId, className)}
          students={[]}
          onClose={() => onClose('reportSim')}
        />
      )}

      {transcriptSim && (
        <ExportTranscriptModal
          source={simSource(transcriptSim, classId, className)}
          students={students}
          onClose={() => onClose('transcriptSim')}
        />
      )}

      {reportsModal && (
        <SimulationReportsModal
          classId={classId}
          className={className}
          schoolName={schoolName}
          simulationId={simIdOf(reportsModal)}
          simName={reportsModal.simulation_title}
          onClose={() => onClose('reportsModal')}
        />
      )}

      {emailSim && (
        <EmailReportModal
          classId={classId}
          onClose={() => onClose('emailSim')}
        />
      )}
      {insightsSim && (
        <AIInsightsModal
          sim={insightsSim}
          onClose={() => onClose('insightsSim')}
        />
      )}
      {deleteSim && (
        <DeleteSimulationModal
          sim={deleteSim}
          classId={classId}
          onClose={() => onClose('deleteSim')}
          onDeleted={() => {
            onClose('deleteSim');
            onAssignmentsChanged();
          }}
        />
      )}
    </>
  );
}
