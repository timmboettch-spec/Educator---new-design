import { useEffect, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import Modal from '../ui/Modal';
import Input from '../ui/Input';
import Textarea from '../ui/Textarea';
import MultiSelect from '../ui/MultiSelect';
import { Button } from '../ui/Button';
import { toast } from '../common/Toast';
import {
  RequestMoreSeats,
  clearRequestMoreSeatsState,
  selectRequestMoreSeatsError,
  selectRequestMoreSeatsStatus,
} from '../../redux/educator/RequestMoreSeatsRedux';
import type { AppDispatch } from '../../store';

const NOTE_MAX_LENGTH = 500;

const formatLocaleText = (
  template: string,
  vars: Record<string, string | number>,
): string =>
  template.replace(/\{\{(\w+)\}\}/g, (_m, key: string) => String(vars[key] ?? ''));

interface RequestSeatsLabels {
  title: string;
  description: string;
  amountLabel: string;
  amountPlaceholder: string;
  noteLabel: string;
  notePlaceholder: string;
  submit: string;
  cancel: string;
  sending: string;
  successToast: string;
  errorToast: string;
  noteMax: string;
  remainingTemplate: string;
}

interface RequestSeatProductOption {
  value: string;
  label: string;
  /** Avatar seats currently available to this educator on the product. */
  availableSeats?: number;
}

interface RequestSeatsModalProps {
  isOpen: boolean;
  onClose: () => void;
  remainingSeats: number;
  labels: RequestSeatsLabels;
  /** The educator's ACTIVE avatar products, to request seats against. */
  products?: RequestSeatProductOption[];
}

/**
 * Educator CTA modal for requesting the admin to allocate more AI seats.
 * Both the requested seat count and the note are optional so an educator
 * can either send a general "please allocate more" ping or a specific
 * request with an amount and justification.
 */
export default function RequestSeatsModal({
  isOpen,
  onClose,
  remainingSeats,
  labels,
  products = [],
}: RequestSeatsModalProps): React.ReactElement {
  const dispatch = useDispatch<AppDispatch>();
  const status = useSelector(selectRequestMoreSeatsStatus);
  const errorMessage = useSelector(selectRequestMoreSeatsError);

  const [seatsInput, setSeatsInput] = useState('');
  const [note, setNote] = useState('');
  // Per-product seat requests (only when the educator has active products).
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
  const [perProduct, setPerProduct] = useState<Record<string, string>>({});

  const hasProducts = products.length > 0;
  const isSubmitting = status === 'loading';

  // Reset local + slice state each time the modal is (re)opened so a
  // previous error message or pre-filled value doesn't leak into a new
  // request.
  useEffect(() => {
    if (isOpen) {
      setSeatsInput('');
      setNote('');
      setSelectedProducts([]);
      setPerProduct({});
      dispatch(clearRequestMoreSeatsState());
    }
  }, [isOpen, dispatch]);

  const selectedProductOptions = products.filter((p) =>
    selectedProducts.includes(p.value),
  );
  const perProductTotal = selectedProductOptions.reduce(
    (sum, p) => sum + (Number(perProduct[p.value]) || 0),
    0,
  );

  const seatsAsNumber = useMemo(() => {
    if (!seatsInput.trim()) return undefined;
    const parsed = Number(seatsInput);
    return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : undefined;
  }, [seatsInput]);

  const requestedSeats = hasProducts
    ? perProductTotal > 0
      ? perProductTotal
      : undefined
    : seatsAsNumber;

  const noteTooLong = note.length > NOTE_MAX_LENGTH;
  const seatsTooMany = (requestedSeats ?? 0) > 500;
  const canSubmit = !isSubmitting && !noteTooLong && !seatsTooMany;

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit) return;

    // When products are shown, capture the per-product breakdown in the note so
    // the admin sees exactly which products need more seats (no backend field).
    const breakdown = selectedProductOptions
      .map((p) => {
        const n = Number(perProduct[p.value]) || 0;
        return n > 0 ? `• ${p.label}: ${n} seat${n === 1 ? '' : 's'}` : '';
      })
      .filter(Boolean)
      .join('\n');
    const finalNote =
      [
        breakdown ? `Requested seats by product:\n${breakdown}` : '',
        note.trim(),
      ]
        .filter(Boolean)
        .join('\n\n') || undefined;

    try {
      await dispatch(
        RequestMoreSeats({
          requested_seats: requestedSeats,
          note: finalNote,
        }),
      ).unwrap();
      toast.success(labels.successToast);
      onClose();
    } catch (err) {
      const message =
        (err as { message?: string } | undefined)?.message ||
        errorMessage ||
        labels.errorToast;
      toast.error(message);
    }
  };

  const remainingLine = formatLocaleText(labels.remainingTemplate, {
    remaining: remainingSeats,
  });

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={labels.title}
      className="max-w-2xl"
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <p className="text-sm text-gray-600">{labels.description}</p>
        <p className="text-xs text-gray-500">{remainingLine}</p>

        {hasProducts ? (
          <div className="flex flex-col gap-2">
            <label className="block text-sm font-medium text-gray-700">
              Which products do you need more seats on?
            </label>
            <MultiSelect
              values={selectedProducts}
              options={products.map((p) => ({ value: p.value, label: p.label }))}
              onChange={setSelectedProducts}
              searchable
              inline
              placeholder="Search your avatar products…"
            />
            {selectedProductOptions.length > 0 && (
              <div className="flex flex-col gap-3 mt-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Seats requested per product
                </p>
                {selectedProductOptions.map((p) => (
                  <div key={p.value} className="flex flex-col gap-1">
                    <span className="text-sm font-medium text-gray-700">
                      {p.label}
                    </span>
                    <div className="flex items-center gap-3">
                      <Input
                        type="text"
                        inputMode="numeric"
                        value={perProduct[p.value] ?? ''}
                        onChange={(e) => {
                          const raw = (e.target as HTMLInputElement).value.replace(
                            /[^\d]/g,
                            '',
                          );
                          setPerProduct((prev) => ({ ...prev, [p.value]: raw }));
                        }}
                        placeholder="Seats to request"
                        disabled={isSubmitting}
                        className="w-1/2"
                      />
                      {p.availableSeats !== undefined && (
                        <span className="w-1/2 text-sm text-gray-500">
                          Currently available:{' '}
                          <span className="font-semibold text-primary-500">
                            {p.availableSeats}
                          </span>
                        </span>
                      )}
                    </div>
                  </div>
                ))}
                {seatsTooMany && (
                  <p className="text-xs text-red-500">
                    Maximum 500 seats can be requested in total.
                  </p>
                )}
              </div>
            )}
          </div>
        ) : (
          <div>
            <label
              htmlFor="request-seats-amount"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              {labels.amountLabel}
            </label>
            <Input
              id="request-seats-amount"
              type="number"
              inputMode="numeric"
              min={1}
              max={500}
              step={1}
              value={seatsInput}
              onChange={(e) => {
                const raw = (e.target as HTMLInputElement).value.replace(/[^\d]/g, '');
                setSeatsInput(raw);
              }}
              placeholder={labels.amountPlaceholder}
              disabled={isSubmitting}
              error={seatsTooMany ? 'Maximum 500 seats can be requested' : undefined}
            />
          </div>
        )}

        <div>
          <label
            htmlFor="request-seats-note"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            {labels.noteLabel}
          </label>
          <Textarea
            id="request-seats-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={labels.notePlaceholder}
            rows={4}
            maxLength={NOTE_MAX_LENGTH + 50}
            disabled={isSubmitting}
            error={noteTooLong ? labels.noteMax : undefined}
          />
          <p
            className={`mt-1 text-xs text-right ${
              noteTooLong ? 'text-red-500' : 'text-gray-500'
            }`}
          >
            {note.length}/{NOTE_MAX_LENGTH}
          </p>
        </div>

        <div className="flex items-center justify-end gap-2 pt-2">
          <Button
            type="button"
            variant="cancel"
            onClick={onClose}
            disabled={isSubmitting}
          >
            {labels.cancel}
          </Button>
          <Button
            type="submit"
            variant="gradient"
            className="text-white text-sm"
            disabled={!canSubmit}
          >
            {isSubmitting ? labels.sending : labels.submit}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
