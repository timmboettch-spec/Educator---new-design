import dotenv from 'dotenv';

dotenv.config();

export default async function smokeGlobalSetup(): Promise<void> {
  const baseUrl = process.env.BASE_BACKEND_URL;

  if (!baseUrl) {
    throw new Error(
      '[SmokeSetup] BASE_BACKEND_URL is not set in .env.\n' +
      'Set it to the deployed environment URL before running smoke tests.\n' +
      'Example: BASE_BACKEND_URL=https://<your-environment>.com',
    );
  }

  // Validate server reachability via /healthz
  const healthUrl = baseUrl.replace(/\/api\/?$/, '') + '/healthz';

  console.log(`\n[SmokeSetup] Target environment : ${baseUrl}`);
  console.log(`[SmokeSetup] Health check URL   : ${healthUrl}`);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const res = await fetch(healthUrl, {
      method: 'GET',
      signal: controller.signal,
      headers: { Accept: 'application/json, text/plain, */*' },
    });

    clearTimeout(timeout);

    if (res.status >= 502 && res.status <= 504) {
      throw new Error(
        `[SmokeSetup] Server returned ${res.status} — environment may be down or not fully deployed.`,
      );
    }

    console.log(`[SmokeSetup] Health check passed (HTTP ${res.status}) — proceeding with smoke tests.\n`);
  } catch (err: unknown) {
    clearTimeout(timeout);
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`[SmokeSetup] Cannot reach deployed server at ${healthUrl}.\nReason: ${msg}`);
  }
}
