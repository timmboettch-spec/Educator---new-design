import fs from 'fs';
import path from 'path';

const fixturesDir = path.join(process.cwd(), 'tests', 'e2e', 'fixtures');

export function readJsonFixture<T>(fileName: string): T {
  return JSON.parse(
    fs.readFileSync(path.join(fixturesDir, fileName), 'utf-8')
  ) as T;
}

export function writeJsonFixture(fileName: string, data: unknown): void {
  fs.writeFileSync(
    path.join(fixturesDir, fileName),
    JSON.stringify(data, null, 2)
  );
}

export function fixturePath(fileName: string): string {
  return path.join(fixturesDir, fileName);
}
