import { useMemo, useState } from 'react';
import loginEn from '../../../locales/auth/login/en.json';
import loginEs from '../../../locales/auth/login/es.json';
import { toast } from '../../../components/common/Toast';

import AlertTriangle from '../../../../public/assets/common/alert_triangle.svg';
import { Button } from '../../../components/ui/Button';
import Modal from '../../../components/ui/Modal';
import { patchStudentInClass } from '../../../redux/class/GetClassRedux';
import {
  selectUpdateCodeLoading,
  UpdateStudentCodeRequest,
} from '../../../redux/class/Student/UpdateStudentCodeRedux';
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

export default function RegenerateAccessCodeModal({
  isOpen,
  onClose,
  studentId,
  studentName,
  currentCode,
  onSuccess,
}: Props) {
  const dispatch = useAppDispatch();
  const loading = useAppSelector(selectUpdateCodeLoading);
  const [step, setStep] = useState(0);

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

  const handleClose = () => {
    setStep(0);
    onClose();
  };

  const handleRegenerate = async () => {
    try {
      const result = await dispatch(
        UpdateStudentCodeRequest(studentId)
      ).unwrap();
      const generatedCode =
        result?.data?.new_code ?? result?.data?.student_id ?? null;
      dispatch(
        patchStudentInClass({ id: studentId, student_id: generatedCode })
      );
      toast.success(
        language === 'es'
          ? studentLocale.toastSuccess ||
              'Código de estudiante regenerado con éxito'
          : (result?.message ??
              studentLocale.toastSuccess ??
              'Student code regenerated successfully')
      );
      handleClose();
      await onSuccess();
    } catch (err) {
      const error = err as { message?: string };
      toast.error(
        language === 'es'
          ? studentLocale.toastError ||
              'Error al regenerar el código de estudiante'
          : (error?.message ??
              studentLocale.toastError ??
              'Failed to regenerate Student code')
      );
    }
  };

  const steps = [
    {},
    {
      title: studentLocale.step1Title ?? 'Generate A New Code',
      message: (
        studentLocale.step1Message ??
        '{name} will immediately lose access to all simulations. This action can be undone by regenerating a new code.'
      ).replace('{name}', displayName),
      button: studentLocale.continue ?? 'Continue',
      action: () => setStep(2),
    },
    {
      title:
        studentLocale.step2Title ??
        'Mark All Existing Associated Records With New Code',
      message:
        studentLocale.step2Message ??
        'All existing records will be updated and linked to the new code.',
      button: loading
        ? (studentLocale.regenerating ?? 'Regenerating...')
        : (studentLocale.confirm ?? 'Confirm'),
      action: handleRegenerate,
    },
  ];

  const current = steps[step];

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={studentLocale.modalRegenerateTitle ?? 'Regenerate Student Code'}
    >
      <div className="flex flex-col items-center px-4 py-4 gap-6">
        {step === 0 ? (
          <>
            <div className="w-full bg-orange-50 border border-orange-300 rounded-xl p-4">
              <p className="flex gap-2 text-orange-500 font-semibold text-sm mb-2">
                <img src={AlertTriangle} alt="Warning" className="w-4 h-4" />
                <span>{studentLocale.warningHeader ?? 'WARNING'}</span>
              </p>
              <p className="text-sm text-gray-600">
                {(
                  studentLocale.warningBody ??
                  'The old student code for {name} will become invalid immediately. The student will need the new code to access simulation.'
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
                onClick={handleClose}
                className="w-1/2 h-11 rounded-full"
              >
                {studentLocale.cancel ?? 'Cancel'}
              </Button>

              <Button
                onClick={() => setStep(1)}
                className="w-1/2 h-11 rounded-full bg-orange-500 text-white"
              >
                {studentLocale.regenerate ?? 'Regenerate'}
              </Button>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center gap-2">
              {[1, 2].map((s) => (
                <div key={s} className="flex items-center gap-2">
                  <div
                    className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-semibold
                      ${
                        step === s
                          ? 'bg-orange-500 text-white'
                          : step > s
                            ? 'bg-orange-200 text-orange-500'
                            : 'bg-gray-100 text-gray-400'
                      }`}
                  >
                    {s}
                  </div>
                  {s < 2 && (
                    <div
                      className={`w-8 h-0.5 ${step > s ? 'bg-orange-300' : 'bg-gray-200'}`}
                    />
                  )}
                </div>
              ))}
            </div>

            <div className="w-full bg-red-50 border border-red-200 rounded-xl p-5 text-center">
              <p className="flex items-center justify-center gap-2 text-orange-500 font-semibold text-sm mb-2">
                {step === 3 && (
                  <img src={AlertTriangle} alt="alert" className="w-4 h-4" />
                )}
                {current.title}
              </p>
              <p className="text-sm text-gray-600">{current.message}</p>
            </div>

            <div className="flex gap-4 w-full">
              <Button
                variant="secondary"
                onClick={handleClose}
                className="w-1/2 h-11 rounded-full"
              >
                {studentLocale.cancel ?? 'Cancel'}
              </Button>

              <Button
                onClick={current.action}
                disabled={loading}
                className="w-1/2 h-11 rounded-full bg-orange-500 text-white"
              >
                {current.button}
              </Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
