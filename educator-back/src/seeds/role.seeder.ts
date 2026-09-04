import { AppDataSource } from '../data-source';
import { Role } from '../roles/entity/role.entity';

async function runRolesSeeder(): Promise<void> {
  try {
    console.log('Initializing Data Source...');
    await AppDataSource.initialize();

    const roleRepo = AppDataSource.getRepository(Role);
    const roles = [{ role_name: 'District Admin' }, { role_name: 'Educator' }];

    console.log('Checking for existing roles...');
    for (const roleData of roles) {
      const exists = await roleRepo.findOneBy({
        role_name: roleData.role_name,
      });

      if (!exists) {
        await roleRepo.save(roleData);
        console.log(`Seeded role: ${roleData.role_name}`);
      } else {
        console.log(`Role "${roleData.role_name}" already exists`);
      }
    }
  } catch (error) {
    console.error('Error during roles seeding:', error);
  } finally {
    if (AppDataSource.isInitialized) {
      await AppDataSource.destroy();
    }
  }
}

void runRolesSeeder();
