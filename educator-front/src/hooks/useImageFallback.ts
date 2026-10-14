import { useEffect, useState } from 'react';

/**
 * Tracks whether an image URL failed to load, so an avatar can fall back to
 * the person's initial instead of an empty circle. A new URL is tried again,
 * and so is the same URL after a profile change, since a re-uploaded photo
 * can come back on the address that failed before.
 */
export function useImageFallback(src: string | null | undefined) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  useEffect(() => {
    const retry = () => setFailedSrc(null);
    window.addEventListener('profile-updated', retry);
    return () => window.removeEventListener('profile-updated', retry);
  }, []);

  return {
    hasImage: Boolean(src) && src !== failedSrc,
    handleImageError: () => setFailedSrc(src ?? null),
  };
}
