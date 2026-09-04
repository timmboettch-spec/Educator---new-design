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


  // LOCAL ADAPTATION (not upstream): this dev server is exposed publicly through a
  // Cloudflare tunnel which terminates TLS on 443 and forwards to port 6001. Vite 7
  // rejects unknown Host headers, and HMR must be told the public origin or the
  // browser tries to open a websocket to the tunnel host on 6001.
  server: {
    host: '127.0.0.1',
    port: 6001,
    strictPort: true,
    allowedHosts: ['educatorapp.rwthrive.ai'],
    hmr: {
      protocol: 'wss',
      host: 'educatorapp.rwthrive.ai',
      clientPort: 443,
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

    exclude: [
  'tests/e2e/**'
],

    environmentOptions: {
      jsdom: {
        resources: 'usable',
      },
    },
  },
});
