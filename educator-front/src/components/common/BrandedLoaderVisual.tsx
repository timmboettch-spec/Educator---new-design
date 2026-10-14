import type { FC } from 'react';

const BrandedLoaderVisual: FC = () => (
  <div
    aria-hidden="true"
    className="flex flex-col items-center justify-center w-full max-w-lg px-6 animate-fade-in"
  >
    <div className="relative flex items-center justify-center mb-3 w-[100px] h-[100px] md:w-[110px] md:h-[110px]">
      <div className="absolute inset-0 rotating-ring">
        <svg className="w-full h-full" viewBox="0 0 100 100">
          <circle
            cx="50"
            cy="50"
            fill="transparent"
            r="45"
            stroke="#f5f5f5"
            strokeWidth="2"
          />

          <circle
            cx="50"
            cy="50"
            fill="transparent"
            r="45"
            stroke="url(#orange-gradient)"
            strokeDasharray="160 283"
            strokeLinecap="round"
            strokeWidth="2.5"
            className="animate-glow"
          />

          <defs>
            <linearGradient
              id="orange-gradient"
              x1="0%"
              y1="0%"
              x2="100%"
              y2="0%"
            >
              <stop
                offset="0%"
                style={{
                  stopColor: '#ff7a00',
                  stopOpacity: 1,
                }}
              />

              <stop
                offset="100%"
                style={{
                  stopColor: '#ff9d00',
                  stopOpacity: 1,
                }}
              />
            </linearGradient>
          </defs>
        </svg>
      </div>

      <div
        className="relative z-10 w-16 h-16 md:w-20 md:h-20 rounded-full flex items-center justify-center overflow-hidden animate-pulse-slow"
        style={{
          background: 'radial-gradient(circle at 40% 35%, #ffb347, #e06000)',
          boxShadow: '0 0 25px rgba(255,122,0,0.35)',
        }}
      >
        <img
          src="/assets/RealityworksAI_logo.svg"
          alt="Brand Logo"
          className="w-3/4 h-3/4 object-contain"
          style={{
            filter: 'brightness(1.1)',
          }}
        />
      </div>
    </div>

    <div className="flex space-x-2 mt-3">
      <div className="dot w-1.5 h-1.5 rounded-full" />
      <div className="dot w-1.5 h-1.5 rounded-full" />
      <div className="dot w-1.5 h-1.5 rounded-full" />
    </div>
  </div>
);

export default BrandedLoaderVisual;
