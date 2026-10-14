import type { FormEventHandler, ReactNode } from 'react';
import { cn } from '../../lib/utils';
import { Button } from '../ui/Button';
import Modal from '../ui/Modal';

interface FormModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  /** DOM id of the <form>; the footer submit button targets it via `form`. */
  formId: string;
  onSubmit: FormEventHandler<HTMLFormElement>;
  submitText: string;
  submittingText: string;
  cancelText: string;
  isSubmitting: boolean;
  /** Extra condition that blocks submission, e.g. a pending file validation. */
  isSubmitDisabled?: boolean;
  /** `primary`: solid brand fill instead of the default gradient. */
  submitTone?: 'gradient' | 'primary';
  /** Extra classes for the dialog panel, e.g. a wider max width. */
  className?: string;
  children: ReactNode;
}

const SUBMIT_TONE = {
  gradient: 'bg-gradient-btn',
  primary: 'bg-primary-500',
} as const;

/**
 * Shared modal for forms: renders the form body plus a Back / Submit footer.
 * The footer sits outside the <form>, so the submit button is linked to it by id,
 * and a hidden submit button keeps Enter-to-submit working in all browsers.
 */
export function FormModal({
  isOpen,
  onClose,
  title,
  formId,
  onSubmit,
  submitText,
  submittingText,
  cancelText,
  isSubmitting,
  isSubmitDisabled = false,
  submitTone = 'gradient',
  className,
  children,
}: FormModalProps) {
  // The dialog can't be closed (Back, Escape, overlay) while submitting.
  const handleClose = () => {
    if (!isSubmitting) onClose();
  };

  // Enter in any field still submits the form, so the footer button being
  // disabled isn't enough: ignore submits while one is in flight or blocked.
  const handleSubmit: FormEventHandler<HTMLFormElement> = (e) => {
    if (isSubmitting || isSubmitDisabled) {
      e.preventDefault();
      return;
    }
    onSubmit(e);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={title}
      className={className}
      footer={
        <div className="flex gap-4">
          <Button
            type="button"
            variant="secondary"
            onClick={handleClose}
            disabled={isSubmitting}
            className="w-1/2 h-11 rounded-full"
          >
            {cancelText}
          </Button>
          <Button
            type="submit"
            form={formId}
            disabled={isSubmitting || isSubmitDisabled}
            // Spinner plus `submittingText` while submitting.
            loading={isSubmitting}
            loadingText={submittingText}
            className={cn(
              'w-1/2 h-11 rounded-full text-white hover:opacity-90 disabled:opacity-60',
              SUBMIT_TONE[submitTone]
            )}
          >
            {submitText}
          </Button>
        </div>
      }
    >
      <form id={formId} onSubmit={handleSubmit} className="flex flex-col gap-5">
        <button
          type="submit"
          aria-hidden="true"
          className="hidden"
          tabIndex={-1}
        />
        {children}
      </form>
    </Modal>
  );
}
