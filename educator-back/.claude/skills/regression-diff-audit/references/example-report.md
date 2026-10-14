# Example: what a finished audit report should look like

This is a trimmed example for calibration — match this level of specificity
(exact file:line, exact evidence, exact suggested test) rather than vague
generalities like "this might break something."

```
## Regression Audit: feature/payment-retry vs main

**Verdict: DO NOT MERGE**

- Files changed: 4 (committed) + 1 (uncommitted)
- Tests: 42 passed, 2 failed
- Build/typecheck: PASSED

### 🔴 BREAKING (1)
- `src/billing/retry.ts:createRetrySchedule()` — signature changed from
  `(orderId: string)` to `(orderId: string, maxAttempts: number)`.
  Caller at `src/jobs/nightlyRetryJob.ts:41` still calls it with one
  argument, so `maxAttempts` will be `undefined` and the loop at
  `retry.ts:58` (`for (let i = 0; i < maxAttempts; i++)`) will never
  execute — retries will silently stop firing.
  Evidence: confirmed by reading both call site and implementation;
  no test currently calls `createRetrySchedule` with one argument, so
  the existing suite did not catch this.

### 🟠 HIGH RISK (1)
- `src/billing/retry.ts` — new `catch` branch for `RateLimitError` has
  no test coverage. If the payment provider returns a 429, behavior is
  unverified.
  Suggested test: mock provider to return 429 → assert retry is
  rescheduled with backoff, not dropped.

### 🟢 LOW RISK (2)
- `src/billing/retry.ts` — added `logRetryAttempt()` helper, purely
  additive, no existing callers affected.
- `src/types/billing.ts` — added optional `maxAttempts?` field to
  `RetryConfig` type, backward compatible.

### ℹ️ Untested paths / gaps (1)
- `nightlyRetryJob.ts` has zero test files covering it at all
  (`nightlyRetryJob.test.ts` does not exist) — this job's behavior is
  fully unverified even before this change, but it's now more brittle
  since it silently swallows the missing `maxAttempts` value.
```

Notes on calibration:

- The BREAKING finding names the exact function, exact line, exact caller,
  and traces the actual failure mode (loop never executes) — not just
  "signature mismatch."
- The suggested test is a concrete input → expected-behavior pair, not
  "add more tests for error handling."
- LOW RISK items are still listed, not omitted, so the report is a complete
  record of every file touched.
