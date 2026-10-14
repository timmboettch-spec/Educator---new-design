import type { TFunction } from 'i18next';
import * as Yup from 'yup';
import {
  BULK_ASSIGN_MAX_CLASSES,
  BULK_ASSIGN_MAX_SIMULATIONS,
} from '../redux/api/classSimulations/classSimulations.types';
import {
  isIsoDate,
  isTodayOrFutureDate,
} from '../utils/schema-utils/dateRules';

export interface AssignSimulationsFormValues {
  schoolId: string;
  classIds: string[];
  /** Simulation business ids. */
  simulationIds: string[];
  /** YYYY-MM-DD, as the date inputs give it; '' when empty. */
  startDate: string;
  dueDate: string;
  endDate: string;
}

/** A filled-in, real calendar date; anything else skips the order checks. */
const isRealDate = (value: unknown): value is string =>
  typeof value === 'string' && isIsoDate(value);

/**
 * Validation for the Create Simulation Assignment modal: a school, at least
 * one class and simulation (up to the BE limits), and three dates in order
 * (today ≤ start ≤ due ≤ end).
 */
export const getAssignSimulationsSchema = (
  t: TFunction<'simulationAssignment'>
) => {
  const isoDate = (requiredMessage: string) =>
    Yup.string()
      .required(requiredMessage)
      // Strict: 2026-02-31 has the right shape but isn't a date.
      .test('valid-date', t('errors.invalidDate'), (value) =>
        !value ? true : isIsoDate(value)
      );

  return Yup.object({
    schoolId: Yup.string().required(t('errors.schoolRequired')),
    classIds: Yup.array(Yup.string().required())
      .min(1, t('errors.classRequired'))
      .max(
        BULK_ASSIGN_MAX_CLASSES,
        t('errors.classMax', { max: BULK_ASSIGN_MAX_CLASSES })
      ),
    simulationIds: Yup.array(Yup.string().required())
      .min(1, t('errors.simRequired'))
      .max(
        BULK_ASSIGN_MAX_SIMULATIONS,
        t('errors.simMax', { max: BULK_ASSIGN_MAX_SIMULATIONS })
      ),
    startDate: isoDate(t('errors.startRequired')).test(
      'not-in-past',
      t('errors.startPast'),
      (value) => !isRealDate(value) || isTodayOrFutureDate(value)
    ),
    dueDate: isoDate(t('errors.dueRequired')).test(
      'between-start-and-end',
      t('errors.dueRange'),
      function (value) {
        const { startDate, endDate } = this.parent;
        if (!isRealDate(value)) return true;
        return (
          (!isRealDate(startDate) || value >= startDate) &&
          (!isRealDate(endDate) || value <= endDate)
        );
      }
    ),
    endDate: isoDate(t('errors.endRequired')).test(
      'not-before-start',
      t('errors.endBeforeStart'),
      function (value) {
        const { startDate } = this.parent;
        return (
          !isRealDate(value) || !isRealDate(startDate) || value >= startDate
        );
      }
    ),
  });
};
