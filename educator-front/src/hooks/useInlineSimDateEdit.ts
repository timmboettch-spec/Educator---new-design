import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ValidationError } from 'yup';
import type { SimulationItem } from '@/types';
import { toast } from '../components/common/Toast';
import { getApiErrorMessage } from '../redux/api/classes/classesService';
import { useUpdateClassSimulationMutation } from '../redux/api/classSimulations/classSimulationsApi';
import type { UpdateClassSimulationReqDto } from '../redux/api/classSimulations/classSimulations.types';
import type { SimDateField } from '../redux/api/classSimulations/classSimulationsService';
import { getSimDateEditSchema } from '../schemas/simDateEdit.schema';
import { toIsoSimDate } from '../utils/simAssignment';

/** Each row date's name in the update API; the listing's `closeDate` is `endDate` there. */
const UPDATE_FIELD = {
  start_date: 'startDate',
  due_date: 'dueDate',
  end_date: 'endDate',
} as const satisfies Record<SimDateField, keyof UpdateClassSimulationReqDto>;

interface UseInlineSimDateEditOptions {
  /** Runs after a successful save, e.g. to reload data the cache tag doesn't cover. */
  onSaved?: () => void;
}

export interface SimDateEditTarget {
  simId: string;
  field: SimDateField;
}

/**
 * In-row editing of an assignment's start, due and close dates: which cell is
 * open (one at a time), its validation or save error, and the save itself.
 * A saved date refreshes the list through the `ClassSimulations` tag.
 */
export function useInlineSimDateEdit({
  onSaved,
}: UseInlineSimDateEditOptions = {}) {
  const { t } = useTranslation('classManagement');
  const [editing, setEditing] = useState<SimDateEditTarget | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [updateClassSimulation, { isLoading: isSaving }] =
    useUpdateClassSimulationMutation();

  const close = () => {
    setEditing(null);
    setError(null);
  };

  // While a date is saving, the other dates stay closed: the save's result
  // would otherwise close or show its error on the newly opened one.
  const startEdit = (simId: string, field: SimDateField) => {
    if (isSaving) return;
    setEditing({ simId, field });
    setError(null);
  };

  // Blur and Escape both land here; a save in flight finishes first.
  const cancelEdit = () => {
    if (!isSaving) close();
  };

  /** Saves `value` (YYYY-MM-DD) as the row's `field`; an unchanged date just closes. */
  const saveDate = async (
    sim: SimulationItem,
    field: SimDateField,
    value: string
  ) => {
    if (isSaving) return;
    if (value === toIsoSimDate(sim[field])) {
      close();
      return;
    }
    try {
      getSimDateEditSchema({ t, field, sim }).validateSync(value);
    } catch (validationError) {
      if (validationError instanceof ValidationError) {
        setError(validationError.message);
        return;
      }
      throw validationError;
    }
    try {
      await updateClassSimulation({
        id: sim.id,
        body: { [UPDATE_FIELD[field]]: value },
      }).unwrap();
      close();
      toast.success(t('simSubtable.dateSaved'));
      onSaved?.();
    } catch (saveError) {
      setError(getApiErrorMessage(saveError, t('simSubtable.dateSaveFailed')));
    }
  };

  return { editing, error, isSaving, startEdit, cancelEdit, saveDate };
}
