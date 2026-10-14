import { activeClassScopeSql, liveClassScopeSql } from 'src/common/utils/class-scope.util';

describe('liveClassScopeSql', () => {
  const sql = liveClassScopeSql('c');

  it('requires an active, not soft-deleted class and an active (or absent) school', () => {
    expect(sql).toContain('c.is_active = true');
    expect(sql).toContain('c.deleted_at IS NULL');
    expect(sql).toContain('c.school_id IS NULL OR EXISTS');
    expect(sql).toContain('sch.is_active = true');
  });

  it('keeps Google Classroom classes only when not archived and still mapped', () => {
    expect(sql).toContain("c.origin <> 'google_classroom'");
    expect(sql).toContain("c.status <> 'ARCHIEVED'");
    expect(sql).toContain('google_course_mappings');
  });

  it('has no status allow-list, so an INACTIVE non-Google class stays in scope', () => {
    expect(sql).not.toContain('c.status IN');
    expect(sql).not.toContain("c.status = '");
  });

  it('embeds only literals (no bound parameters) so it composes into any query', () => {
    expect(sql).not.toMatch(/[:$]\w/);
  });

  it('uses the given alias throughout', () => {
    expect(liveClassScopeSql('cls')).not.toMatch(/\bc\./);
  });
});

describe('activeClassScopeSql', () => {
  const sql = activeClassScopeSql('c');

  it('is the live-class scope plus status ACTIVE', () => {
    expect(sql).toContain(liveClassScopeSql('c'));
    expect(sql).toContain("c.status = 'ACTIVE'");
  });

  it('uses the given alias and no bound parameters', () => {
    expect(activeClassScopeSql('cls')).not.toMatch(/\bc\./);
    expect(sql).not.toMatch(/[:$]\w/);
  });
});
