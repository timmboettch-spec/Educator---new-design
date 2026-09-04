export function logInfo(message: string): void {
  process.stdout.write(`[INFO] ${message}\n`);
}

export function logError(message: string): void {
  process.stderr.write(`[ERROR] ${message}\n`);
}
