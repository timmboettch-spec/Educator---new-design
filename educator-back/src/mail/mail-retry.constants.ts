// Redis sorted-set key holding due-timestamps (score, ms epoch) for queued
// retry jobs, and the hash key holding each job's serialized payload.
export const MAIL_RETRY_QUEUE_KEY = 'mail:retry:queue';
export const MAIL_RETRY_JOBS_KEY = 'mail:retry:jobs';

// Exponential-ish backoff schedule (ms) — index = attempt number (0-based,
// i.e. delay before the 1st retry, 2nd retry, 3rd retry). After the last
// entry is exhausted, the job is dropped and logged as a final failure.
export const MAIL_RETRY_BACKOFF_MS = [2 * 60_000, 10 * 60_000, 30 * 60_000];

// How often the background processor scans for due jobs. Coarse on purpose —
// this is best-effort delivery for report emails, not a low-latency queue.
export const MAIL_RETRY_POLL_INTERVAL_MS = 60_000;

// Safety cap on serialized payload size (mainly attachment bytes, e.g. a
// report PDF) — refuses to queue anything larger rather than let a
// pathological attachment bloat the retry-queue key.
export const MAIL_RETRY_MAX_PAYLOAD_BYTES = 5 * 1024 * 1024;
