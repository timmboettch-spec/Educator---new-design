import AlertTriangle from '../../../../public/assets/common/alert_triangle.svg';
import { toast } from '../../../components/common/Toast';
import { Button } from '../../../components/ui/Button';
import Modal from '../../../components/ui/Modal';
import loginEn from '../../../locales/auth/login/en.json';
import loginEs from '../../../locales/auth/login/es.json';
import { patchStudentInClass } from '../../../redux/class/GetClassRedux';
import {
  selectRevokeCodeLoading,
  RevokeStudentCodeRequest,
} from '../../../redux/class/Student/RevokeStudentCodeRedux';
import { useAppDispatch, useAppSelector } from '../../../store/hooks';

type SupportedLang = 'en' | 'es';
const getStoredLanguage = (): SupportedLang => {
  if (typeof window === 'undefined') return 'en';
  const saved = localStorage.getItem('app_language')?.toLowerCase();
  return saved === 'es' ? 'es' : 'en';
};

interface Props {
  isOpen: boolean;
  onClose: () => void;
  studentId: string;
  studentName: string;
  currentCode: string | null;
  onSuccess: () => Promise<void> | void;
}

export default function RevokeAccessCodeModal({
  isOpen,
  onClose,
  studentId,
  studentName,
  currentCode,
  onSuccess,
}: Props) {
  const dispatch = useAppDispatch();
  const loading = useAppSelector(selectRevokeCodeLoading);
  const lang = getStoredLanguage();
  const locale = lang === 'es' ? loginEs : loginEn;
  const m = locale.studentModals;

  const handleRevoke = async () => {
    try {
      const result = await dispatch(RevokeStudentCodeRequest(studentId)).unwrap();
      dispatch(patchStudentInClass({ id: studentId, student_id: null }));
      toast.success(result?.message ?? (lang === 'es' ? 'Código de estudiante revocado con éxito' : 'Student code revoked successfully'));
      onClose();
      await onSuccess();
    } catch (err) {
      const error = err as { message?: string };
      toast.error(error?.message ?? (lang === 'es' ? 'Error al revocar el código de estudiante' : 'Failed to revoke Student code'));
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={m.revokeTitle}>
      <div className="flex flex-col items-center px-4 py-4 gap-6">
        <div className="w-full bg-primary-50 border border-primary-300 rounded-xl p-4">
          <p className="flex gap-2 text-primary-500 font-semibold text-sm mb-2">
            <img src={AlertTriangle} alt="Warning" className="w-4 h-4" />
            <span>{m.revokeWarning}</span>
          </p>
          <p className="text-sm text-gray-600">
            {lang === 'es' ? (
              <>
                El código de estudiante para <strong>{studentName}</strong> será revocado. El estudiante perderá inmediatamente el acceso a todas las simulaciones. Sus registros de simulaciones completadas se conservarán y se podrán restaurar al regenerar un nuevo código de estudiante.
              </>
            ) : (
              <>
                The student code for <strong>{studentName}</strong> will be revoked. The student will immediately lose access to all simulations. Their completed simulation records will be preserved and can be restored by regenerating a new student code.
              </>
            )}
          </p>
        </div>

        <div className="text-center">
          <p className="text-xs text-gray-500 mb-1">{m.currentCode}</p>
          <p className="text-xl font-bold text-primary-500">
            {currentCode || '---'}
          </p>
        </div>

        <div className="flex gap-4 w-full">
          <Button variant="secondary" onClick={onClose} className="w-1/2 h-11 rounded-full">
            {m.cancel}
          </Button>
          <Button
            onClick={handleRevoke}
            disabled={loading}
            className="w-1/2 h-11 rounded-full bg-primary-500 text-white"
          >
            {loading ? m.revoking : m.revokeAccess}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
