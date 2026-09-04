import { INestApplication } from '@nestjs/common';
import { TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { AuthController } from '../../../src/auth/auth.controller';
import { AuthService } from '../../../src/auth/auth.service';
import { CsrfService } from '../../../src/csrf/csrf.service';
import { UsersService } from '../../../src/users/users.service';
import { RedemptionsService } from '../../../src/users/redemptions.service';
import { InvitesService } from '../../../src/invites/invites.service';
import { MailService } from '../../../src/mail/mail.service';
import { TutorPatientService } from '../../../src/common/utils/tutor-patient.service';
import { NotificationsGateway } from '../../../src/notifications/notifications.gateway';
import { Educator } from '../../../src/educators/entity/educator.entity';
import { EducatorSchool } from '../../../src/educators/entity/educator-school.entity';
import { Schools } from '../../../src/schools/entity/schools.entity';
import { User } from '../../../src/users/entity/user.entity';
import { CommonStatus } from '../../../src/common/enums/status.enum';
import { buildTestApp, TEST_USERS } from '../setup/test-app.factory';
import { EducatorSessionService } from '../../../src/session/educator-session.service';
import * as bcrypt from 'bcrypt';

type TestResponseBody = {
  status?: string;
  data?: unknown;
};

const parseBody = (res: request.Response): TestResponseBody => {
  const body: unknown = res.body;
  if (typeof body === 'object' && body !== null) {
    return body;
  }
  throw new Error('Expected response body to be an object');
};

const expectStatus = (res: request.Response, expected: string): void => {
  const body = parseBody(res);
  expect(body.status).toBe(expected);
};

const makeUser = (o: Partial<User> = {}): User =>
  ({
    id: 'u-1',
    email: 'admin@test.com',
    password: '',
    status: CommonStatus.ACTIVE,
    role: { role_name: 'District Admin' },
    ...o,
  }) as User;

describe('Auth (Integration)', () => {
  let app: INestApplication;
  let testModule: TestingModule;
  let signToken: (user?: object) => string;

  const httpServer = (): Parameters<typeof request>[0] => {
    const server: unknown = app.getHttpServer();
    return server as Parameters<typeof request>[0];
  };

  const usersService = {
    findByEmail: jest.fn(),
    createUser: jest.fn(),
    updateByEmail: jest.fn(),
  };
  const invitesService = { findInviteById: jest.fn(), acceptInvite: jest.fn() };
  const mailService = { sendMail: jest.fn().mockResolvedValue({}) };
  const notificationsGateway = { notifyLicenseRedemption: jest.fn() };
  const csrfService = {
    generateToken: jest.fn().mockReturnValue('mock-csrf-token'),
    storeToken: jest.fn().mockResolvedValue(undefined),
  };
  const educatorRepo = { findOne: jest.fn(), save: jest.fn() };
  const tutorPatientService = {
    getScenarios: jest.fn().mockResolvedValue([]),
    getUnits: jest.fn().mockResolvedValue([]),
    getSalesOrderByRedeemCode: jest.fn().mockResolvedValue({ found: false, lines: [] }),
  };
  const redemptionsService = {
    findByUserAndRedeemCode: jest.fn(),
    redeemAndActivateUser: jest.fn(),
    findByRedeemCode: jest.fn(),
  };

  beforeAll(async () => {
    ({
      app,
      module: testModule,
      signToken,
    } = await buildTestApp({
      controllers: [AuthController],
      providers: [
        AuthService,
        { provide: UsersService, useValue: usersService },
        { provide: RedemptionsService, useValue: redemptionsService },
        { provide: TutorPatientService, useValue: tutorPatientService },
        { provide: InvitesService, useValue: invitesService },
        { provide: MailService, useValue: mailService },
        { provide: NotificationsGateway, useValue: notificationsGateway },
        { provide: CsrfService, useValue: csrfService },
        { provide: getRepositoryToken(Educator), useValue: educatorRepo },
        {
          provide: getRepositoryToken(EducatorSchool),
          useValue: {
            findOne: jest.fn(),
            count: jest.fn().mockResolvedValue(0),
            save: jest.fn(),
            create: jest.fn(),
          },
        },
        { provide: getRepositoryToken(Schools), useValue: { findOne: jest.fn() } },
        { provide: DataSource, useValue: { query: jest.fn().mockResolvedValue([]) } },
      ],
    }));
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });
  afterEach(() => {
    jest.clearAllMocks();
    mailService.sendMail.mockResolvedValue({});
  });

  describe('POST /api/auth/signup', () => {
    it('INTEGRATION: returns 201 with SUCCESS on valid signup', async () => {
      usersService.findByEmail.mockResolvedValue(null);
      educatorRepo.findOne.mockResolvedValue(null);
      usersService.createUser.mockResolvedValue(makeUser());

      return request(httpServer())
        .post('/api/auth/signup')
        .send({
          email: 'new@test.com',
          password: 'password123',
          full_name: 'New Admin',
          status: CommonStatus.ACTIVE,
        })
        .expect(201)
        .expect((res) => {
          expectStatus(res, 'SUCCESS');
        });
    });

    it('INTEGRATION: returns 400 when user already exists', async () => {
      usersService.findByEmail.mockResolvedValue(makeUser());
      educatorRepo.findOne.mockResolvedValue(null);

      return request(httpServer())
        .post('/api/auth/signup')
        .send({
          email: 'admin@test.com',
          password: 'pass',
          full_name: 'Existing',
          status: CommonStatus.ACTIVE,
        })
        .expect(400)
        .expect((res) => {
          expectStatus(res, 'FAILED');
        });
    });

    it('INTEGRATION: returns 400 when required fields are missing', async () => {
      return request(httpServer())
        .post('/api/auth/signup')
        .send({ email: 'no-name@test.com' })
        .expect(400);
    });
  });

  describe('POST /api/auth/login', () => {
    it('INTEGRATION: returns 201 with token on valid admin login', async () => {
      const hash = await bcrypt.hash('password123', 10);
      usersService.findByEmail.mockResolvedValue(makeUser({ password: hash }));
      educatorRepo.findOne.mockResolvedValue(null);

      return request(httpServer())
        .post('/api/auth/login')
        .send({ email: 'admin@test.com', password: 'password123' })
        .expect(201)
        .expect((res) => {
          const body = parseBody(res);
          expect(body.status).toBe('SUCCESS');
          expect(body.data).toBeDefined();
        });
    });

    it('INTEGRATION: returns 401 on invalid credentials', async () => {
      const hash = await bcrypt.hash('correct', 10);
      usersService.findByEmail.mockResolvedValue(makeUser({ password: hash }));
      educatorRepo.findOne.mockResolvedValue(null);

      return request(httpServer())
        .post('/api/auth/login')
        .send({ email: 'admin@test.com', password: 'wrong' })
        .expect(401)
        .expect((res) => {
          expectStatus(res, 'FAILED');
        });
    });

    it('INTEGRATION: returns 401 when user not found', async () => {
      usersService.findByEmail.mockResolvedValue(null);
      educatorRepo.findOne.mockResolvedValue(null);

      return request(httpServer())
        .post('/api/auth/login')
        .send({ email: 'nobody@test.com', password: 'pass' })
        .expect((res) => {
          expect([400, 401]).toContain(res.status);
          expectStatus(res, 'FAILED');
        });
    });

    it('INTEGRATION: returns 400 when email is missing', async () => {
      return request(httpServer()).post('/api/auth/login').send({ password: 'pass' }).expect(400);
    });
  });

  describe('POST /api/auth/logout', () => {
    it('INTEGRATION: returns 201 SUCCESS with token in header', async () => {
      const token = signToken(TEST_USERS.superAdmin);

      return request(httpServer())
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${token}`)
        .expect(201)
        .expect((res) => {
          expectStatus(res, 'SUCCESS');
        });
    });

    it('INTEGRATION: returns 401 without token header', async () => {
      return request(httpServer()).post('/api/auth/logout').expect(401);
    });
  });

  describe('POST /api/auth/forgot-password', () => {
    it('INTEGRATION: returns 201 SUCCESS when user found', async () => {
      usersService.findByEmail.mockResolvedValue(makeUser());
      educatorRepo.findOne.mockResolvedValue(null);

      return request(httpServer())
        .post('/api/auth/forgot-password')
        .send({ email: 'admin@test.com' })
        .expect(201)
        .expect((res) => {
          expectStatus(res, 'SUCCESS');
        });
    });

    it('INTEGRATION: returns 404 when admin user not found', async () => {
      usersService.findByEmail.mockResolvedValue(null);
      educatorRepo.findOne.mockResolvedValue(null);

      return request(httpServer())
        .post('/api/auth/forgot-password')
        .send({
          email: 'nobody@test.com',
          role: 'admin',
        })
        .expect(404)
        .expect((res) => {
          expectStatus(res, 'FAILED');
        });
    });

    it('INTEGRATION: returns 400 when email is missing', async () => {
      return request(httpServer()).post('/api/auth/forgot-password').send({}).expect(400);
    });
  });

  describe('POST /api/auth/redeem', () => {
    it('INTEGRATION: returns 401 when no token provided', async () => {
      return request(httpServer()).post('/api/auth/redeem').send({ code: 'TESTCODE' }).expect(401);
    });

    it('INTEGRATION: returns 400 when code is already used by this user', async () => {
      usersService.findByEmail.mockResolvedValue(makeUser());
      redemptionsService.findByUserAndRedeemCode.mockResolvedValue({ id: 'r-1' });

      const token = signToken(TEST_USERS.districtAdmin);

      return request(httpServer())
        .post('/api/auth/redeem')
        .set('Authorization', `Bearer ${token}`)
        .send({ code: 'ABCD1234EFGH5678' })
        .expect(400)
        .expect((res) => {
          expectStatus(res, 'FAILED');
        });
    });

    it('INTEGRATION: returns 400 when code is invalid or not found in sales orders', async () => {
      usersService.findByEmail.mockResolvedValue(makeUser());
      redemptionsService.findByUserAndRedeemCode.mockResolvedValue(null);
      tutorPatientService.getSalesOrderByRedeemCode.mockResolvedValue({ found: false, lines: [] });

      const token = signToken(TEST_USERS.districtAdmin);

      return request(httpServer())
        .post('/api/auth/redeem')
        .set('Authorization', `Bearer ${token}`)
        .send({ code: 'INVALIDCODEINVAL' })
        .expect((res) => {
          expect([400, 404]).toContain(res.status);
          expectStatus(res, 'FAILED');
        });
    });

    it('INTEGRATION: returns 201 on successful code redemption', async () => {
      usersService.findByEmail.mockResolvedValue(makeUser());
      redemptionsService.findByUserAndRedeemCode.mockResolvedValue(null);
      tutorPatientService.getSalesOrderByRedeemCode.mockResolvedValue({
        found: true,
        lines: [
          {
            so: 'SO-001',
            customer: 'Test Corp',
            ai_seats: 5,
            product_name: 'Access',
            start_date: '2026-01-01',
            end_date: '2027-01-01',
          },
        ],
      });
      redemptionsService.redeemAndActivateUser.mockResolvedValue(makeUser());

      const token = signToken(TEST_USERS.districtAdmin);

      return request(httpServer())
        .post('/api/auth/redeem')
        .set('Authorization', `Bearer ${token}`)
        .send({ code: 'ABCD1234EFGH5678' })
        .expect(201)
        .expect((res) => {
          expectStatus(res, 'SUCCESS');
        });
    });

    it('INTEGRATION: returns 400 when code is empty string', async () => {
      const token = signToken(TEST_USERS.districtAdmin);

      return request(httpServer())
        .post('/api/auth/redeem')
        .set('Authorization', `Bearer ${token}`)
        .send({ code: '' })
        .expect(400);
    });

    it('INTEGRATION: returns 400 when code cleans to empty (special chars only)', async () => {
      usersService.findByEmail.mockResolvedValue(makeUser());
      const token = signToken(TEST_USERS.districtAdmin);

      return request(httpServer())
        .post('/api/auth/redeem')
        .set('Authorization', `Bearer ${token}`)
        .send({ code: '--- !!!---' })
        .expect((res) => {
          expect([400, 404]).toContain(res.status);
          expectStatus(res, 'FAILED');
        });
    });

    it('INTEGRATION: returns 400 when user email not found in database', async () => {
      usersService.findByEmail.mockResolvedValue(null);
      const token = signToken(TEST_USERS.districtAdmin);

      return request(httpServer())
        .post('/api/auth/redeem')
        .set('Authorization', `Bearer ${token}`)
        .send({ code: 'ABCD1234EFGH5678' })
        .expect((res) => {
          expect([400, 404]).toContain(res.status);
          expectStatus(res, 'FAILED');
        });
    });

    it('INTEGRATION: returns 201 with subscription data on successful redemption (read-after-write)', async () => {
      const activatedUser = makeUser({
        subscriptions: [{ netsuite_id: 'SO-001', ai_seats: 5, seats_available: 5 }],
      });
      usersService.findByEmail.mockResolvedValue(makeUser());
      redemptionsService.findByUserAndRedeemCode.mockResolvedValue(null);
      tutorPatientService.getSalesOrderByRedeemCode.mockResolvedValue({
        found: true,
        lines: [{ so: 'SO-001', ai_seats: 5, product_name: 'HS Access', sim_group: 'HS' }],
      });
      redemptionsService.redeemAndActivateUser.mockResolvedValue(activatedUser);

      const token = signToken(TEST_USERS.districtAdmin);

      return request(httpServer())
        .post('/api/auth/redeem')
        .set('Authorization', `Bearer ${token}`)
        .send({ code: 'ABCD1234EFGH5678' })
        .expect(201)
        .expect((res) => {
          expectStatus(res, 'SUCCESS');
          const data = parseBody(res).data as Record<string, unknown>;
          expect(Array.isArray(data?.subscriptions)).toBe(true);
        });
    });

    // ── Expired code ─────────────────────────────────────────────────────────
    // Expired codes are not present (or filtered out) in the TutorPatient blob,
    // so getSalesOrderByRedeemCode returns found:false — same rejection path as invalid.

    it('INTEGRATION: returns 400 when code is expired (not found in sales order blob)', async () => {
      usersService.findByEmail.mockResolvedValue(makeUser());
      redemptionsService.findByUserAndRedeemCode.mockResolvedValue(null);
      // Expired codes resolve to not-found from the external TutorPatient service
      tutorPatientService.getSalesOrderByRedeemCode.mockResolvedValue({ found: false, lines: [] });

      const token = signToken(TEST_USERS.districtAdmin);

      const res = await request(httpServer())
        .post('/api/auth/redeem')
        .set('Authorization', `Bearer ${token}`)
        .send({ code: 'EXPIREDCODE12345' });

      expect([400, 404]).toContain(res.status);
      expectStatus(res, 'FAILED');
      expect(res.body?.message).toBeTruthy();
    });

    it('INTEGRATION: expired code does not create a redemption record', async () => {
      usersService.findByEmail.mockResolvedValue(makeUser());
      redemptionsService.findByUserAndRedeemCode.mockResolvedValue(null);
      tutorPatientService.getSalesOrderByRedeemCode.mockResolvedValue({ found: false, lines: [] });

      const token = signToken(TEST_USERS.districtAdmin);

      await request(httpServer())
        .post('/api/auth/redeem')
        .set('Authorization', `Bearer ${token}`)
        .send({ code: 'EXPIREDCODE12345' });

      expect(redemptionsService.redeemAndActivateUser).not.toHaveBeenCalled();
    });
  });

  describe('POST /api/auth/resend-otp', () => {
    it('INTEGRATION: returns 400 when reset_token is missing', () => {
      return request(httpServer()).post('/api/auth/resend-otp').send({}).expect(400);
    });

    it('INTEGRATION: returns 400 when reset_token is invalid (malformed JWT)', () => {
      return request(httpServer())
        .post('/api/auth/resend-otp')
        .send({ reset_token: 'not-a-jwt' })
        .expect(400)
        .expect((res) => {
          expectStatus(res, 'FAILED');
        });
    });

    it('INTEGRATION: returns 404 when user not found for valid-format token', () => {
      usersService.findByEmail.mockResolvedValue(null);
      educatorRepo.findOne.mockResolvedValue(null);

      // Use a real signed token with an expired timestamp so cooldown check passes
      const jwtSvc = testModule.get(JwtService);
      // Sign with custom exp via iat trick — sign normally then override via verify mock
      const token = jwtSvc.sign(
        { email: 'ghost@test.com', purpose: 'otp_verify', otp: '000000' },
        { expiresIn: '-1s' },
      );

      return request(httpServer())
        .post('/api/auth/resend-otp')
        .send({ reset_token: token })
        .expect((res) => {
          // 400 (bad request) or 404 (not found) are both acceptable
          expect([400, 404]).toContain(res.status);
          expectStatus(res, 'FAILED');
        });
    });

    it('INTEGRATION: returns 201 SUCCESS when user exists and cooldown has elapsed', () => {
      usersService.findByEmail.mockResolvedValue(makeUser({ email: 'admin@test.com' }));
      educatorRepo.findOne.mockResolvedValue(null);
      mailService.sendMail.mockResolvedValue({});

      const jwtSvc = testModule.get(JwtService);
      const token = jwtSvc.sign(
        { email: 'admin@test.com', purpose: 'otp_verify', otp: '000000' },
        { expiresIn: '-1s' },
      );

      return request(httpServer())
        .post('/api/auth/resend-otp')
        .send({ reset_token: token })
        .expect(201)
        .expect((res) => {
          expectStatus(res, 'SUCCESS');
        });
    });
  });

  describe('Session security (JWT lifecycle)', () => {
    it('INTEGRATION: returns 401 when JWT has expired', () => {
      const expiredToken = testModule.get(JwtService).sign(
        {
          sub: TEST_USERS.districtAdmin.sub,
          email: TEST_USERS.districtAdmin.email,
          roles: TEST_USERS.districtAdmin.roles,
          type: TEST_USERS.districtAdmin.type,
        },
        { expiresIn: -1 },
      );

      return request(httpServer())
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${expiredToken}`)
        .expect(401)
        .expect((res) => {
          expectStatus(res, 'FAILED');
        });
    });

    it('INTEGRATION: returns 401 when JWT is malformed or tampered', () => {
      return request(httpServer())
        .post('/api/auth/logout')
        .set('Authorization', 'Bearer this.is.not.a.valid.jwt')
        .expect(401)
        .expect((res) => {
          expectStatus(res, 'FAILED');
        });
    });

    it('INTEGRATION: returns 401 when blacklisted JWT is reused after logout', async () => {
      // Use a unique jti so this token is never the same as one signed elsewhere in the suite.
      // signToken() uses second-precision iat; two calls within the same second yield an
      // identical JWT string, which could collide with a token already blacklisted by an
      // earlier test.
      const token = testModule.get(JwtService).sign({
        sub: TEST_USERS.districtAdmin.sub,
        email: TEST_USERS.districtAdmin.email,
        roles: TEST_USERS.districtAdmin.roles,
        type: TEST_USERS.districtAdmin.type,
        jti: `reuse-test-${Date.now()}`,
      });

      // First logout must succeed and blacklist the token
      await request(httpServer())
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${token}`)
        .expect(201)
        .expect((res) => {
          expectStatus(res, 'SUCCESS');
        });

      // Reusing the same token must now be rejected
      return request(httpServer())
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${token}`)
        .expect(401)
        .expect((res) => {
          expectStatus(res, 'FAILED');
        });
    });

    it('INTEGRATION: returns 401 when educator session is invalidated (deactivated account)', async () => {
      // Simulate admin-triggered deactivation: isTokenInvalidated returns true for this request
      const educatorSessionService = testModule.get(EducatorSessionService);
      (educatorSessionService.isTokenInvalidated as jest.Mock).mockResolvedValueOnce(true);

      const token = signToken(TEST_USERS.educator);

      return request(httpServer())
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${token}`)
        .expect(401)
        .expect((res) => {
          expectStatus(res, 'FAILED');
        });
    });
  });
});
