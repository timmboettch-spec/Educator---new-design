import BrandedLoaderVisual from '../common/BrandedLoaderVisual';

interface ContentLoaderProps {
  visible?: boolean;
}

export default function ContentLoader({ visible = true }: ContentLoaderProps) {
  if (!visible) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="absolute inset-0 z-40 flex items-center justify-center bg-white/60 backdrop-blur-sm pointer-events-none"
    >
      <span className="sr-only">Loading page content…</span>
      <BrandedLoaderVisual />
    </div>
  );
}
