import { spawn } from 'child_process';
import type { IProcessResult } from '../interfaces/voice-profile.interface';

/**
 * Runs `command args` to completion and collects stdout/stderr. Never goes
 * through a shell, so arguments are passed verbatim.
 *
 * `signal` aborts the run: the child is SIGKILLed and the promise rejects with
 * an `AbortError`. A missing binary rejects with the spawn error
 * (`code: 'ENOENT'`). A non-zero exit resolves — callers inspect `code`.
 */
export function runProcess(
  command: string,
  args: string[],
  signal?: AbortSignal,
): Promise<IProcessResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      signal,
      killSignal: 'SIGKILL',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let settled = false;

    child.stdout?.on('data', (chunk: Buffer) => stdout.push(chunk));
    child.stderr?.on('data', (chunk: Buffer) => stderr.push(chunk));
    child.on('error', (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    });
    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      resolve({
        code,
        stdout: Buffer.concat(stdout),
        stderr: Buffer.concat(stderr).toString('utf8'),
      });
    });
  });
}
