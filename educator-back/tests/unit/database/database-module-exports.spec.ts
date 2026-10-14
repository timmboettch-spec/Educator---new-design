import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Every provider token DatabaseModule provides must also be exported.
 *
 * Why this test exists -- 28 Sep 2026: AVATAR_REPOSITORY was added to the
 * providers array but not to exports. DatabaseModule is @Global(), and a
 * global module still only shares what it EXPORTS, so AvatarsService could
 * not resolve its own repository:
 *
 *   UnknownDependenciesException: Can't resolve dependencies of
 *   AvatarsService. Symbol(AVATAR_REPOSITORY) not available in AvatarsModule
 *
 * It broke `npm run start:dev` for everyone on the team. It did not break
 * CI, because the unit suites construct services with mocked repositories
 * and never build the real Nest container -- so nothing exercised the
 * wiring. One token out of forty was missing and nothing said so.
 */
describe('DatabaseModule', () => {
  const source = readFileSync(
    join(__dirname, '..', '..', '..', 'src', 'database', 'database.module.ts'),
    'utf8',
  );

  const provided = [
    ...new Set([...source.matchAll(/provide:\s*([A-Z_0-9]+)/g)].map((m) => m[1])),
  ].sort();

  const exportsBlock = /exports:\s*\[(.*?)\n\s*\],/s.exec(source);
  const exported = new Set(
    exportsBlock ? [...exportsBlock[1].matchAll(/\b([A-Z_0-9]{4,})\b/g)].map((m) => m[1]) : [],
  );

  it('finds the providers and exports arrays', () => {
    expect(provided.length).toBeGreaterThan(30);
    expect(exportsBlock).not.toBeNull();
    expect(exported.size).toBeGreaterThan(30);
  });

  it('exports every token it provides', () => {
    // A provider missing here is invisible to every other module, and the
    // failure only shows at application boot -- never in a unit test.
    expect(provided.filter((token) => !exported.has(token))).toEqual([]);
  });
});
