import { useTranslation } from 'react-i18next';
import { Button } from '../ui/Button';
import Modal from '../ui/Modal';

interface PrintClassStudentCodesModalProps {
  isOpen: boolean;
  onClose: () => void;
  className: string;
  isPrinting: boolean;
  onPrint: () => void;
}

/** Confirms printing all of a class's student codes before the print window opens. */
export function PrintClassStudentCodesModal({
  isOpen,
  onClose,
  className,
  isPrinting,
  onPrint,
}: PrintClassStudentCodesModalProps) {
  const { t } = useTranslation('classManagement');

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t('printStudentCodes.title')}
    >
      <div className="flex flex-col items-center text-center px-4 py-2">
        <div className="border-2 border-dashed border-gray-200 rounded-xl p-8 w-full mb-6 bg-gray-50">
          <p className="text-lg font-bold text-black mb-5">{className}</p>
          <p className="text-xs text-gray-500 font-bold uppercase tracking-widest mb-2">
            {t('printStudentCodes.studentCode')}
          </p>
          <p className="text-xs text-gray-700 uppercase tracking-widest mb-4">
            {t('printStudentCodes.allStudentsCode')}
          </p>
        </div>

        <div className="flex gap-4 w-full">
          <Button
            variant="secondary"
            onClick={onClose}
            className="w-1/2 h-11 rounded-full"
          >
            {t('printStudentCodes.back')}
          </Button>
          <Button
            onClick={onPrint}
            loading={isPrinting}
            loadingText={t('printStudentCodes.preparing')}
            className="w-1/2 h-11 rounded-full bg-orange-500 text-white"
          >
            {t('printStudentCodes.print')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
