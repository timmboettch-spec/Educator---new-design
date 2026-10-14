/**
 * Type definitions for locale/translation JSON files
 * These type the imported JSON to allow dynamic key access without TypeScript errors
 */

export interface LocaleToast {
  [key: string]: string;
}

export interface LocaleContent {
  [key: string]: string | LocaleToast | Record<string, string>;
  loc: string;
  toast: LocaleToast;
}

/**
 * Helper to properly type imported locale JSON objects
 * Use this when TypeScript shows property doesn't exist errors on locale.toast.*
 *
 * @example
 * const locale = typedLocalelanguage === 'es' ? loginEs : loginEn;
 * toast.success(locale.toast.schoolCreated); // No TS error
 */
export function typedLocale<T = LocaleContent>(obj: unknown): T {
  return obj as T;
}
