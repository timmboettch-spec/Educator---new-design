import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

// Known simulation values, keyed case-insensitively, to their translation keys.
const VALUE_KEYS = {
  secondary: 'simulationFilters.values.secondary',
  'post-secondary': 'simulationFilters.values.postSecondary',
  avatar: 'simulationFilters.values.avatar',
  workstation: 'simulationFilters.values.workstation',
  easy: 'simulationFilters.values.easy',
  medium: 'simulationFilters.values.medium',
  hard: 'simulationFilters.values.hard',
  expert: 'simulationFilters.values.expert',
} as const;

const isKnownValue = (value: string): value is keyof typeof VALUE_KEYS =>
  Object.prototype.hasOwnProperty.call(VALUE_KEYS, value);

/**
 * Translates a simulation's learner level, modality or difficulty value
 * ("Post-Secondary", "Avatar", "easy", …) for display. Unknown values — e.g.
 * a raw target audience from the BE — are returned unchanged.
 */
export function useSimulationValueLabel() {
  const { t } = useTranslation('common');

  return useCallback(
    (value: string) => {
      const key = value.trim().toLowerCase();
      return isKnownValue(key) ? t(VALUE_KEYS[key]) : value;
    },
    [t]
  );
}

/**
 * Localises the unit words in a free-text duration from the BE ("20 minutes",
 * "1 hour", "15 min") — e.g. "20 minutos" in Spanish. Numbers and anything
 * else are left as they are.
 */
export function useSimulationDurationLabel() {
  const { t } = useTranslation('simulationLibrary');

  return useCallback(
    (duration: string) =>
      duration
        .replace(/\bminutes\b/gi, t('duration.minutes'))
        .replace(/\bminute\b/gi, t('duration.minute'))
        .replace(/\bmins\b/gi, t('duration.mins'))
        .replace(/\bmin\b/gi, t('duration.min'))
        .replace(/\bhours\b/gi, t('duration.hours'))
        .replace(/\bhour\b/gi, t('duration.hour')),
    [t]
  );
}
