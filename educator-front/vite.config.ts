import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths';
import path from 'path';
import process from 'process';

export default defineConfig({
  plugins: [react(), tsconfigPaths()],

  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },

  build: {
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('chart.js') || id.includes('react-chartjs-2')) {
            return 'charts';
          }
        },
      },
    },
  },

  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    env: {
      VITE_API_URL: process.env.VITE_API_URL ?? 'http://localhost:3000',
    },

    css: true,

    include: [
      'src/**/*.{test,spec}.{ts,tsx}',
      'tests/**/*.{test,spec}.{ts,tsx}',
      'tests/integration/**/*.integration.test.{ts,tsx}',
    ],

    reporters: ['default', 'json'],
    outputFile: {
      json: './tests/unit/reports/test-results.json',
    },

    exclude: ['tests/e2e/**'],

    environmentOptions: {
      jsdom: {
        resources: 'usable',
      },
    },
  },
});
