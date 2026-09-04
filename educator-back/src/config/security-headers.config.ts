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
};
