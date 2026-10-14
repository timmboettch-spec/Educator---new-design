import { useState } from 'react';
import i18n from '@/i18n';

export type AuthLanguage = 'en' | 'es';

const LANGUAGE_STORAGE_KEY = 'app_language';

const getInitialLanguage = (): AuthLanguage => {
  if (typeof window === 'undefined') return 'en';
  const saved = localStorage.getItem(LANGUAGE_STORAGE_KEY)?.toLowerCase();
  if (saved === 'es' || saved === 'en') return saved;
  const browserLang = window.navigator.language.toLowerCase();
  return browserLang.startsWith('es') ? 'es' : 'en';
};

/**
 * Current language for the pre-auth pages (sign in, forgot/reset password,
 * OTP). Sign In uses `setLanguage` to drive `AuthLanguageSwitcher`; the
 * recovery screens only read `language`, since they show no switcher.
 * Switching goes through `i18n.changeLanguage()`, whose detector persists the
 * choice to `app_language`, so react-i18next screens update in place and the
 * legacy locale reads still see the saved value.
 */
export const useAuthLanguage = () => {
  const [language, setLanguageState] =
    useState<AuthLanguage>(getInitialLanguage);

  const setLanguage = (lang: AuthLanguage) => {
    setLanguageState(lang);
    void i18n.changeLanguage(lang);
  };

  return { language, setLanguage };
};
