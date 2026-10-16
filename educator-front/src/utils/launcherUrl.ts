/**
 * The box launcher: http://localhost:7700 on the box itself, or the box's public dashboard
 * (<name>-educator.<domain> -> https://<name>.<domain>). Null anywhere else.
 */
export function getLauncherUrl(hostname: string): string | null {
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return 'http://localhost:7700/';
  }
  const m = /^(.+)-(?:student-v1|student-v2|educator)\.(.+)$/.exec(hostname);
  return m ? `https://${m[1]}.${m[2]}/` : null;
}
