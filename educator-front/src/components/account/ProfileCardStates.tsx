import { AlertCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '../ui/Button';

/**
 * Placeholder for the Profile Information card body while the person's
 * details load and there is no saved copy to show yet.
 */
export function ProfileCardSkeleton() {
  const { t } = useTranslation('account');

  return (
    <div aria-busy="true" data-testid="profile-card-skeleton">
      <p role="status" className="sr-only">
        {t('profile.loading')}
      </p>
      <div className="flex items-center gap-4 p-4 animate-pulse">
        <div className="w-16 h-16 rounded-full bg-gray-200 shrink-0" />
        <div className="flex flex-col gap-2 w-full max-w-[220px]">
          <div className="h-4 rounded bg-gray-200" />
          <div className="h-3 w-1/2 rounded bg-gray-200" />
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-4 animate-pulse">
        {[0, 1].map((field) => (
          <div key={field} className="flex flex-col gap-1.5">
            <div className="h-3 w-20 rounded bg-gray-200" />
            <div className="h-[38px] rounded-xl bg-gray-200" />
          </div>
        ))}
      </div>
    </div>
  );
}

interface ProfileUnavailableProps {
  onRetry: () => void;
}

/** Shown in place of the card body when the details could not be loaded. */
export function ProfileUnavailable({ onRetry }: ProfileUnavailableProps) {
  const { t } = useTranslation('account');

  return (
    <div
      role="alert"
      className="flex flex-col items-center text-center gap-2 px-4 py-10"
    >
      <AlertCircle className="w-8 h-8 text-red-500" aria-hidden="true" />
      <p className="text-base font-semibold text-gray-900">
        {t('profile.unavailableTitle')}
      </p>
      <p className="text-sm text-gray-500">{t('profile.unavailableBody')}</p>
      <Button
        type="button"
        variant="outline"
        className="mt-2 rounded-full"
        onClick={onRetry}
      >
        {t('profile.retry')}
      </Button>
    </div>
  );
}
