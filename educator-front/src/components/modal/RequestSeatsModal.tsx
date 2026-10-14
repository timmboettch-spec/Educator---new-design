import { useEffect, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import Modal from '../ui/Modal';
import Input from '../ui/Input';
import Textarea from '../ui/Textarea';
import { Button } from '../ui/Button';
import { InlineCheckList } from '../ui/InlineCheckList';
import { toast } from '../common/Toast';
import {
  RequestMoreSeats,
  clearRequestMoreSeatsState,
  selectRequestMoreSeatsError,
  selectRequestMoreSeatsStatus,
} from '../../redux/educator/RequestMoreSeatsRedux';
import type { AppDispatch } from '../../store';

const NOTE_MAX_LENGTH = 500;
const MAX_REQUESTED_SEATS = 500;

const formatLocaleText = (
  template: string,
  vars: Record<string, string | number>
): string =>
  template.replace(/\{\{(\w+)\}\}/g, (_m, key: string) =>
    String(vars[key] ?? '')
  );

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

export interface RequestSeatProductOption {
  value: string;
  label: string;
  /** Avatar seats still available to the educator on this product. */
  availableSeats?: number;
}

interface RequestSeatsModalProps {
  isOpen: boolean;
  onClose: () => void;
  remainingSeats: number;
  labels: RequestSeatsLabels;
  /**
   * The educator's active avatar products. When given, seats are requested per
   * product; otherwise a single optional amount is asked for.
   */
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
  const { t } = useTranslation('dashboard');
  const dispatch = useDispatch<AppDispatch>();
  const status = useSelector(selectRequestMoreSeatsStatus);
  const errorMessage = useSelector(selectRequestMoreSeatsError);

  const [seatsInput, setSeatsInput] = useState('');
  const [note, setNote] = useState('');
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

  const seatsAsNumber = useMemo(() => {
    if (!seatsInput.trim()) return undefined;
    const parsed = Number(seatsInput);
    return Number.isFinite(parsed) && parsed > 0
      ? Math.floor(parsed)
      : undefined;
  }, [seatsInput]);

  // Keep the list order, not the click order.
  const selectedProductOptions = products.filter((p) =>
    selectedProducts.includes(p.value)
  );
  const seatsFor = (value: string) => Number(perProduct[value]) || 0;
  const perProductTotal = selectedProductOptions.reduce(
    (sum, p) => sum + seatsFor(p.value),
    0
  );
  const requestedSeats = hasProducts
    ? perProductTotal || undefined
    : seatsAsNumber;

  // There's no product field in the API, so the per-product breakdown goes in
  // the note for the admin to read; the limit applies to the whole note sent.
  const breakdownLines = selectedProductOptions
    .filter((p) => seatsFor(p.value) > 0)
    .map(
      (p) =>
        `• ${p.label}: ${t('requestSeats.seat', { count: seatsFor(p.value) })}`
    )
    .join('\n');
  const breakdown = breakdownLines
    ? `${t('requestSeats.breakdownHeading')}\n${breakdownLines}`
    : '';
  const NOTE_SEPARATOR = '\n\n';
  const finalNote =
    [breakdown, note.trim()].filter(Boolean).join(NOTE_SEPARATOR) || undefined;
  // Room left for the educator's own note once the breakdown is included.
  const noteLimit = breakdown
    ? Math.max(0, NOTE_MAX_LENGTH - breakdown.length - NOTE_SEPARATOR.length)
    : NOTE_MAX_LENGTH;
  const noteTooLong =
    note.length > noteLimit || (finalNote?.length ?? 0) > NOTE_MAX_LENGTH;
  const noteError = !noteTooLong
    ? undefined
    : breakdown
      ? t('requestSeats.noteMaxWithProducts', { max: noteLimit })
      : labels.noteMax;
  const seatsTooMany = (requestedSeats ?? 0) > MAX_REQUESTED_SEATS;
  const canSubmit = !isSubmitting && !noteTooLong && !seatsTooMany;

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit) return;

    try {
      await dispatch(
        RequestMoreSeats({
          requested_seats: requestedSeats,
          note: finalNote,
        })
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
            <InlineCheckList
              legend={t('requestSeats.productsQuestion')}
              options={products}
              values={selectedProducts}
              onChange={setSelectedProducts}
              searchPlaceholder={t('requestSeats.searchProducts')}
              selectAllLabel={t('requestSeats.selectAll')}
              clearAllLabel={t('requestSeats.clearAll')}
              noMatchesLabel={t('requestSeats.noMatches')}
              disabled={isSubmitting}
            />
            {selectedProductOptions.length > 0 && (
              <div className="flex flex-col gap-3 mt-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  {t('requestSeats.perProductTitle')}
                </p>
                {selectedProductOptions.map((p) => (
                  <div key={p.value} className="flex flex-col gap-1">
                    <span className="text-sm font-medium text-gray-700 break-words">
                      {p.label}
                    </span>
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
                      <Input
                        type="text"
                        inputMode="numeric"
                        value={perProduct[p.value] ?? ''}
                        onChange={(e) => {
                          const raw = (
                            e.target as HTMLInputElement
                          ).value.replace(/[^\d]/g, '');
                          setPerProduct((prev) => ({
                            ...prev,
                            [p.value]: raw,
                          }));
                        }}
                        placeholder={t('requestSeats.seatsPlaceholder')}
                        aria-label={t('requestSeats.seatsAria', {
                          name: p.label,
                        })}
                        disabled={isSubmitting}
                        className="sm:w-1/2"
                      />
                      {p.availableSeats !== undefined && (
                        <span className="sm:w-1/2 text-sm text-gray-500">
                          {t('requestSeats.currentlyAvailable')}{' '}
                          <span className="font-semibold text-primary-500 tabular-nums">
                            {p.availableSeats}
                          </span>
                        </span>
                      )}
                    </div>
                  </div>
                ))}
                {seatsTooMany && (
                  <p role="alert" className="text-xs text-red-500">
                    {t('requestSeats.maxSeats')}
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
                const raw = (e.target as HTMLInputElement).value.replace(
                  /[^\d]/g,
                  ''
                );
                setSeatsInput(raw);
              }}
              placeholder={labels.amountPlaceholder}
              disabled={isSubmitting}
              error={seatsTooMany ? t('requestSeats.maxSeats') : undefined}
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
            error={noteError}
          />
          <p
            className={`mt-1 text-xs text-right ${
              noteTooLong ? 'text-red-500' : 'text-gray-500'
            }`}
          >
            {note.length}/{noteLimit}
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
