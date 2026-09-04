import type { Config } from 'jest';
import dotenv from 'dotenv';

// Load .env and capture NODE_ENV before Jest overwrites it
const dotenvResult = dotenv.config();
console.log('[jest.config] dotenv loaded:', dotenvResult.error ? `FAILED (${dotenvResult.error.message})` : `OK (${Object.keys(dotenvResult.parsed ?? {}).length} vars)`);
console.log('[jest.config] NODE_ENV before capture:', process.env.NODE_ENV);

/**
 * Jest Pre-Deployment API Test Configuration
 *
 * Boots a full NestJS application in-process (globalSetup) with SQLite + mocks.
 * All tests hit http://127.0.0.1:{dynamic-port}/api — no live server required.
 *
 * Execution order:
 * Auth → School → Educator → Dashboard → User → Class → Student → Simulation → Cleanup
 */

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '../..',
  testMatch: ['**/tests/api/**/*.spec.ts'],
  // Exclude smoke specs from pre-deployment run
  testPathIgnorePatterns: ['<rootDir>/tests/api/modules/smoke/'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: {
        esModuleInterop: true,
        allowSyntheticDefaultImports: true,
        target: 'ES2020',
        module: 'commonjs',
        types: ['jest', 'node'],
      },
    }],
  },
  globalSetup: '<rootDir>/tests/api/global-setup.ts',
  globalTeardown: '<rootDir>/tests/api/global-teardown.ts',
  reporters: ['default'],
  testTimeout: 60000,
  maxWorkers: 1,
  bail: false,
};

export default config;
