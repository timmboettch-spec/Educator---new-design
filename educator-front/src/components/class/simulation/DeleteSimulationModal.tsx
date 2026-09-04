import { useDispatch } from 'react-redux';
import { toast } from '../../../components/common/Toast';
import { DeleteSimulationRequest } from '../../../redux/class/DeleteSimulationRedux';
import type { AppDispatch } from '../../../store';
import Modal from '../../ui/Modal';
import { SimulationItem } from '@/types';

interface Props {
  sim: SimulationItem;
  classId: string;
  onClose: () => void;
  onDeleted: () => void;
}

export default function DeleteSimulationModal({ sim, classId, onClose, onDeleted }: Props) {
  const dispatch = useDispatch<AppDispatch>();

  const handleDelete = async () => {
    try {
      const targetSimulationId = sim.id ?? sim.simulation_id;
      if (!targetSimulationId) {
        toast.error('Something went wrong while deleting');
        return;
      }

      const resultAction = await dispatch(
        DeleteSimulationRequest({
          simId: targetSimulationId,
          classId,
          avatarEnabled: (sim as unknown as Record<string, unknown>).avatarEnabled as boolean | undefined,
          startDate: sim.start_date,
        }),
      );
      if (DeleteSimulationRequest.fulfilled.match(resultAction)) {
        toast.success('Simulation deleted successfully!');
        onDeleted();
        onClose();
      } else {
        const msg = (resultAction.payload as string) || 'Something went wrong while deleting';
        toast.error(msg);
      }
    } catch {
      toast.error('Something went wrong while deleting');
    }
  };

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title="Delete Sim Assignment"
      footer={
        <div className="flex gap-3 w-full">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-3 rounded-full bg-gray-100 text-gray-600 text-sm font-semibold hover:bg-gray-200 transition-colors"
          >
            Back
          </button>
          <button
            type="button"
            onClick={handleDelete}
            className="flex-1 py-3 rounded-full bg-primary-500 text-white text-sm font-semibold hover:bg-primary-600 transition-colors"
          >
            Delete Sim Assignment
          </button>
        </div>
      }
    >
      <div className="flex flex-col items-center text-center py-4">
        <div className="w-14 h-14 rounded-full border-2 border-red-300 flex items-center justify-center mb-5">
          <span className="text-red-400 text-2xl font-bold">!</span>
        </div>
        <p className="text-sm text-gray-500 leading-relaxed">
          Are you sure you want to delete{' '}
          <span className="font-semibold text-gray-700">{sim.simulation_title}</span>? This action
          cannot be undone.
          <br />
          This will remove access to all reports.
        </p>
      </div>
    </Modal>
  );
}
