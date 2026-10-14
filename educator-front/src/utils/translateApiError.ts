import loginEn from '../locales/auth/login/en.json';
import loginEs from '../locales/auth/login/es.json';

export type SupportedLang = 'en' | 'es';

type ToastLocale = Record<string, string>;

// Backend only returns English messages — map known phrases to the active locale's translation.
const ERROR_PHRASE_MAP: [string, (toast: ToastLocale) => string | undefined][] =
  [
    ['class already exists in this school', (t) => t.classNameAlreadyExists],
    ['student already exists in this class', (t) => t.studentAlreadyExists],
    [
      'an educator with this email already exists',
      (t) => t.educatorEmailAlreadyExists,
    ],
    ['user with this email already exists', (t) => t.userEmailAlreadyExists],
    ['school already exists', (t) => t.schoolAlreadyExists],
    [
      'simulation already exists in library',
      (t) => t.simulationAlreadyInLibrary,
    ],
    [
      'simulation with this name already exists for the class',
      (t) => t.simulationNameAlreadyExists,
    ],
  ];

/** Translates common backend error strings to the active locale; unrecognized messages pass through unchanged. */
export const translateApiError = (
  errorMessage: string,
  language: SupportedLang
): string => {
  if (!errorMessage) return errorMessage;
  const toast: ToastLocale =
    (language === 'es' ? loginEs : loginEn).toast || {};
  const lowerMsg = errorMessage.toLowerCase();

  for (const [phrase, getTranslation] of ERROR_PHRASE_MAP) {
    if (lowerMsg.includes(phrase)) {
      return getTranslation(toast) || errorMessage;
    }
  }

  if (lowerMsg.includes('insufficient') && lowerMsg.includes('seat')) {
    return toast.insufficientSeats || errorMessage;
  }
  if (lowerMsg.includes('insufficient') && lowerMsg.includes('token')) {
    return toast.insufficientTokens || errorMessage;
  }

  return errorMessage;
};

export const getStoredLanguage = (): SupportedLang => {
  if (typeof window === 'undefined') return 'en';
  const saved = localStorage.getItem('app_language')?.toLowerCase();
  return saved === 'es' ? 'es' : 'en';
};
