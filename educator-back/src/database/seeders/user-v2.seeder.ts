import * as bcrypt from 'bcrypt';
import { DataSource } from 'typeorm';
import { User, Role, UserRole } from 'src/database/entities';
import { RoleSlug } from 'src/common/constants';
import { CommonStatus } from 'src/common/enums/status.enum';
import { AuthConstants } from 'src/auth/auth.constants';

/** Seed v2 accounts (users.email), each paired with the role slug to link them to. */
const SEED_USERS_V2 = [
  { email: 'admin@example.com', password: 'password123', roleSlug: RoleSlug.SCENARIO_ADMIN },
];

/** Runs after role (alphabetically, "role" < "user-v2"), so its role slugs are already seeded. */
export default async function seedUsersV2(dataSource: DataSource): Promise<void> {
  const userRepo = dataSource.getRepository(User);
  const roleRepo = dataSource.getRepository(Role);
  const userRoleRepo = dataSource.getRepository(UserRole);

  console.log('Checking for existing v2 users...');
  for (const seedUser of SEED_USERS_V2) {
    const exists = await userRepo.findOneBy({ email: seedUser.email });

    const role = await roleRepo.findOneBy({ slug: seedUser.roleSlug });
    if (!role) {
      console.log(
        `Role "${seedUser.roleSlug}" not found — skipping seed user "${seedUser.email}".`,
      );
      continue;
    }

    if (exists) {
      const hashedPassword = await bcrypt.hash(seedUser.password, AuthConstants.SALT_ROUNDS);
      await userRepo.update({ id: exists.id }, { password: hashedPassword });
      console.log(`User "${seedUser.email}" already exists — password updated`);

      const roleExists = await userRoleRepo.findOneBy({ userId: exists.id, roleId: role.id });
      if (!roleExists) {
        await userRoleRepo.save(
          userRoleRepo.create({ userId: exists.id, roleId: role.id, status: CommonStatus.ACTIVE }),
        );
        console.log(`Added missing role "${seedUser.roleSlug}" for user "${seedUser.email}"`);
      }
      continue;
    }

    const hashedPassword = await bcrypt.hash(seedUser.password, AuthConstants.SALT_ROUNDS);

    const user = await userRepo.save(
      userRepo.create({
        email: seedUser.email,
        password: hashedPassword,
        status: CommonStatus.ACTIVE,
      }),
    );

    await userRoleRepo.save(
      userRoleRepo.create({ userId: user.id, roleId: role.id, status: CommonStatus.ACTIVE }),
    );

    console.log(`Seeded user: ${seedUser.email} (${seedUser.roleSlug})`);
  }
}
