import { useEffect, useRef, useState } from "react";

export const AnimatedCard = ({
  children,
  delay = 0,
  className = '',
  onClick,
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
  onClick?: () => void;
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setTimeout(() => {
            setIsVisible(true);
          }, delay);
          observer.disconnect();
        }
      },
      { threshold: 0.08 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [delay]);
  return (
    <div
      ref={ref}
      className={className}
      onClick={onClick}
      style={{
        opacity: isVisible ? 1 : 0,
        transform: isVisible ? 'translateY(0) scale(1)' : 'translateY(28px) scale(0.97)',
        transition: 'opacity 0.5s ease, transform 0.5s ease',
      }}
    >
      {children}
    </div>
  );
};

export const RWLogoFallback = () => (
  <div className="absolute inset-0 w-full h-full bg-gray-100 flex items-center justify-center">
    <img
      src="/assets/RealityworksAI_logo.svg"
      alt="Realityworks"
      className="w-12 h-12 object-contain opacity-40"
    />
  </div>
);

export const CatalogCardImage = ({
  src,
  alt,
  className,
}: {
  src?: string;
  alt: string;
  className?: string;
}) => {
  const [hasError, setHasError] = useState(false);
  const validSrc = typeof src === 'string' && src.trim().length > 0;

  if (!validSrc || hasError) {
    return <RWLogoFallback />;
  }

  return (
    <>
      {/* Blurred backdrop — extends the image's own colors into the letterbox area */}
      <img
        src={src}
        alt=""
        aria-hidden="true"
        className="absolute inset-0 w-full h-full object-cover scale-110 blur-lg"
        onError={() => setHasError(true)}
      />
      {/* Foreground — full image, never cropped */}
      <img
        src={src}
        alt={alt}
        className={className}
        onError={() => setHasError(true)}
      />
    </>
  );
};