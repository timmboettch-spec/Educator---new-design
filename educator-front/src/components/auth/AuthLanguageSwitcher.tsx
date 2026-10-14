import clsx from 'clsx';
import type { AuthLanguage } from '@/hooks/useAuthLanguage';

interface AuthLanguageSwitcherProps {
  language: AuthLanguage;
  onChange: (language: AuthLanguage) => void;
  label: string;
  englishLabel: string;
  spanishLabel: string;
}

/**
 * English / Spanish toggle for the pre-auth pages. Pair it with
 * `useAuthLanguage()`, which owns the state and persistence.
 *
 * Only Sign In renders it, matching the approved design: the recovery screens
 * (forgot password, OTP, reset password) have no switcher and follow the
 * language chosen on Sign In.
 */
export function AuthLanguageSwitcher({
  language,
  onChange,
  label,
  englishLabel,
  spanishLabel,
}: AuthLanguageSwitcherProps) {
  const options: { value: AuthLanguage; text: string }[] = [
    { value: 'en', text: englishLabel },
    { value: 'es', text: spanishLabel },
  ];

  return (
    <div className="mt-3 flex items-center justify-center gap-2 lg:justify-end">
      <span className="text-xs font-medium uppercase tracking-wide text-gray-500">
        {label}
      </span>
      <div className="inline-flex rounded-full border border-[#F4C6AD] bg-[#FFF7F2] p-1">
        {options.map(({ value, text }) => (
          <button
            key={value}
            type="button"
            onClick={() => onChange(value)}
            aria-pressed={language === value}
            className={clsx(
              'rounded-full px-3 py-1 text-xs font-semibold transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset',
              language === value
                ? 'bg-primary-500 text-white focus-visible:ring-primary-900'
                : 'text-[#A6522A] hover:bg-[#FFE6D8] focus-visible:ring-[#b45e20]'
            )}
          >
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}
