import type { TFunction } from 'i18next';
import * as Yup from 'yup';
import type { SimulationItem } from '../types';
import type { SimDateField } from '../redux/api/classSimulations/classSimulationsService';
import { isIsoDate } from '../utils/schema-utils/dateRules';
import { formatSimDate, toIsoSimDate } from '../utils/simAssignment';

type SimDateBoundKey =
  | 'beforeOriginalStart'
  | 'beforeStart'
  | 'beforeDue'
  | 'afterDue'
  | 'afterClose'
  | 'afterOriginalClose';

interface SimDateBound {
  key: SimDateBoundKey;
  /** The limit, as YYYY-MM-DD; empty when the row has no such date. */
  limit: string;
  /** `min`: the value may not be earlier; `max`: it may not be later. */
  kind: 'min' | 'max';
}

interface SimDateEditSchemaOptions {
  t: TFunction<'classManagement'>;
  field: SimDateField;
  /** The row being edited; its other two dates stay as they are. */
  sim: Pick<SimulationItem, 'start_date' | 'due_date' | 'end_date'>;
}

/**
 * The limits one edited date must respect while the row's other two dates
 * stay fixed. Same rules as the Edit dialog: start ≤ due ≤ close, a start
 * can't move earlier than it is and a close can't move later than it is.
 */
const getBounds = (
  field: SimDateField,
  sim: SimDateEditSchemaOptions['sim']
): SimDateBound[] => {
  const start = toIsoSimDate(sim.start_date);
  const due = toIsoSimDate(sim.due_date);
  const close = toIsoSimDate(sim.end_date);

  switch (field) {
    case 'start_date':
      return [
        { key: 'beforeOriginalStart', limit: start, kind: 'min' },
        { key: 'afterDue', limit: due, kind: 'max' },
        { key: 'afterClose', limit: close, kind: 'max' },
      ];
    case 'due_date':
      return [
        { key: 'beforeStart', limit: start, kind: 'min' },
        { key: 'afterClose', limit: close, kind: 'max' },
      ];
    case 'end_date':
      return [
        due
          ? { key: 'beforeDue', limit: due, kind: 'min' }
          : { key: 'beforeStart', limit: start, kind: 'min' },
        { key: 'afterOriginalClose', limit: close, kind: 'max' },
      ];
  }
};

/**
 * Validates one in-row assignment date (YYYY-MM-DD from a date input). Built
 * per edit because the limits come from the row's other dates.
 */
export const getSimDateEditSchema = ({
  t,
  field,
  sim,
}: SimDateEditSchemaOptions) =>
  getBounds(field, sim).reduce(
    (schema, { key, limit, kind }) =>
      limit
        ? schema.test(
            key,
            t(`simSubtable.dateErrors.${key}`, { date: formatSimDate(limit) }),
            (value) =>
              !value || (kind === 'min' ? value >= limit : value <= limit)
          )
        : schema,
    Yup.string()
      .trim()
      .required(t('simSubtable.dateErrors.required'))
      .test('iso-date', t('simSubtable.dateErrors.invalid'), (value) =>
        isIsoDate(value)
      )
  );
