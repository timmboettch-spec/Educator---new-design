// Mirrors the ACS Email sending resource's actual rolling send-rate limits —
// exceeding either one gets the resource throttled/degraded by Azure.
// Enforcing the same limits ourselves means we queue instead of ever
// actually hitting Azure's throttle. Overridable per-env via Key Vault
// (edu-mail-rate-limit-per-minute/-hour — see
// infra/modules/containerApp-backend.bicep) without a code change, the same
// pattern as RATE_LIMIT_PUBLIC_LIMIT/RATE_LIMIT_AUTH_LIMIT in
// src/common/constants/throttle.constants.ts. The 30/100 fallbacks are
// ACS's current documented limits, in case the env var is ever unset.
export const MAIL_RATE_LIMIT_MINUTE_LIMIT = Number(process.env.MAIL_RATE_LIMIT_PER_MINUTE ?? 30);
export const MAIL_RATE_LIMIT_MINUTE_WINDOW_MS = 60_000;
export const MAIL_RATE_LIMIT_HOUR_LIMIT = Number(process.env.MAIL_RATE_LIMIT_PER_HOUR ?? 100);
export const MAIL_RATE_LIMIT_HOUR_WINDOW_MS = 60 * 60_000;

// Redis sorted-set key — one send-timestamp entry per member, per "sliding
// window log" (see MailRateLimiterService for why this shape is rolling
// rather than fixed-bucket).
export const MAIL_RATE_LIMIT_KEY = 'mail:ratelimit:sends';

// Housekeeping TTL on the key itself so an idle key doesn't linger in Redis
// forever — comfortably longer than the longer (hour) window.
export const MAIL_RATE_LIMIT_KEY_TTL_SECONDS = 2 * 60 * 60;
