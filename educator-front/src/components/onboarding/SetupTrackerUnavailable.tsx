import { useTranslation } from 'react-i18next';

interface SetupTrackerUnavailableProps {
  onRetry: () => void;
}

/** Shown when the setup guide's progress could not be loaded. */
export function SetupTrackerUnavailable({
  onRetry,
}: SetupTrackerUnavailableProps) {
  const { t } = useTranslation('onboarding');

  return (
    <div
      role="status"
      className="flex items-center gap-4 border-b border-[#e9e9e9] bg-gradient-btn px-6 py-3 font-guide text-white shadow-[0_2px_10px_rgba(95,96,96,0.06)]"
    >
      <div className="min-w-0 flex-1">
        <div className="text-[15px] font-bold tracking-[0.01em]">
          {t('tracker.states.unavailableTitle')}
        </div>
        <div className="mt-0.5 text-[12.5px] opacity-95">
          {t('tracker.states.unavailableBody')}
        </div>
      </div>
      <button
        type="button"
        onClick={onRetry}
        className="flex-none rounded-full border border-white px-4 py-1.5 text-[13px] font-semibold text-white hover:bg-white/15 focus-visible:outline-white"
      >
        {t('tracker.states.retry')}
      </button>
    </div>
  );
}
