import type { Config } from 'jest';
import dotenv from 'dotenv';

dotenv.config();

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '../..',
  testMatch: ['**/tests/api/modules/smoke/**/*.spec.ts'],
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
  globalSetup: '<rootDir>/tests/api/smoke-global-setup.ts',
  reporters: ['default'],
  testTimeout: 60000,
  maxWorkers: 1,
  bail: false,
};

export default config;
