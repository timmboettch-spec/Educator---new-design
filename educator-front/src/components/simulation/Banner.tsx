import React from "react";

interface HeroBannerProps {
  backgroundImage?: string;
  title?: string;
  subtitle?: string;
  onClick?: () => void;
  onExplore?: () => void;
  onLearnMore?: () => void;
}

const HeroBanner: React.FC<HeroBannerProps> = ({
  backgroundImage,
  title,
  subtitle,
  onClick,
}) => {
  const isClickable = typeof onClick === "function";

  return (
    <div
      className={`grid w-full rounded-2xl overflow-hidden ${isClickable ? "cursor-pointer" : ""}`}
      onClick={onClick}
      role={isClickable ? "button" : undefined}
      tabIndex={isClickable ? 0 : undefined}
      onKeyDown={
        isClickable
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick?.();
              }
            }
          : undefined
      }
    >
      {backgroundImage ? (
        <>
          <img
            src={backgroundImage}
            alt=""
            /* Cap the height and cover-crop (object-cover) so the banner is
               shorter without distorting the image's aspect ratio. */
            className="col-start-1 row-start-1 w-full h-32 sm:h-40 md:h-48 object-cover object-center block"
          />
          <div className="col-start-1 row-start-1 z-10 flex flex-col items-center justify-center text-center px-4 sm:px-8 md:px-14">
            <h1
              className="text-white drop-shadow-lg mb-3"
              style={{
                fontFamily: "'Poppins', sans-serif",
                fontWeight: 600,
                fontSize: "clamp(0.875rem, 4.3vw, 3.5rem)",
                lineHeight: "clamp(0.85rem, 4.1vw, 3.35rem)",
                letterSpacing: "0px",
              }}
            >
              {title}
            </h1>
            <p
              className="text-white max-w-2xl opacity-90 leading-relaxed"
              style={{ fontSize: "clamp(0.625rem, 1.4vw, 1.125rem)" }}
            >
              {subtitle}
            </p>
          </div>
        </>
      ) : (
        <div className="col-start-1 row-start-1 w-full bg-gray-100 flex items-center justify-center py-12">
          <img
            src="/assets/RealityworksAI_logo.svg"
            alt=""
            className="w-20 h-20 object-contain opacity-35"
          />
        </div>
      )}
    </div>
  );
};
export default HeroBanner;
