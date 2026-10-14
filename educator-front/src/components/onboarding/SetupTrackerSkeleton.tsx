import { useTranslation } from 'react-i18next';

const STONE_COUNT = 7;

/** Placeholder for the setup guide while its progress is first fetched. */
export function SetupTrackerSkeleton() {
  const { t } = useTranslation('onboarding');

  return (
    <div
      role="status"
      aria-busy="true"
      className="border-b border-[#e9e9e9] bg-white font-guide shadow-[0_2px_10px_rgba(95,96,96,0.06)]"
    >
      <span className="sr-only">{t('tracker.states.loading')}</span>
      <div
        aria-hidden="true"
        className="flex animate-pulse items-center gap-4 bg-gradient-btn px-6 py-3"
      >
        <div className="min-w-0 flex-1 space-y-2">
          <div className="h-4 w-48 rounded bg-white/40" />
          <div className="h-3 w-32 rounded bg-white/30" />
        </div>
        <div className="h-1.5 w-[140px] flex-none rounded-full bg-white/35" />
      </div>
      <div
        aria-hidden="true"
        className="flex animate-pulse items-center justify-between px-6 pb-5 pt-[18px]"
      >
        {Array.from({ length: STONE_COUNT }, (_, i) => (
          <div key={i} className="h-[42px] w-[42px] rounded-full bg-gray-100" />
        ))}
      </div>
    </div>
  );
}
