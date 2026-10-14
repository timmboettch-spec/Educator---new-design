import { OutboundIntegration } from '../constants/outbound-http.constants';
import { encodeI18nKey } from '../utils/i18n-key.util';

export const ERROR_MSG = {
  SERVER: {
    INTERNAL_SERVER: 'error.SERVER.INTERNAL_SERVER',
    PAGE_NOT_FOUND: 'error.SERVER.PAGE_NOT_FOUND',
  },
  DB: {
    DUPLICATE_ENTRY: (key: string): string => encodeI18nKey('error.DB.DUPLICATE_ENTRY', { key }),
    FK_CONSTRAINT: 'error.DB.FK_CONSTRAINT',
    INVALID_REQUEST: 'error.DB.INVALID_REQUEST',
    NOT_FOUND: (key: string): string => encodeI18nKey('error.DB.NOT_FOUND', { key }),
  },
  PREVIEW: {
    ALLOWANCE_EXHAUSTED: 'error.PREVIEW.ALLOWANCE_EXHAUSTED',
  },
  CLASS: {
    ARCHIVED: 'error.CLASS.ARCHIVED',
  },
  CLASS_SIMULATION: {
    OVERLAPPING_ASSIGNMENT: 'error.CLASS_SIMULATION.OVERLAPPING_ASSIGNMENT',
  },
  COMMON: {
    BAD_REQUEST: 'error.COMMON.BAD_REQUEST',
    UNAUTHORIZED: 'error.COMMON.UNAUTHORIZED',
    FORBIDDEN: 'error.COMMON.FORBIDDEN',
    VALIDATION_ERROR: 'error.COMMON.VALIDATION_ERROR',
    TOO_MANY_REQUESTS: 'error.COMMON.TOO_MANY_REQUESTS',
    UPSTREAM_TIMEOUT: (integration: OutboundIntegration): string =>
      encodeI18nKey('error.COMMON.UPSTREAM_TIMEOUT', { integration }),
    INVALID_DATE_RANGE: (startKey: string, endKey: string): string =>
      encodeI18nKey('error.COMMON.INVALID_DATE_RANGE', { startKey, endKey }),
  },
  AVATAR: {
    READY_WITHOUT_MAP: 'error.AVATAR.READY_WITHOUT_MAP',
  },
  VOICE_PROFILE: {
    NO_FILE: 'error.VOICE_PROFILE.NO_FILE',
    FILE_TOO_LARGE: (maxMb: number): string =>
      encodeI18nKey('error.VOICE_PROFILE.FILE_TOO_LARGE', { maxMb }),
    UNDECODABLE: 'error.VOICE_PROFILE.UNDECODABLE',
    TOO_SHORT: (seconds: string, min: number): string =>
      encodeI18nKey('error.VOICE_PROFILE.TOO_SHORT', { seconds, min }),
    TOO_LONG: (seconds: string, max: number): string =>
      encodeI18nKey('error.VOICE_PROFILE.TOO_LONG', { seconds, max }),
    TOO_SILENT: (percent: number, max: number): string =>
      encodeI18nKey('error.VOICE_PROFILE.TOO_SILENT', { percent, max }),
    CLIPPED: (percent: string): string => encodeI18nKey('error.VOICE_PROFILE.CLIPPED', { percent }),
    PROCESSING_TIMEOUT: 'error.VOICE_PROFILE.PROCESSING_TIMEOUT',
    PROCESSING_UNAVAILABLE: 'error.VOICE_PROFILE.PROCESSING_UNAVAILABLE',
    RETIRED: 'error.VOICE_PROFILE.RETIRED',
    RETIRED_READ_ONLY: 'error.VOICE_PROFILE.RETIRED_READ_ONLY',
    DISPLAY_NAME_TAKEN: (displayName: string): string =>
      encodeI18nKey('error.VOICE_PROFILE.DISPLAY_NAME_TAKEN', { displayName }),
    DEFAULT_TAKEN: (displayName: string, gender: string): string =>
      encodeI18nKey('error.VOICE_PROFILE.DEFAULT_TAKEN', { displayName, gender }),
    IN_USE: (count: number, ids: string): string =>
      encodeI18nKey('error.VOICE_PROFILE.IN_USE', { count, ids }),
    IS_DEFAULT: (gender: string): string =>
      encodeI18nKey('error.VOICE_PROFILE.IS_DEFAULT', { gender }),
    AUDIO_MISSING: 'error.VOICE_PROFILE.AUDIO_MISSING',
    SCENARIO_VOICE_INVALID: (voiceProfileId: string): string =>
      encodeI18nKey('error.VOICE_PROFILE.SCENARIO_VOICE_INVALID', { voiceProfileId }),
    GENDER_MISMATCH: (gender: string, defaultForGender: string): string =>
      encodeI18nKey('error.VOICE_PROFILE.GENDER_MISMATCH', { gender, defaultForGender }),
  },
};
