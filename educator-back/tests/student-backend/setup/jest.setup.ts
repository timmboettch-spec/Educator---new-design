// Global Jest configuration — runs once per test file after the framework loads
jest.setTimeout(10000);

// Provide deterministic defaults for the JWT / educator-token signing
// secrets so test modules that import AuthModule / EducatorAuthModule can
// compile without requiring a fully-populated environment. Individual test
// files may still override these values (e.g. `scenarios.auth.spec.ts`
// sets its own SCENARIO_TOKEN_SECRET) — we only fill in a default when
// the variable is not already set.
if (!process.env.SCENARIO_TOKEN_SECRET) {
  process.env.SCENARIO_TOKEN_SECRET = 'test-scenario-token-secret';
}
if (!process.env.JWT_SECRET) {
  process.env.JWT_SECRET = 'test-jwt-secret';
}
