import Modal from '../../components/ui/Modal';
import { Button } from '../ui/Button';
import Input from '../ui/Input';
import FormField from '../ui/FormField';
import { sanitizePasswordForTyping } from '../../utils/inputSecurity';

type PasswordModalProps = {
  showPasswordModal: boolean;
  oldPassword: string;
  setOldPassword: (password: string) => void;
  newPassword: string;
  setNewPassword: (password: string) => void;
  confirmPassword: string;
  setConfirmPassword: (password: string) => void;
  errors: {
    oldPassword?: string;
    newPassword?: string;
    confirmPassword?: string;
  };
  isChangingPassword: boolean;
  handleChangePassword: () => void;
  closePasswordModal: () => void;
  onBlurOldPassword?: () => void;
  onBlurNewPassword?: () => void;
  onBlurConfirmPassword?: () => void;
  copy?: {
    title?: string;
    cancel?: string;
    updatePassword?: string;
    updating?: string;
    oldPassword?: string;
    oldPasswordPlaceholder?: string;
    newPassword?: string;
    newPasswordPlaceholder?: string;
    confirmPassword?: string;
    confirmPasswordPlaceholder?: string;
  };
};

export default function PasswordModal({
  showPasswordModal,
  oldPassword,
  setOldPassword,
  newPassword,
  setNewPassword,
  confirmPassword,
  setConfirmPassword,
  errors,
  isChangingPassword,
  handleChangePassword,
  closePasswordModal,
  onBlurOldPassword,
  onBlurNewPassword,
  onBlurConfirmPassword,
  copy,
}: PasswordModalProps) {
  if (!showPasswordModal) return null;

  const localizedCopy = {
    title: copy?.title ?? 'Change Password',
    cancel: copy?.cancel ?? 'Cancel',
    updatePassword: copy?.updatePassword ?? 'Update Password',
    updating: copy?.updating ?? 'Updating...',
    oldPassword: copy?.oldPassword ?? 'Old Password',
    oldPasswordPlaceholder: copy?.oldPasswordPlaceholder ?? 'Old Password',
    newPassword: copy?.newPassword ?? 'New Password',
    newPasswordPlaceholder: copy?.newPasswordPlaceholder ?? 'New Password',
    confirmPassword: copy?.confirmPassword ?? 'Confirm Password',
    confirmPasswordPlaceholder:
      copy?.confirmPasswordPlaceholder ?? 'Confirm Password',
  };

  return (
    <Modal
      isOpen={showPasswordModal}
      onClose={closePasswordModal}
      title={localizedCopy.title}
      footer={
        <div className="flex gap-4">
          <Button
            onClick={closePasswordModal}
            variant="secondary"
            className="w-1/2 h-11 rounded-full"
          >
            {localizedCopy.cancel}
          </Button>
          <Button
            type="submit"
            form="password-form"
            disabled={isChangingPassword}
            className="w-1/2 h-11 rounded-full bg-primary-500 text-white disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isChangingPassword
              ? localizedCopy.updating
              : localizedCopy.updatePassword}
          </Button>
        </div>
      }
    >
      <form
        id="password-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (!isChangingPassword) handleChangePassword();
        }}
        className="flex flex-col gap-4"
      >
        {/* Hidden submit triggers Enter-key submission in all browsers */}
        <button
          type="submit"
          aria-hidden="true"
          className="hidden"
          tabIndex={-1}
        />
        <FormField
          label={localizedCopy.oldPassword}
          error={errors.oldPassword || undefined}
        >
          <Input
            type="password"
            value={oldPassword}
            placeholder={localizedCopy.oldPasswordPlaceholder}
            onChange={(e) =>
              setOldPassword(sanitizePasswordForTyping(e.target.value))
            }
            onBlur={onBlurOldPassword}
            autoComplete="off"
          />
        </FormField>
        <FormField
          label={localizedCopy.newPassword}
          error={errors.newPassword || undefined}
        >
          <Input
            type="password"
            placeholder={localizedCopy.newPasswordPlaceholder}
            value={newPassword}
            onChange={(e) =>
              setNewPassword(sanitizePasswordForTyping(e.target.value))
            }
            onBlur={onBlurNewPassword}
          />
        </FormField>
        <FormField
          label={localizedCopy.confirmPassword}
          error={errors.confirmPassword || undefined}
        >
          <Input
            type="password"
            placeholder={localizedCopy.confirmPasswordPlaceholder}
            value={confirmPassword}
            onChange={(e) =>
              setConfirmPassword(sanitizePasswordForTyping(e.target.value))
            }
            onBlur={onBlurConfirmPassword}
          />
        </FormField>
      </form>
    </Modal>
  );
}
