import { useState } from "react";
import { Play, TriangleAlert } from "lucide-react";
import Modal from "../ui/Modal";
import { Button } from "../ui/Button";

/**
 * Two-step confirmation for an educator preview attempt.
 *
 * Step 1 explains what a preview is (practice mode only, nothing stored, uses one
 * of three attempts). Step 2 is the final "yes, use an attempt" confirmation. The
 * two-step flow guards against accidentally spending a limited attempt.
 */
interface PreviewSimulationModalProps {
  isOpen: boolean;
  simName: string;
  remaining: number;
  onClose: () => void;
  onConfirm: () => void;
}

export default function PreviewSimulationModal({
  isOpen,
  simName,
  remaining,
  onClose,
  onConfirm,
}: PreviewSimulationModalProps) {
  const [step, setStep] = useState<1 | 2>(1);

  if (!isOpen) return null;

  const close = () => {
    setStep(1);
    onClose();
  };

  const footer =
    step === 1 ? (
      <div className="flex gap-3">
        <Button
          type="button"
          variant="secondary"
          className="w-1/2 h-11 rounded-full"
          onClick={close}
        >
          Cancel
        </Button>
        <Button
          type="button"
          variant="gradient"
          className="w-1/2 h-11 rounded-full"
          disabled={remaining <= 0}
          onClick={() => setStep(2)}
        >
          Continue
        </Button>
      </div>
    ) : (
      <div className="flex gap-3">
        <Button
          type="button"
          variant="secondary"
          className="w-1/2 h-11 rounded-full"
          onClick={() => setStep(1)}
        >
          Back
        </Button>
        <Button
          type="button"
          variant="gradient"
          className="w-1/2 h-11 rounded-full"
          disabled={remaining <= 0}
          onClick={() => {
            onConfirm();
            setStep(1);
          }}
        >
          Yes, use 1 preview attempt
        </Button>
      </div>
    );

  return (
    <Modal
      isOpen={isOpen}
      onClose={close}
      title="Preview Simulation"
      footer={footer}
      className="max-w-lg w-full"
    >
      {/* Attempts remaining — kept prominent in both steps. */}
      <div className="mb-4 flex items-center justify-center">
        <span
          className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm font-semibold ${
            remaining > 0
              ? "bg-[#e9e9e9] text-[#5f6060]"
              : "bg-red-100 text-red-700"
          }`}
        >
          {remaining} of 3 preview attempt{remaining === 1 ? "" : "s"} remaining
        </span>
      </div>

      {step === 1 ? (
        <div className="space-y-3 text-sm text-gray-700 leading-relaxed">
          <p className="flex items-start gap-2">
            <Play size={16} className="text-primary-500 mt-0.5 flex-shrink-0" />
            <span>
              You&rsquo;re about to preview{" "}
              <span className="font-semibold text-gray-900">{simName}</span> in{" "}
              <span className="font-semibold">Practice mode</span>. No student
              access code is needed — your educator login is enough.
            </span>
          </p>
          <ul className="list-disc pl-6 space-y-1.5">
            <li>Previews run in Practice mode only.</li>
            <li>
              This uses <span className="font-semibold">one of your 3</span>{" "}
              preview attempts for this simulation.
            </li>
            <li>
              <span className="font-semibold">Nothing is saved.</span> No report
              or transcript is stored for a preview. You can review the report and
              transcript during the attempt, but they can&rsquo;t be retrieved
              later from anywhere.
            </li>
          </ul>
        </div>
      ) : (
        <div className="space-y-3 text-sm text-gray-700 leading-relaxed">
          <div className="flex items-start gap-2 rounded-md bg-[#e9e9e9] px-3 py-2 text-primary-700">
            <TriangleAlert size={16} className="mt-0.5 flex-shrink-0" />
            <span>
              This will use <span className="font-semibold">1</span> of your{" "}
              <span className="font-semibold">{remaining}</span> remaining preview
              attempt{remaining === 1 ? "" : "s"} for{" "}
              <span className="font-semibold text-gray-900">{simName}</span>. This
              can&rsquo;t be undone.
            </span>
          </div>
          <p>Are you sure you want to start the preview now?</p>
        </div>
      )}
    </Modal>
  );
}
