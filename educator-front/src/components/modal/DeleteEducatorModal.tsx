import { Educator } from '../../types';
import Modal from '../../components/ui/Modal';
import { Button } from '../ui/Button';
import { AlertCircle } from 'lucide-react';
import loginEn from '../../locales/auth/login/en.json';
import loginEs from '../../locales/auth/login/es.json';

type SupportedLang = 'en' | 'es';

const LANGUAGE_STORAGE_KEY = 'app_language';

const getStoredLanguage = (): SupportedLang => {
  if (typeof window === 'undefined') {
    return 'en';
  }

  const saved = localStorage.getItem(LANGUAGE_STORAGE_KEY)?.toLowerCase();
  return saved === 'es' ? 'es' : 'en';
};

type EducatorModalProps = {
  isDeleteModalOpen: boolean;
  setIsDeleteModalOpen: (open: boolean) => void;
  selectedEducator: Educator | null;
  confirmDelete: () => void;
  isDeleting: boolean;
};

export default function DeleteEducatorModal({
  isDeleteModalOpen,
  setIsDeleteModalOpen,
  selectedEducator,
  confirmDelete,
  isDeleting,
}: EducatorModalProps) {
  if (!isDeleteModalOpen) return null;

  const language = getStoredLanguage();
  const locale = language === 'es' ? loginEs : loginEn;
  const educatorsCopy = {
    modalDeleteTitle: locale?.educators?.modalDeleteTitle ?? 'Delete Educator',
    deleteConfirmPrefix:
      locale?.educators?.deleteConfirmPrefix ?? 'Are you sure you want to delete educator',
    deleteConfirmSuffix:
      locale?.educators?.deleteConfirmSuffix ??
      'This action cannot be undone and will remove access to all reports.',
    back: locale?.educators?.back ?? 'Back',
    deleteAction: locale?.educators?.deleteAction ?? 'Delete Educator',
  };

  return (
    <Modal isOpen={isDeleteModalOpen} onClose={() => setIsDeleteModalOpen(false)} title="">
      <div className="flex flex-col items-center text-center px-6 py-6">
        <div className="flex items-center justify-center w-14 h-14 rounded-full bg-red-100 mb-4">
          <AlertCircle className="w-7 h-7 text-red-500" />
        </div>
        <h2 className="text-base font-semibold text-gray-800 mb-2">{educatorsCopy.modalDeleteTitle}</h2>
        <p className="text-sm text-gray-500 mb-6 max-w-sm">
          {educatorsCopy.deleteConfirmPrefix}{' '}
          <span className="font-semibold text-gray-700">"{selectedEducator?.full_name}"</span>?{' '}
          {educatorsCopy.deleteConfirmSuffix}
        </p>

        <div className="flex gap-4 w-full">
          <Button
            type="button"
            variant="secondary"
            onClick={() => setIsDeleteModalOpen(false)}
            className="w-1/2 h-11 rounded-full text-sm font-medium"
          >
            {educatorsCopy.back}
          </Button>

          <Button
            type="button"
            onClick={confirmDelete}
            loading={isDeleting}
            className="w-1/2 h-11 rounded-full bg-primary-500 hover:bg-primary-600 text-white text-sm font-medium"
          >
            {educatorsCopy.deleteAction}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
