import { encodeI18nKey } from '../utils/i18n-key.util';

export const SUCCESS_MSG = {
  PREVIEW: {
    USED: 'success.PREVIEW.USED',
  },
  COMMON: {
    OK: 'success.COMMON.OK',
    CREATED: (key: string): string => encodeI18nKey('success.COMMON.CREATED', { key }),
    UPDATED: (key: string): string => encodeI18nKey('success.COMMON.UPDATED', { key }),
    DELETED: (key: string): string => encodeI18nKey('success.COMMON.DELETED', { key }),
    FETCHED: (key: string): string => encodeI18nKey('success.COMMON.FETCHED', { key }),
  },
};
