import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
import { User } from './users/entity/user.entity';
import { Role } from './roles/entity/role.entity';
import { Schools } from './schools/entity/schools.entity';
import { Educator } from './educators/entity/educator.entity';
import { EducatorSchool } from './educators/entity/educator-school.entity';
import { Student } from './students/entity/students.entity';
import { Class } from './class/entity/class.entity';
import { ClassEducator } from './class/entity/class-educator.entity';
import { Invite } from './invites/entity/invite.entity';
import { Simulation } from './simulations/entity/simulation.entity';
import { SimulationCatalog } from './simulation-catalog/entity/simulation-catalog.entity';
import { SimulationReport } from './simulation-reports/entity/simulation-report.entity';
import { EducatorSimulation } from './educator-simulations/entity/educator-simulation.entity';
import { Notification } from './notifications/entity/notification.entity';
import { LmsSchoolConfig } from './lms/entity/lms-school-config.entity';
import { LmsClassMapping } from './lms/entity/lms-class-mapping.entity';
import { LmsStudentMapping } from './lms/entity/lms-student-mapping.entity';
import { ClassTransferAudit } from './class-transfer/entity/class-transfer-audit.entity';

dotenv.config();

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  username: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl: process.env.ALLOW_NONSSL === 'true' ? { rejectUnauthorized: false } : false,
  entities: [
    User,
    Role,
    Schools,
    Educator,
    EducatorSchool,
    Class,
    ClassEducator,
    Student,
    Invite,
    Simulation,
    SimulationCatalog,
    SimulationReport,
    EducatorSimulation,
    Notification,
    LmsSchoolConfig,
    LmsClassMapping,
    LmsStudentMapping,
    ClassTransferAudit,
  ],
  migrations: [__dirname + '/migrations/*{.ts,.js}'],
  synchronize: false,
  logging: true,
});
