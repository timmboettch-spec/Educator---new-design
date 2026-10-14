import { useId, type ReactNode } from 'react';
import { AlertCircle } from 'lucide-react';
import { Button } from '../ui/Button';
import Modal from '../ui/Modal';
import { cn } from '@/lib/utils';

interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  /** Body copy; may contain inline emphasis (e.g. the item's name). */
  message: ReactNode;
  /** Name of the item being acted on, shown above the message. */
  itemName?: string;
  confirmText: string;
  cancelText: string;
  isLoading: boolean;
  loadingText: string;
  /**
   * `default`: centred red alert. `compact`: a narrow, left-aligned dialog with
   * the `icon` beside the title and a solid primary confirm button (e.g. the
   * library's "Remove from My Library?").
   */
  variant?: 'default' | 'compact';
  /** Icon shown beside the title in the `compact` variant. */
  icon?: ReactNode;
}

const COMPACT_BUTTON =
  'flex-1 px-4 py-2 rounded-full text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 focus-visible:ring-offset-2';

/** Shared confirmation dialog for destructive actions such as deletes. */
export function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  itemName,
  confirmText,
  cancelText,
  isLoading,
  loadingText,
  variant = 'default',
  icon,
}: ConfirmDialogProps) {
  const titleId = useId();

  if (variant === 'compact') {
    return (
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title=""
        ariaLabelledBy={titleId}
        className="max-w-sm"
        contentClassName="pb-0"
        footer={
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className={cn(
                COMPACT_BUTTON,
                'border border-gray-200 text-gray-600 hover:bg-gray-50'
              )}
            >
              {cancelText}
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={isLoading}
              className={cn(
                COMPACT_BUTTON,
                'bg-primary-500 text-white hover:bg-primary-600 disabled:opacity-60'
              )}
            >
              {isLoading ? loadingText : confirmText}
            </button>
          </div>
        }
      >
        <div className="flex items-center gap-3 mb-3">
          {icon && (
            <div className="w-9 h-9 rounded-full bg-primary-100 flex items-center justify-center flex-shrink-0">
              {icon}
            </div>
          )}
          <h2
            id={titleId}
            className="font-semibold text-gray-900 text-sm leading-snug"
          >
            {title}
          </h2>
        </div>
        <p className="text-sm text-gray-500 leading-relaxed mb-1">{message}</p>
      </Modal>
    );
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title=""
      ariaLabelledBy={titleId}
      footer={
        <div className="flex gap-4">
          <Button
            variant="secondary"
            onClick={onClose}
            className="w-1/2 h-11 rounded-full"
          >
            {cancelText}
          </Button>
          <Button
            onClick={onConfirm}
            disabled={isLoading}
            className="w-1/2 h-11 rounded-full bg-gradient-btn text-white hover:opacity-90 disabled:opacity-60"
          >
            {isLoading ? loadingText : confirmText}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col items-center text-center py-4">
        <div className="flex items-center justify-center w-14 h-14 rounded-full bg-red-100 mb-4">
          <AlertCircle className="w-7 h-7 text-red-500" />
        </div>
        <h2 id={titleId} className="text-base font-semibold mb-2">
          {title}
        </h2>
        {itemName && (
          <p className="text-sm font-medium text-gray-700 mb-1">{itemName}</p>
        )}
        <p className="text-sm text-gray-500">{message}</p>
      </div>
    </Modal>
  );
}
