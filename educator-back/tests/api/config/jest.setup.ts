import 'dotenv/config';

/**
 * Per-suite setup for pre-deployment API tests (npm run test:api).
 * Runs after the Jest test framework is installed in the environment.
 */

// Extend timeout to accommodate rate-limit retries in beforeAll login calls
jest.setTimeout(60000);
