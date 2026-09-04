import { useEffect, useState } from "react";
import { AlertCircle, AlertTriangle } from "lucide-react";
import Modal from "../ui/Modal";
import { Button } from "../ui/Button";

interface TwoStepDeleteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isDeleting?: boolean;
  /** Kind of thing being deleted, lowercase, e.g. "educator", "school". */
  itemLabel: string;
  /** The specific name shown in quotes (optional). */
  itemName?: string;
  /** Final destructive-button text, e.g. "Delete Educator". */
  confirmLabel: string;
  /** Optional overrides for the two step messages. */
  step1Message?: string;
  step2Message?: string;
}

/**
 * A reusable TWO-STEP delete confirmation. Step 1 asks whether to proceed; Step 2
 * is a final, explicit "this cannot be undone" confirmation before the delete
 * fires. Used for every destructive delete/remove across the admin site so the
 * experience is consistent (educators, schools, product associations, …).
 */
export default function TwoStepDeleteModal({
  isOpen,
  onClose,
  onConfirm,
  isDeleting = false,
  itemLabel,
  itemName,
  confirmLabel,
  step1Message,
  step2Message,
}: TwoStepDeleteModalProps) {
  const [step, setStep] = useState<1 | 2>(1);

  // Always restart at step 1 whenever the dialog (re)opens.
  useEffect(() => {
    if (isOpen) setStep(1);
  }, [isOpen]);

  if (!isOpen) return null;

  const named = itemName ? (
    <>
      {" "}
      <span className="font-semibold text-gray-700">&ldquo;{itemName}&rdquo;</span>
    </>
  ) : null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="">
      <div className="flex flex-col items-center text-center px-6 py-6">
        <div
          className={`flex items-center justify-center w-14 h-14 rounded-full mb-4 ${
            step === 1 ? "bg-red-100" : "bg-red-500/15"
          }`}
        >
          {step === 1 ? (
            <AlertCircle className="w-7 h-7 text-red-500" />
          ) : (
            <AlertTriangle className="w-7 h-7 text-red-600" />
          )}
        </div>

        {step === 1 ? (
          <>
            <h2 className="text-base font-semibold text-gray-800 mb-2">
              Delete this {itemLabel}?
            </h2>
            <p className="text-sm text-gray-500 mb-6 max-w-sm">
              {step1Message ?? (
                <>
                  Are you sure you want to delete the {itemLabel}
                  {named}? You&rsquo;ll be asked to confirm once more.
                </>
              )}
            </p>
            <div className="flex gap-4 w-full">
              <Button
                type="button"
                variant="secondary"
                onClick={onClose}
                className="w-1/2 h-11 rounded-full text-sm font-medium"
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={() => setStep(2)}
                className="w-1/2 h-11 rounded-full bg-primary-500 hover:bg-primary-600 text-white text-sm font-medium"
              >
                Continue
              </Button>
            </div>
          </>
        ) : (
          <>
            <h2 className="text-base font-semibold text-gray-800 mb-2">
              This can&rsquo;t be undone
            </h2>
            <p className="text-sm text-gray-500 mb-6 max-w-sm">
              {step2Message ??
                `This permanently deletes the ${itemLabel} and cannot be undone. Confirm to proceed.`}
            </p>
            <div className="flex gap-4 w-full">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setStep(1)}
                className="w-1/2 h-11 rounded-full text-sm font-medium"
              >
                Back
              </Button>
              <Button
                type="button"
                onClick={onConfirm}
                loading={isDeleting}
                className="w-1/2 h-11 rounded-full bg-red-600 hover:bg-red-700 text-white text-sm font-medium"
              >
                {confirmLabel}
              </Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
