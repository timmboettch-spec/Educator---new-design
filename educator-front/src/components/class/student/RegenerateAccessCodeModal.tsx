import { useState } from 'react';
import { toast } from '../../../components/common/Toast';

import AlertTriangle from '../../../../public/assets/common/alert_triangle.svg';
import { Button } from '../../../components/ui/Button';
import Modal from '../../../components/ui/Modal';
import loginEn from '../../../locales/auth/login/en.json';
import loginEs from '../../../locales/auth/login/es.json';
import { patchStudentInClass } from '../../../redux/class/GetClassRedux';
import {
  selectUpdateCodeLoading,
  UpdateStudentCodeRequest,
} from '../../../redux/class/Student/UpdateStudentCodeRedux';
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
  const lang = getStoredLanguage();
  const locale = lang === 'es' ? loginEs : loginEn;
  const m = locale.studentModals;

  const handleClose = () => {
    setStep(0);
    onClose();
  };

  const handleRegenerate = async () => {
    try {
      const result = await dispatch(UpdateStudentCodeRequest(studentId)).unwrap();
      const generatedCode = result?.data?.new_code ?? result?.data?.student_id ?? null;
      dispatch(patchStudentInClass({ id: studentId, student_id: generatedCode }));
      toast.success(result?.message ?? (lang === 'es' ? 'Código de estudiante regenerado con éxito' : 'Student code regenerated successfully'));
      handleClose();
      await onSuccess();
    } catch (err) {
      const error = err as { message?: string };
      toast.error(error?.message ?? (lang === 'es' ? 'Error al regenerar el código de estudiante' : 'Failed to regenerate Student code'));
    }
  };

  const steps = [
    {},
    {
      title: m.step1Title,
      message: m.step1Message.replace('{{name}}', studentName),
      button: m.step1Button,
      action: () => setStep(2),
    },
    {
      title: m.step2Title,
      message: m.step2Message,
      button: loading ? m.regenerating : (lang === 'es' ? 'Confirmar' : 'Confirm'),
      action: handleRegenerate,
    },
  ];

  const current = steps[step];

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={m.regenerateTitle}>
      <div className="flex flex-col items-center px-4 py-4 gap-6">
        {step === 0 ? (
          <>
            <div className="w-full bg-primary-50 border border-primary-300 rounded-xl p-4">
              <p className="flex gap-2 text-primary-500 font-semibold text-sm mb-2">
                <img src={AlertTriangle} alt="Warning" className="w-4 h-4" />
                <span>{m.revokeWarning}</span>
              </p>
              <p className="text-sm text-gray-600">
                {m.regenerateWarningMessage.replace('{{name}}', studentName)}
              </p>
            </div>

            <div className="text-center">
              <p className="text-xs text-gray-500 mb-1">{m.currentCode}</p>
              <p className="text-xl font-bold text-primary-500">
                {currentCode || '---'}
              </p>
            </div>

            <div className="flex gap-4 w-full">
              <Button variant="secondary" onClick={handleClose} className="w-1/2 h-11 rounded-full">
                {m.cancel}
              </Button>

              <Button
                onClick={() => setStep(1)}
                className="w-1/2 h-11 rounded-full bg-primary-500 text-white"
              >
                {m.regenerateBtn}
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
                      ${step === s
                        ? 'bg-primary-500 text-white'
                        : step > s
                          ? 'bg-primary-200 text-primary-500'
                          : 'bg-gray-100 text-gray-500'
                      }`}
                  >
                    {s}
                  </div>
                  {s < 2 && (
                    <div className={`w-8 h-0.5 ${step > s ? 'bg-primary-300' : 'bg-gray-200'}`} />
                  )}
                </div>
              ))}
            </div>

            <div className="w-full bg-red-50 border border-red-200 rounded-xl p-5 text-center">
              <p className="flex items-center justify-center gap-2 text-primary-500 font-semibold text-sm mb-2">
                {step === 3 && <img src={AlertTriangle} alt="alert" className="w-4 h-4" />}
                {current.title}
              </p>
              <p className="text-sm text-gray-600">{current.message}</p>
            </div>

            <div className="flex gap-4 w-full">
              <Button variant="secondary" onClick={handleClose} className="w-1/2 h-11 rounded-full">
                {m.cancel}
              </Button>

              <Button
                onClick={current.action}
                disabled={loading}
                className="w-1/2 h-11 rounded-full bg-primary-500 text-white"
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
