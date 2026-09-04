import * as fs from 'fs';
import * as path from 'path';

export const PORT_FILE = path.resolve(__dirname, '.server-port.json');

export default async function globalTeardown(): Promise<void> {
  console.log('\n[GlobalTeardown] Shutting down NestJS test server...');

  const app = (global as Record<string, unknown>).__PRE_DEPLOY_APP__ as { close: () => Promise<void> } | undefined;

  if (app) {
    try {
      await app.close();
      console.log('[GlobalTeardown] NestJS test server closed.');
    } catch (err) {
      console.warn('[GlobalTeardown] Error closing app:', err);
    }
  }

  if (fs.existsSync(PORT_FILE)) {
    fs.unlinkSync(PORT_FILE);
    console.log('[GlobalTeardown] Port file deleted.');
  }
}
