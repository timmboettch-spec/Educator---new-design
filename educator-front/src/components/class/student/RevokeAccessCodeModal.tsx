import { useMemo } from 'react';
import loginEn from '../../../locales/auth/login/en.json';
import loginEs from '../../../locales/auth/login/es.json';
import AlertTriangle from '../../../../public/assets/common/alert_triangle.svg';
import { toast } from '../../../components/common/Toast';
import { Button } from '../../../components/ui/Button';
import Modal from '../../../components/ui/Modal';
import { patchStudentInClass } from '../../../redux/class/GetClassRedux';
import {
  selectRevokeCodeLoading,
  RevokeStudentCodeRequest,
} from '../../../redux/class/Student/RevokeStudentCodeRedux';
import { useAppDispatch, useAppSelector } from '../../../store/hooks';

type SupportedLang = 'en' | 'es';
const LANGUAGE_STORAGE_KEY = 'app_language';

const getStoredLanguage = (): SupportedLang => {
  if (typeof window === 'undefined') return 'en';
  const saved = localStorage.getItem(LANGUAGE_STORAGE_KEY)?.toLowerCase();
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

  const language = getStoredLanguage();
  const locale = useMemo(
    () => (language === 'es' ? loginEs : loginEn),
    [language]
  );
  const studentLocale = ((locale as Record<string, unknown>).studentSubtable ??
    (locale as Record<string, unknown>).students ??
    {}) as Record<string, string>;

  const displayName =
    studentName?.trim() ||
    studentLocale.thisStudent ||
    (language === 'es' ? 'este estudiante' : 'this student');

  const handleRevoke = async () => {
    try {
      const result = await dispatch(
        RevokeStudentCodeRequest(studentId)
      ).unwrap();
      dispatch(patchStudentInClass({ id: studentId, student_id: null }));
      toast.success(
        language === 'es'
          ? studentLocale.toastRevokeSuccess ||
              'Código de estudiante revocado con éxito'
          : (result?.message ??
              studentLocale.toastRevokeSuccess ??
              'Student code revoked successfully')
      );
      onClose();
      await onSuccess();
    } catch (err) {
      const error = err as { message?: string };
      toast.error(
        language === 'es'
          ? studentLocale.toastRevokeError ||
              'Error al revocar el código de estudiante'
          : (error?.message ??
              studentLocale.toastRevokeError ??
              'Failed to revoke Student code')
      );
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={studentLocale.modalRevokeTitle ?? 'Revoke Student Code'}
    >
      <div className="flex flex-col items-center px-4 py-4 gap-6">
        <div className="w-full bg-orange-50 border border-orange-300 rounded-xl p-4">
          <p className="flex gap-2 text-orange-500 font-semibold text-sm mb-2">
            <img src={AlertTriangle} alt="Warning" className="w-4 h-4" />
            <span>{studentLocale.warningHeader ?? 'WARNING'}</span>
          </p>
          <p className="text-sm text-gray-600">
            {(
              studentLocale.revokeWarningBody ??
              'The student code for {name} will be revoked. The student will immediately lose access to all simulations. Their completed simulation records will be preserved and can be restored by regenerating a new student code.'
            ).replace('{name}', displayName)}
          </p>
        </div>

        <div className="text-center">
          <p className="text-xs text-gray-400 mb-1">
            {studentLocale.currentCode ?? 'CURRENT CODE'}
          </p>
          <p className="text-xl font-bold text-orange-500">
            {currentCode || '---'}
          </p>
        </div>

        <div className="flex gap-4 w-full">
          <Button
            variant="secondary"
            onClick={onClose}
            className="w-1/2 h-11 rounded-full"
          >
            {studentLocale.cancel ?? 'Cancel'}
          </Button>
          <Button
            onClick={handleRevoke}
            disabled={loading}
            className="w-1/2 h-11 rounded-full bg-orange-500 text-white"
          >
            {loading
              ? (studentLocale.revoking ?? 'Revoking...')
              : (studentLocale.revokeAccess ?? 'Revoke Access')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
