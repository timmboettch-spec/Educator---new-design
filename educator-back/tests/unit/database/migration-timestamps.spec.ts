import { readdirSync } from 'fs';
import { join } from 'path';

/**
 * Migration filenames must carry a UNIQUE, MONOTONIC timestamp.
 *
 * Why this test exists — a real outage on 28 Sep 2026:
 *
 * `CreateAvatarsTable` was authored with timestamp 1790200000000. While that
 * branch was open, `CreateGoogleSchoolConnections` merged to dev carrying the
 * SAME timestamp. Both files then coexisted happily — a rebase surfaces
 * nothing, because neither file conflicts with the other.
 *
 * TypeORM records applied migrations by (timestamp, name) and orders the run
 * by timestamp. With 1790200000000 already recorded on the live database, the
 * second migration was skipped, a later migration then failed against the
 * table it expected, and because migrations run inline in the container's
 * startup command (see Dockerfile CMD: `migration:run && seed:prod && node
 * dist/main.js`) the container never started. The revision went
 * ActivationFailed and the deploy's smoke test curled /health for ten minutes
 * against something that was never coming up.
 *
 * None of that is visible in review, in a rebase, or in a green test run. The
 * only cheap place to catch it is here, on the filenames themselves.
 */
describe('database migrations', () => {
  const dir = join(__dirname, '..', '..', '..', 'src', 'database', 'migrations');

  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.ts'))
    .sort();

  const parse = (f: string): { timestamp: string; file: string } => {
    const m = /^(\d+)-/.exec(f);
    if (!m) throw new Error(`migration filename does not start with a timestamp: ${f}`);
    return { timestamp: m[1], file: f };
  };

  it('every migration filename starts with a numeric timestamp', () => {
    expect(() => files.map(parse)).not.toThrow();
  });

  it('no two migrations share a timestamp', () => {
    const byTimestamp = new Map<string, string[]>();
    for (const { timestamp, file } of files.map(parse)) {
      byTimestamp.set(timestamp, [...(byTimestamp.get(timestamp) ?? []), file]);
    }

    const collisions = [...byTimestamp.entries()].filter(([, fs]) => fs.length > 1);

    // Two collisions pre-date this check. Both halves of each pair were
    // applied together on every existing database, so neither can now be
    // renumbered without diverging from what those databases already record.
    // They are grandfathered by exact timestamp -- NOT by count, so a NEW
    // file landing on either timestamp still fails.
    const GRANDFATHERED = new Set(['1786433500006', '1791300000000']);

    const offending = collisions.filter(([ts]) => !GRANDFATHERED.has(ts));

    expect(
      offending.map(([ts, fs]) => `${ts}: ${fs.join(' + ')}`),
    ).toEqual([]);
  });

  it('grandfathered collisions have not grown', () => {
    const byTimestamp = new Map<string, string[]>();
    for (const { timestamp, file } of files.map(parse)) {
      byTimestamp.set(timestamp, [...(byTimestamp.get(timestamp) ?? []), file]);
    }
    // Exactly the two known pairs -- a third file on either timestamp is a
    // new bug wearing an old bug's number.
    expect(byTimestamp.get('1786433500006')?.length).toBe(2);
    expect(byTimestamp.get('1791300000000')?.length).toBe(2);
  });

  it('the class name suffix matches the filename timestamp', () => {
    // A rename that misses the class suffix leaves TypeORM recording the OLD
    // timestamp under a new filename -- the same silent skip, one step later.
    const mismatched: string[] = [];
    for (const { timestamp, file } of files.map(parse)) {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const src: string = require('fs').readFileSync(join(dir, file), 'utf8');
      // Anchor on the EXACT timestamp rather than a greedy \\d+ suffix: a class
      // like AddActionCategoriesToSimulationV21791300000000 ends in a digit
      // that belongs to the NAME ("SimulationV2"), not the timestamp, and a
      // greedy match mis-reads it as 21791300000000.
      const expected = new RegExp(
        `export class \\w*${timestamp}\\s+implements MigrationInterface`,
      );
      if (!/export class \w+\s+implements MigrationInterface/.test(src)) {
        mismatched.push(`${file}: no "export class ... implements MigrationInterface"`);
        continue;
      }
      if (!expected.test(src)) {
        const actual = /export class (\w+)\s+implements MigrationInterface/.exec(src);
        mismatched.push(
          `${file}: class ${actual?.[1] ?? '?'} does not end with filename timestamp ${timestamp}`,
        );
      }
    }
    expect(mismatched).toEqual([]);
  });
});
