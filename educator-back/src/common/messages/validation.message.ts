import { encodeI18nKey } from '../utils/i18n-key.util';

export const VALIDATION_MSG = {
  IS_STRING: (key: string): string => encodeI18nKey('validation.IS_STRING', { key }),
  IS_INT: (key: string): string => encodeI18nKey('validation.IS_INT', { key }),
  IS_NUMBER: (key: string): string => encodeI18nKey('validation.IS_NUMBER', { key }),
  IS_BOOLEAN: (key: string): string => encodeI18nKey('validation.IS_BOOLEAN', { key }),
  IS_OBJECT: (key: string): string => encodeI18nKey('validation.IS_OBJECT', { key }),
  IS_EMAIL: (key: string): string => encodeI18nKey('validation.IS_EMAIL', { key }),
  IS_UUID: (key: string): string => encodeI18nKey('validation.IS_UUID', { key }),
  IS_ENUM: (key: string): string => encodeI18nKey('validation.IS_ENUM', { key }),
  IS_NOT_EMPTY: (key: string): string => encodeI18nKey('validation.IS_NOT_EMPTY', { key }),
  IS_ARRAY: (key: string): string => encodeI18nKey('validation.IS_ARRAY', { key }),
  ARRAY_NOT_EMPTY: (key: string): string => encodeI18nKey('validation.ARRAY_NOT_EMPTY', { key }),
  MIN_VALUE: (key: string, value: number): string =>
    encodeI18nKey('validation.MIN_VALUE', { key, value }),
  MAX_VALUE: (key: string, value: number): string =>
    encodeI18nKey('validation.MAX_VALUE', { key, value }),
  MIN_LENGTH: (key: string, value: number): string =>
    encodeI18nKey('validation.MIN_LENGTH', { key, value }),
  MAX_LENGTH: (key: string, value: number): string =>
    encodeI18nKey('validation.MAX_LENGTH', { key, value }),
  ARRAY_MAX_SIZE: (key: string, value: number): string =>
    encodeI18nKey('validation.ARRAY_MAX_SIZE', { key, value }),
  ARRAY_UNIQUE: (key: string): string => encodeI18nKey('validation.ARRAY_UNIQUE', { key }),
  MUTUALLY_EXCLUSIVE: (key: string, others: string): string =>
    encodeI18nKey('validation.MUTUALLY_EXCLUSIVE', { key, others }),
  INVALID: (key: string): string => encodeI18nKey('validation.INVALID', { key }),
};
