import type { HelmetOptions } from 'helmet';

export const securityHeadersOptions: HelmetOptions = {
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      scriptSrcAttr: ["'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:'],
      fontSrc: ["'self'"],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'self'", 'https:', 'http://localhost:*'],
      baseUri: ["'self'"],
      formAction: ["'self'", 'https:', 'http://localhost:*'],
    },
  },
  crossOriginEmbedderPolicy: false,
  // SPA and API are different origins (e.g. FE ngrok ↔ BE ngrok, or Azure SWA ↔ API).
  // Helmet's default CORP "same-origin" makes the browser drop cross-origin fetch
  // responses (DevTools: provisional headers / red healthz+exchange) even when CORS allows them.
  crossOriginResourcePolicy: { policy: 'cross-origin' },
};
