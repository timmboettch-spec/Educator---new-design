import { SimulationReportsController } from 'src/simulation-reports/simulation-reports.controller';
import { ROLES_KEY } from 'src/common/decorators/required-roles.decorator';
import { RoleSlug } from 'src/common/constants';

describe('SimulationReportsController.bulkReview — role gating', () => {
  // Role enforcement lives in the global AuthGuard (covered by its own spec); this asserts
  // the @RequiredRoles metadata it reads.
  it('declares @RequiredRoles(Educator) on PATCH /simulation-reports/bulk-review', () => {
    const roles = Reflect.getMetadata(ROLES_KEY, SimulationReportsController.prototype.bulkReview) as
      | RoleSlug[]
      | undefined;
    expect(roles).toEqual([RoleSlug.EDUCATOR]);
  });
});
