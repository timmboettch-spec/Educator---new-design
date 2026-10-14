import { Role } from 'src/database/entities';
import { RoleSlug } from 'src/common/constants';
import { DataSource } from 'typeorm';

export default async function seedRoles(dataSource: DataSource): Promise<void> {
  const roleRepo = dataSource.getRepository(Role);
  const roles = [
    { role_name: 'District Admin', slug: RoleSlug.DISTRICT_ADMIN },
    { role_name: 'Educator', slug: RoleSlug.EDUCATOR },
    { role_name: 'Student', slug: RoleSlug.STUDENT },
    // No v1 equivalent — a v2-only role, seeded here rather than in a separate
    // seeder now that roles_v2 has been folded into this same `role` table.
    { role_name: 'Scenario Admin', slug: RoleSlug.SCENARIO_ADMIN },
  ];

  console.log('Checking for existing roles...');
  for (const roleData of roles) {
    const exists = await roleRepo.findOneBy({
      role_name: roleData.role_name,
    });

    if (!exists) {
      await roleRepo.save(roleData);
      console.log(`Seeded role: ${roleData.role_name}`);
    } else if (!exists.slug) {
      // Backfills the v2 slug onto a pre-v2 row created before this column existed.
      await roleRepo.update({ id: exists.id }, { slug: roleData.slug });
      console.log(`Backfilled slug "${roleData.slug}" onto role "${roleData.role_name}"`);
    } else {
      console.log(`Role "${roleData.role_name}" already exists`);
    }
  }
}
