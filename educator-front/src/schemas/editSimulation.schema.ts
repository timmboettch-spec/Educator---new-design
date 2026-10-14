import type { TFunction } from 'i18next';
import * as Yup from 'yup';
import { ISO_DATE_REGEX } from '../utils/schema-utils/dateRules';
import { formatSimDate } from '../utils/simAssignment';

export interface EditSimulationFormValues {
  /** YYYY-MM-DD, as the date inputs give it; '' when cleared. */
  startDate: string;
  dueDate: string;
  closeDate: string;
}

interface EditSimulationSchemaOptions {
  t: TFunction<'classManagement'>;
  /** The assignment's saved start and close dates (YYYY-MM-DD, or ''). */
  originalStart: string;
  originalClose: string;
}

/**
 * Validation for the Edit Simulation Assignment modal: all three dates are
 * required and stay in order (start ≤ due ≤ close). A start can't move
 * earlier, and a close can't move later, than the assignment's saved dates.
 */
export const getEditSimulationSchema = ({
  t,
  originalStart,
  originalClose,
}: EditSimulationSchemaOptions) => {
  const isoDate = (requiredMessage: string) =>
    Yup.string()
      .required(requiredMessage)
      .matches(ISO_DATE_REGEX, t('editSimModal.errInvalidDate'));

  return Yup.object({
    startDate: isoDate(t('editSimModal.errStartRequired'))
      .test(
        'not-before-original-start',
        t('editSimModal.errStartBeforeOriginal', {
          date: formatSimDate(originalStart),
        }),
        (value) => !value || !originalStart || value >= originalStart
      )
      .test(
        'not-after-original-close',
        t('editSimModal.errStartAfterClose', {
          date: formatSimDate(originalClose),
        }),
        (value) => !value || !originalClose || value <= originalClose
      ),
    dueDate: isoDate(t('editSimModal.errDueRequired'))
      .test(
        'not-before-start',
        t('editSimModal.errDueBeforeStart'),
        function (value) {
          const { startDate } = this.parent;
          return !value || !startDate || value >= startDate;
        }
      )
      .test(
        'not-after-close',
        t('editSimModal.errDueAfterClose'),
        function (value) {
          const { closeDate } = this.parent;
          return !value || !closeDate || value <= closeDate;
        }
      ),
    closeDate: isoDate(t('editSimModal.errCloseRequired'))
      .test(
        'not-before-due',
        t('editSimModal.errCloseBeforeDue'),
        function (value) {
          const { dueDate, startDate } = this.parent;
          const earliest = dueDate || startDate;
          return !value || !earliest || value >= earliest;
        }
      )
      .test(
        'not-after-original-close',
        t('editSimModal.errCloseAfterOriginal', {
          date: formatSimDate(originalClose),
        }),
        (value) => !value || !originalClose || value <= originalClose
      ),
  });
};
