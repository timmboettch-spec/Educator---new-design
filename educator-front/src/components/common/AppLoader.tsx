import React, { useEffect, useRef, useState } from 'react';
import BrandedLoaderVisual from './BrandedLoaderVisual';

interface AppLoaderProps {
  loading?: boolean;
  onHidden?: () => void;
}

const MIN_DURATION = 2000;

export let isAppLoaderVisible = true;

const AppLoader: React.FC<AppLoaderProps> = ({ loading = true, onHidden }) => {
  const [showLoader, setShowLoader] = useState(loading);
  const startTimeRef = useRef(loading ? Date.now() : 0);
  const onHiddenRef = useRef(onHidden);
  onHiddenRef.current = onHidden;

  useEffect(() => {
    if (loading) {
      isAppLoaderVisible = true;
      startTimeRef.current = Date.now();
      setShowLoader(true);
      return;
    }

    const elapsed = Date.now() - startTimeRef.current;
    const remaining = Math.max(MIN_DURATION - elapsed, 0);

    const timer = setTimeout(() => {
      isAppLoaderVisible = false;
      setShowLoader(false);
      onHiddenRef.current?.();
    }, remaining);
    return () => clearTimeout(timer);
  }, [loading]);

  const visible = loading || showLoader;

  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed inset-0 z-50 flex items-center justify-center font-sans transition-opacity ${
        visible
          ? 'opacity-100 pointer-events-auto'
          : 'opacity-0 pointer-events-none'
      }`}
      style={{
        transition:
          'opacity 300ms ease, backdrop-filter 300ms ease, background-color 300ms ease',
        backgroundColor: visible ? 'rgba(255, 255, 255, 0.5)' : 'transparent',
        backdropFilter: visible ? 'blur(8px)' : 'none',
      }}
    >
      <span className="sr-only">{visible ? 'Loading…' : ''}</span>
      <BrandedLoaderVisual />
    </div>
  );
};

export default AppLoader;
