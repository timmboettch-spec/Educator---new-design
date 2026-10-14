import React from 'react';

interface BlobImageProps extends Omit<
  React.ImgHTMLAttributes<HTMLImageElement>,
  'src'
> {
  src: string | undefined | null;
  fallback?: React.ReactNode;
}

/**
 * Simple image component that renders the src directly.
 * Azure Blob Storage URLs are public and don't need auth headers.
 */
const BlobImage: React.FC<BlobImageProps> = ({
  src,
  fallback = null,
  ...imgProps
}) => {
  const [hasError, setHasError] = React.useState(false);
  const imageSrc = typeof src === 'string' ? src.trim() : '';

  React.useEffect(() => {
    setHasError(false);
  }, [imageSrc]);

  if (!imageSrc || hasError) return <>{fallback}</>;

  return (
    <img
      src={imageSrc}
      {...imgProps}
      onError={(e) => {
        if (imgProps.onError) {
          imgProps.onError(e);
        }
        setHasError(true);
      }}
    />
  );
};

export default BlobImage;
