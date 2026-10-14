import { encodeI18nKey } from '../utils/i18n-key.util';

export const CLASS_SIMULATION_MSG = {
  BULK_ASSIGN: {
    CREATED: (count: number): string =>
      encodeI18nKey('class-simulation.BULK_ASSIGN.CREATED', { count }),
    FAILED: (failed: number, total: number): string =>
      encodeI18nKey('class-simulation.BULK_ASSIGN.FAILED', { failed, total }),
    CLASS_NOT_ACCESSIBLE: 'class-simulation.BULK_ASSIGN.CLASS_NOT_ACCESSIBLE',
    SIMULATION_NOT_FOUND: 'class-simulation.BULK_ASSIGN.SIMULATION_NOT_FOUND',
    ALREADY_ASSIGNED_SAME_DATES: 'class-simulation.BULK_ASSIGN.ALREADY_ASSIGNED_SAME_DATES',
    ALREADY_ASSIGNED_OVERLAP: 'class-simulation.BULK_ASSIGN.ALREADY_ASSIGNED_OVERLAP',
    INSUFFICIENT_SEATS: (required: number, available: number): string =>
      encodeI18nKey('class-simulation.BULK_ASSIGN.INSUFFICIENT_SEATS', { required, available }),
  },
};
