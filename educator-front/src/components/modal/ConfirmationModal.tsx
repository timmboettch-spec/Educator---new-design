import LogoutIcon from '../../../public/assets/dashboard/logout_svg.svg';
import Modal from '../ui/Modal';

type ConfirmModalProps = {
  isOpen: boolean;
  title?: string;
  message?: string;
  onConfirm: () => void;
  onCancel: () => void;
  onClose?: () => void;
  cancelText: string;
  confirmText: string;
  isLoading?: boolean;
};

const CONFIRM_TRANSLATIONS: Record<string, string> = {
  'Choose how you want to continue': 'Elige cómo deseas continuar',
  'Your email and password are linked to both an Administrator and an Educator account. Please select which role you want to use for this session.':
    'Tu correo electrónico y contraseña están vinculados a una cuenta de Administrador y a una de Educador. Por favor, selecciona qué rol deseas usar para esta sesión.',
  'Choose your account': 'Elige tu cuenta',
  'Your email is linked to both an Administrator and an Educator account. Which password would you like to reset?':
    'Tu correo electrónico está vinculado a una cuenta de Administrador y a una de Educador. ¿Qué contraseña deseas restablecer?',
  Administrator: 'Administrador',
  Educator: 'Educador',
  Confirmation: 'Confirmación',
  'Are you sure you want to proceed?': '¿Estás seguro de que deseas continuar?',
  Yes: 'Sí',
  No: 'No',
};

const translateText = (text?: string): string => {
  if (!text) return '';
  const isSpanish = localStorage.getItem('app_language')?.toLowerCase() === 'es';
  if (!isSpanish) return text;
  return CONFIRM_TRANSLATIONS[text] || text;
};

export default function ConfirmModal({
  isOpen,
  title = 'Confirmation',
  message = 'Are you sure you want to proceed?',
  onConfirm,
  onCancel,
  onClose,
  cancelText = 'No',
  confirmText = 'Yes',
  isLoading = false,
}: ConfirmModalProps) {
  const handleClose = onClose ?? onCancel;
  const displayTitle = translateText(title);
  const displayMessage = translateText(message);
  const displayCancelText = translateText(cancelText);
  const displayConfirmText = translateText(confirmText);

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title=""
      footer={
        <div className="flex items-center gap-4 w-full">
          <button
            onClick={onCancel}
            disabled={isLoading}
            className="flex-1 h-[44px] rounded-full bg-gray-100 hover:bg-gray-200 text-gray-600 font-semibold text-sm transition-colors disabled:opacity-50"
          >
            {displayCancelText}
          </button>
          <button
            onClick={onConfirm}
            disabled={isLoading}
            className="flex-1 h-[44px] rounded-full bg-gradient-btn hover:opacity-90 text-white font-bold text-sm transition-opacity disabled:opacity-50"
          >
            {isLoading ? `${displayConfirmText}...` : displayConfirmText}
          </button>
        </div>
      }
    >
      <div className="relative flex flex-col items-center text-center py-2">
        <div className="w-16 h-16 rounded-full bg-primary-500 flex items-center justify-center mb-5 shadow-[0_8px_20px_rgba(219,136,51,0.4)]">
          <img src={LogoutIcon} alt="Logout" className="w-7 h-7 brightness-0 invert" />
        </div>
        <h3 className="font-bold text-gray-900 text-xl mb-2 text-center">{displayTitle}</h3>
        <p className="text-gray-500 text-sm text-center">{displayMessage}</p>
      </div>
    </Modal>
  );
}
