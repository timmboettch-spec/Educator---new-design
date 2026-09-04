import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { EducatorsController } from '../../../src/educators/educators.controller';
import { EducatorsService } from '../../../src/educators/educators.service';
import { Educator } from '../../../src/educators/entity/educator.entity';
import { EducatorSchool } from '../../../src/educators/entity/educator-school.entity';
import { User } from '../../../src/users/entity/user.entity';
import { Schools } from '../../../src/schools/entity/schools.entity';
import { Class } from '../../../src/class/entity/class.entity';
import { Student } from '../../../src/students/entity/students.entity';
import { ClassSimulation } from '../../../src/class-simulations/entity/class-simulation.entity';
import { Invite } from '../../../src/invites/entity/invite.entity';
import { AzureBlobService } from '../../../src/config/azure-blob.config';
import { MailService } from '../../../src/mail/mail.service';
import { NotificationsGateway } from '../../../src/notifications/notifications.gateway';
import { TutorPatientService } from '../../../src/common/utils/tutor-patient.service';
import { CommonStatus } from '../../../src/common/enums/status.enum';
import { buildTestApp, TEST_USERS } from '../setup/test-app.factory';

type TestBody = {
  status?: string;
  data?: unknown;
};

const parseBody = (res: request.Response): TestBody => {
  const body: unknown = res.body;
  if (typeof body === 'object' && body !== null) {
    return body;
  }
  throw new Error('Expected response body to be an object');
};

const asRecord = (value: unknown): Record<string, unknown> => {
  if (typeof value === 'object' && value !== null) {
    return value as Record<string, unknown>;
  }
  throw new Error('Expected value to be an object');
};

const asArray = (value: unknown): unknown[] => {
  if (Array.isArray(value)) {
    return value;
  }
  throw new Error('Expected value to be an array');
};

const expectStatus = (res: request.Response, expected: string): void => {
  const body = parseBody(res);
  expect(body.status).toBe(expected);
};

const makeEducator = (o: Partial<Educator> = {}): Educator =>
  ({
    id: '550e8400-e29b-41d4-a716-446655440101',
    email: 'edu@test.com',
    full_name: 'Test Educator',
    status: CommonStatus.ACTIVE,
    is_active: true,
    tokens: 10,
    created_at: new Date(),
    updated_at: new Date(),
    admin: { id: TEST_USERS.districtAdmin.sub } as User,
    school: { id: 'school-1', school_name: 'Test School' } as Schools,
    ...o,
  }) as Educator;

describe('Educators (Integration)', () => {
  let app: INestApplication;
  let signToken: (user?: object) => string;
  let adminToken: string;

  const httpServer = (): Parameters<typeof request>[0] => {
    const server: unknown = app.getHttpServer();
    return server as Parameters<typeof request>[0];
  };

  const EDUCATOR_ID = '550e8400-e29b-41d4-a716-446655440101';
  const OTHER_ADMIN_ID = '550e8400-e29b-41d4-a716-446655440111';
  const ANY_ADMIN_ID = '550e8400-e29b-41d4-a716-446655440112';

  const educatorRepo = {
    find: jest.fn(),
    findOne: jest.fn(),
    save: jest.fn(),
    remove: jest.fn(),
    create: jest.fn(),
  };
  const userRepo = { findOne: jest.fn() };
  const schoolRepo = { findOne: jest.fn() };
  const classRepo = { find: jest.fn(), findOne: jest.fn() };
  const studentRepo = { find: jest.fn(), findOne: jest.fn() };
  const classSimulationRepo = { find: jest.fn(), findOne: jest.fn() };
  const inviteRepo = { findOne: jest.fn(), delete: jest.fn(), save: jest.fn(), create: jest.fn() };
  const azureBlobService = {
    uploadFile: jest.fn(),
    isConfigured: jest.fn().mockReturnValue(false),
  };
  const dataSource = { query: jest.fn(), transaction: jest.fn() };
  const mailService = { sendMail: jest.fn().mockResolvedValue(undefined) };
  const notificationsGateway = {
    notifyAccountDeleted: jest.fn(),
    notifyAdminEducatorStatusUpdated: jest.fn(),
  };

  beforeAll(async () => {
    ({ app, signToken } = await buildTestApp({
      controllers: [EducatorsController],
      providers: [
        EducatorsService,
        { provide: getRepositoryToken(Educator), useValue: educatorRepo },
        {
          provide: getRepositoryToken(EducatorSchool),
          useValue: { findOne: jest.fn(), count: jest.fn(), create: jest.fn(), save: jest.fn() },
        },
        { provide: getRepositoryToken(User), useValue: userRepo },
        { provide: getRepositoryToken(Schools), useValue: schoolRepo },
        { provide: getRepositoryToken(Class), useValue: classRepo },
        { provide: getRepositoryToken(Student), useValue: studentRepo },
        { provide: getRepositoryToken(ClassSimulation), useValue: classSimulationRepo },
        { provide: getRepositoryToken(Invite), useValue: inviteRepo },
        { provide: AzureBlobService, useValue: azureBlobService },
        { provide: DataSource, useValue: dataSource },
        { provide: MailService, useValue: mailService },
        { provide: NotificationsGateway, useValue: notificationsGateway },
        {
          provide: TutorPatientService,
          useValue: {
            getReportsByStudentIds: jest.fn().mockResolvedValue({ matched: [], isMatch: false }),
          },
        },
      ],
    }));
    adminToken = signToken(TEST_USERS.districtAdmin);
  });

  afterAll(async () => app.close());
  afterEach(() => jest.clearAllMocks());

  describe('GET /api/educators', () => {
    it('INTEGRATION: returns 401 when no JWT provided', async () => {
      return request(httpServer()).get('/api/educators').expect(401);
    });

    it('INTEGRATION: returns 200 with educator list', async () => {
      educatorRepo.find.mockResolvedValue([makeEducator()]);

      return request(httpServer())
        .get('/api/educators')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200)
        .expect((res) => {
          const body = parseBody(res);
          expect(body.status).toBe('SUCCESS');
          expect(Array.isArray(body.data)).toBe(true);
        });
    });

    it('INTEGRATION: returns 200 with empty list when no educators', async () => {
      educatorRepo.find.mockResolvedValue([]);

      return request(httpServer())
        .get('/api/educators')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200)
        .expect((res) => {
          const body = parseBody(res);
          expect(asArray(body.data)).toHaveLength(0);
        });
    });
  });

  describe('GET /api/educators/:id', () => {
    it('INTEGRATION: returns 200 when educator found', async () => {
      educatorRepo.findOne.mockResolvedValue(makeEducator());

      return request(httpServer())
        .get(`/api/educators/${EDUCATOR_ID}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200)
        .expect((res) => {
          const body = parseBody(res);
          const data = asRecord(body.data);
          expect(body.status).toBe('SUCCESS');
          expect(data.id).toBe(EDUCATOR_ID);
        });
    });

    it('INTEGRATION: returns 404 when educator not found', async () => {
      educatorRepo.findOne.mockResolvedValue(null);

      return request(httpServer())
        .get('/api/educators/550e8400-e29b-41d4-a716-446655440199')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404)
        .expect((res) => {
          expectStatus(res, 'FAILED');
        });
    });

    it('INTEGRATION: returns 400 when ID is not a valid UUID', async () => {
      return request(httpServer())
        .get('/api/educators/not-a-uuid')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);
    });
  });

  describe('GET /api/educators/admin/:adminId', () => {
    it('INTEGRATION: returns 200 when admin fetches their own educators', async () => {
      educatorRepo.find.mockResolvedValue([makeEducator()]);

      return request(httpServer())
        .get(`/api/educators/admin/${TEST_USERS.districtAdmin.sub}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200)
        .expect((res) => {
          expectStatus(res, 'SUCCESS');
        });
    });

    it('INTEGRATION: returns 401 when admin tries to fetch another admin educators', async () => {
      return request(httpServer())
        .get(`/api/educators/admin/${OTHER_ADMIN_ID}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(401);
    });

    it('INTEGRATION: returns 200 when Super Admin fetches any admin educators', async () => {
      educatorRepo.find.mockResolvedValue([]);
      const superToken = signToken(TEST_USERS.superAdmin);

      return request(httpServer())
        .get(`/api/educators/admin/${ANY_ADMIN_ID}`)
        .set('Authorization', `Bearer ${superToken}`)
        .expect(200)
        .expect((res) => {
          expectStatus(res, 'SUCCESS');
        });
    });
  });

  describe('PUT /api/educators/:id', () => {
    it('INTEGRATION: returns 401 when no JWT provided', async () => {
      return request(httpServer())
        .put('/api/educators/edu-1')
        .send({ full_name: 'Updated' })
        .expect(401);
    });

    it('INTEGRATION: returns 404 when educator not found', async () => {
      educatorRepo.findOne.mockResolvedValue(null);

      return request(httpServer())
        .put(`/api/educators/${TEST_USERS.districtAdmin.sub}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ full_name: 'Updated' })
        .expect(404)
        .expect((res) => {
          expectStatus(res, 'FAILED');
        });
    });

    it('INTEGRATION: returns 200 when educator updated successfully', async () => {
      const updated = makeEducator({ full_name: 'Updated Name' });
      educatorRepo.findOne.mockResolvedValueOnce(makeEducator()).mockResolvedValueOnce(updated);
      educatorRepo.save.mockResolvedValue(updated);

      return request(httpServer())
        .put(`/api/educators/${TEST_USERS.districtAdmin.sub}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ full_name: 'Updated Name' })
        .expect(200)
        .expect((res) => {
          expectStatus(res, 'SUCCESS');
        });
    });
  });

  describe('DELETE /api/educators/:id', () => {
    it('INTEGRATION: returns 401 when no JWT provided', async () => {
      return request(httpServer()).delete('/api/educators/edu-1').expect(401);
    });

    it('INTEGRATION: returns 404 when educator not found', async () => {
      educatorRepo.findOne.mockResolvedValue(null);

      return request(httpServer())
        .delete(`/api/educators/${TEST_USERS.districtAdmin.sub}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);
    });

    it('INTEGRATION: returns 200 when educator deleted', async () => {
      educatorRepo.findOne.mockResolvedValue(makeEducator());
      classRepo.find.mockResolvedValue([]);
      dataSource.query.mockResolvedValue([]);
      dataSource.transaction.mockImplementation(async (cb: (manager: unknown) => Promise<void>) => {
        const manager = {
          findOne: jest.fn().mockResolvedValueOnce(makeEducator()).mockResolvedValueOnce(null),
          find: jest.fn().mockResolvedValue([]),
          save: jest.fn().mockResolvedValue({}),
          query: jest.fn().mockResolvedValue([]),
          update: jest.fn().mockResolvedValue({}),
        };
        await cb(manager);
      });

      return request(httpServer())
        .delete(`/api/educators/${TEST_USERS.districtAdmin.sub}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200)
        .expect((res) => {
          expectStatus(res, 'SUCCESS');
        });
    });
  });
});
