import React, { useMemo } from 'react';
import loginEn from '../../locales/auth/login/en.json';
import loginEs from '../../locales/auth/login/es.json';

interface CategoryBadgeProps {
  category: string;
}

const CATEGORY_STYLES: Record<string, string> = {
  Cardiology: 'bg-rose-100 text-rose-600',
  Pediatrics: 'bg-purple-100 text-purple-600',
  'Emergency Medicine': 'bg-orange-100 text-orange-600',
  Neurology: 'bg-blue-100 text-blue-600',
};

type SupportedLang = 'en' | 'es';
const LANGUAGE_STORAGE_KEY = 'app_language';

const getStoredLanguage = (): SupportedLang => {
  if (typeof window === 'undefined') return 'en';
  const saved = localStorage.getItem(LANGUAGE_STORAGE_KEY)?.toLowerCase();
  return saved === 'es' ? 'es' : 'en';
};

const CategoryBadge: React.FC<CategoryBadgeProps> = ({ category }) => {
  const language = getStoredLanguage();
  const locale = useMemo(
    () => (language === 'es' ? loginEs : loginEn),
    [language]
  );
  const cardLocale =
    ((locale as Record<string, unknown>).simulationCard as Record<
      string,
      string
    >) ?? {};

  const style = CATEGORY_STYLES[category] ?? 'bg-slate-100 text-slate-600';

  const isEs = language === 'es';
  const displayCategory =
    category === 'Manikin' || category?.toLowerCase() === 'manikin'
      ? (cardLocale.manikin ?? (isEs ? 'Maniquí' : 'Manikin'))
      : category === 'AI Only' || category?.toLowerCase() === 'ai only'
        ? (cardLocale.aiOnly ?? (isEs ? 'Solo IA' : 'AI Only'))
        : category;

  return (
    <span
      className={`inline-block text-xs font-semibold px-2.5 py-0.5 rounded-md ${style}`}
    >
      {displayCategory}
    </span>
  );
};

export default CategoryBadge;
