import { describe, expect, it } from 'vitest';
import { buildClassesAttentionPath } from '../../src/routes/routePath';

describe('buildClassesAttentionPath', () => {
  it('builds the Classes page URL filtered to one attention measure', () => {
    expect(buildClassesAttentionPath('unreadReports')).toBe(
      '/classes?measure=unreadReports'
    );
  });
});
