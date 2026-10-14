import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import enCommon from './locales/en/common.json';
import enOnboarding from './locales/en/onboarding.json';
import enClassManagement from './locales/en/classManagement.json';
import enDashboard from './locales/en/dashboard.json';
import enSystem from './locales/en/system.json';
import enAuth from './locales/en/auth.json';
import enSimulationLibrary from './locales/en/simulationLibrary.json';
import enAccount from './locales/en/account.json';
import enSimulationAssignment from './locales/en/simulationAssignment.json';
import enSimulationCatalog from './locales/en/simulationCatalog.json';
import esCommon from './locales/es/common.json';
import esOnboarding from './locales/es/onboarding.json';
import esClassManagement from './locales/es/classManagement.json';
import esDashboard from './locales/es/dashboard.json';
import esSystem from './locales/es/system.json';
import esAuth from './locales/es/auth.json';
import esSimulationLibrary from './locales/es/simulationLibrary.json';
import esAccount from './locales/es/account.json';
import esSimulationAssignment from './locales/es/simulationAssignment.json';
import esSimulationCatalog from './locales/es/simulationCatalog.json';

export const defaultNS = 'common' as const;
export const supportedLngs = ['en', 'es'] as const;

export const resources = {
  en: {
    common: enCommon,
    onboarding: enOnboarding,
    classManagement: enClassManagement,
    dashboard: enDashboard,
    system: enSystem,
    auth: enAuth,
    simulationLibrary: enSimulationLibrary,
    account: enAccount,
    simulationAssignment: enSimulationAssignment,
    simulationCatalog: enSimulationCatalog,
  },
  es: {
    common: esCommon,
    onboarding: esOnboarding,
    classManagement: esClassManagement,
    dashboard: esDashboard,
    system: esSystem,
    auth: esAuth,
    simulationLibrary: esSimulationLibrary,
    account: esAccount,
    simulationAssignment: esSimulationAssignment,
    simulationCatalog: esSimulationCatalog,
  },
} as const;

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'en',
    supportedLngs: [...supportedLngs],
    ns: [
      'common',
      'onboarding',
      'classManagement',
      'dashboard',
      'system',
      'auth',
      'simulationLibrary',
      'account',
      'simulationAssignment',
      'simulationCatalog',
    ],
    defaultNS,
    interpolation: {
      escapeValue: false, // React already escapes
    },
    returnNull: false,
    returnEmptyString: false,
    detection: {
      order: ['localStorage', 'navigator', 'htmlTag'],
      caches: ['localStorage'],
      lookupLocalStorage: 'app_language',
    },
    debug: import.meta.env.DEV,
    missingKeyHandler: import.meta.env.DEV
      ? (lngs, ns, key) => {
          // eslint-disable-next-line no-console
          console.warn(`[i18n] Missing key "${key}" in ns "${ns}" for`, lngs);
        }
      : undefined,
  });

// Keep <html lang> in sync so assistive tech / browser features
// (spellcheck, font selection, form autofill) match the active language.
i18n.on('languageChanged', (lng) => {
  document.documentElement.lang = lng;
});

export default i18n;
