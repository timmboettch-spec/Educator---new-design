import { useEffect, useId, useRef, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { isIsoDate } from '../../../utils/schema-utils/dateRules';
import { formatSimDate, toIsoSimDate } from '../../../utils/simAssignment';

interface EditableDateCellProps {
  /** The row's date as stored (MM-DD-YYYY or YYYY-MM-DD). */
  value: string;
  /** Translated field name, e.g. "due date". */
  fieldLabel: string;
  simTitle: string;
  /** The `<td>` classes (padding, status colour). */
  className: string;
  /** False on an archived class: the date is plain text. */
  isEditable: boolean;
  isEditing: boolean;
  isSaving: boolean;
  /** Another date in the table is saving: the date can't be opened yet. */
  isDisabled: boolean;
  error: string | null;
  onEdit: () => void;
  /** Called with the input's YYYY-MM-DD value. */
  onSave: (value: string) => void;
  onCancel: () => void;
}

/**
 * Typing a year fires a change per digit (0002, 0020, 0202, 2026); only a
 * full four-digit year counts as a picked date.
 */
const isCompleteDate = (value: string) =>
  isIsoDate(value) && Number(value.slice(0, 4)) >= 1000;

/** Keys that move around or leave the input without changing its date. */
const NON_EDITING_KEYS = new Set([
  'Tab',
  'Escape',
  'Enter',
  'Shift',
  'Control',
  'Alt',
  'Meta',
  'ArrowLeft',
  'ArrowRight',
]);

const DATE_BUTTON =
  'cursor-pointer rounded enabled:hover:underline decoration-dotted underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-1 disabled:cursor-not-allowed';

const DATE_INPUT =
  'border border-gray-300 rounded px-1.5 py-0.5 text-xs text-gray-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 read-only:bg-gray-100';

/**
 * An assignment date that turns into a date input when clicked. Picking a day
 * in the calendar validates and saves it straight away; browsing months
 * doesn't. A typed date saves on Enter or when leaving the input (typing 1
 * then 0 must not save the 01st). Escape, or leaving with the date unchanged,
 * cancels. Errors stay next to the input.
 */
export function EditableDateCell({
  value,
  fieldLabel,
  simTitle,
  className,
  isEditable,
  isEditing,
  isSaving,
  isDisabled,
  error,
  onEdit,
  onSave,
  onCancel,
}: EditableDateCellProps) {
  const { t } = useTranslation('classManagement');
  const errorId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const wasEditingRef = useRef(isEditing);
  // A key changed the date: Chrome fires `change` per typed digit, so wait for
  // Enter or blur instead of saving each step.
  const hasTypedRef = useRef(false);
  // The value last handed to onSave, so a blur after it (e.g. as the input
  // closes) doesn't send the same date again.
  const lastCommittedRef = useRef<string | null>(null);

  // A save or Escape removes the focused input, dropping focus to the page: put
  // it back on the date. A blur to another control keeps focus where it went.
  useEffect(() => {
    const wasEditing = wasEditingRef.current;
    wasEditingRef.current = isEditing;
    const hasLostFocus =
      !document.activeElement || document.activeElement === document.body;
    if (wasEditing && !isEditing && hasLostFocus) buttonRef.current?.focus();
    if (isEditing) {
      hasTypedRef.current = false;
      lastCommittedRef.current = null;
    }
  }, [isEditing]);

  const commit = (next: string) => {
    lastCommittedRef.current = next;
    onSave(next);
  };

  // Save a calendar pick on the native `change`, not React's onChange (which
  // follows every `input`): Chrome's calendar updates the value as the month
  // arrows move the selection, but only fires `change` once a day is picked.
  useEffect(() => {
    const input = inputRef.current;
    if (!isEditing || !input) return;
    const handleChange = () => {
      if (!hasTypedRef.current && isCompleteDate(input.value)) {
        lastCommittedRef.current = input.value;
        onSave(input.value);
      }
    };
    input.addEventListener('change', handleChange);
    return () => input.removeEventListener('change', handleChange);
  }, [isEditing, onSave]);

  const display = formatSimDate(value);

  if (!isEditable) return <td className={className}>{display}</td>;

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      // Only this edit closes, not anything around the table.
      e.preventDefault();
      e.stopPropagation();
      onCancel();
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      // Unlike blur, Enter re-sends the same date, so a refused save can be retried.
      commitOrCancel(e.currentTarget.value);
      return;
    }
    if (!NON_EDITING_KEYS.has(e.key)) hasTypedRef.current = true;
  };

  // Enter or leaving the input saves a changed date (the hook validates it and
  // keeps the input open with the message if it's invalid); a cleared or
  // unchanged date cancels.
  const commitOrCancel = (next: string) => {
    if (!next || next === toIsoSimDate(value)) {
      onCancel();
      return;
    }
    commit(next);
  };

  const handleBlur = (next: string) => {
    if (next === lastCommittedRef.current) return;
    commitOrCancel(next);
  };

  return (
    <td className={className}>
      {isEditing ? (
        <div className="flex flex-col gap-1">
          <input
            ref={inputRef}
            type="date"
            autoFocus
            defaultValue={toIsoSimDate(value)}
            // Read-only rather than disabled while saving, so focus stays here.
            readOnly={isSaving}
            aria-busy={isSaving}
            aria-label={t('simSubtable.editDateInput', {
              field: fieldLabel,
              title: simTitle,
            })}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
            onKeyDown={handleKeyDown}
            // A click (e.g. to open the calendar) means the next change is a pick.
            onPointerDown={() => {
              hasTypedRef.current = false;
            }}
            onBlur={(e) => handleBlur(e.currentTarget.value)}
            className={DATE_INPUT}
          />
          {isSaving && (
            <span role="status" className="text-xs text-gray-500">
              {t('simSubtable.dateSaving')}
            </span>
          )}
          {error && (
            <p
              id={errorId}
              role="alert"
              className="max-w-[12rem] whitespace-normal text-xs font-normal text-red-600"
            >
              {error}
            </p>
          )}
        </div>
      ) : (
        <button
          ref={buttonRef}
          type="button"
          onClick={onEdit}
          disabled={isDisabled}
          title={t('simSubtable.editDateHint')}
          aria-label={t('simSubtable.editDateButton', {
            field: fieldLabel,
            title: simTitle,
            date: display,
          })}
          className={DATE_BUTTON}
        >
          {display}
        </button>
      )}
    </td>
  );
}
