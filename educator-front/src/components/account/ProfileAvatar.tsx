import { Loader2 } from 'lucide-react';
import { useImageFallback } from '@/hooks/useImageFallback';

interface ProfileAvatarProps {
  imageUrl: string;
  initial: string;
  isBusy: boolean;
}

/**
 * The 64px profile picture on the Account page, or the person's initial when
 * there is no photo. While a photo is uploading or being removed it is dimmed
 * under a spinner, so a preview never looks saved before it is.
 */
export function ProfileAvatar({
  imageUrl,
  initial,
  isBusy,
}: ProfileAvatarProps) {
  const { hasImage, handleImageError } = useImageFallback(imageUrl);

  return (
    <div className="relative w-16 h-16 shrink-0" aria-busy={isBusy}>
      {hasImage ? (
        <img
          src={imageUrl}
          alt=""
          onError={handleImageError}
          className="w-16 h-16 rounded-full object-cover aspect-square"
        />
      ) : (
        <p className="w-16 h-16 rounded-full text-center text-[40px] bg-[#5f6060] flex items-center justify-center text-white aspect-square">
          {initial}
        </p>
      )}
      {isBusy && (
        <div
          className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center"
          data-testid="profile-photo-busy"
        >
          <Loader2
            className="w-6 h-6 text-white animate-spin"
            aria-hidden="true"
          />
        </div>
      )}
    </div>
  );
}
