/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return, @typescript-eslint/require-await, @typescript-eslint/explicit-function-return-type */
import 'tsconfig-paths/register';

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe, CanActivate } from '@nestjs/common';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD, Reflector } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import * as net from 'net';
import * as fs from 'fs';
import * as path from 'path';
import * as bcrypt from 'bcrypt';
import { sign as jwtSign, verify as jwtVerify } from 'jsonwebtoken';

// ── controllers ───────────────────────────────────────────────────────────────
import { AppController } from '../../src/app.controller';
import { AppService } from '../../src/app.service';
import { AuthController } from '../../src/auth/auth.controller';
import { SchoolsController } from '../../src/schools/schools.controller';
import { EducatorsController } from '../../src/educators/educators.controller';
import { DashboardController } from '../../src/dashboard/dashboard.controller';
import { ClassesController } from '../../src/class/classes.controller';
import { StudentsController } from '../../src/students/students.controller';
import { SimulationCatalogController } from '../../src/simulation-catalog/simulation-catalog.controller';
import { EducatorSimulationsController } from '../../src/educator-simulations/educator-simulations.controller';
import { InvitesController } from '../../src/invites/invites.controller';
import { UsersController } from '../../src/users/users.controller';
import { SimulationsController } from '../../src/simulations/simulations.controller';

// ── strategy & auth infrastructure ────────────────────────────────────────────
import { JwtStrategy } from '../../src/common/strategy/jwt.strategy';
import { TokenBlacklistService } from '../../src/common/strategy/jwt.blacklist.strategy';
import { EducatorSessionService } from '../../src/session/educator-session.service';
import { JwtAuthGuard } from '../../src/common/guards/jwt-auth.guard';
import { HttpExceptionFilter } from '../../src/common/filters/http-exception.filter';

// ── service tokens (used for DI provide: tokens) ──────────────────────────────
import { AuthService } from '../../src/auth/auth.service';
import { SchoolsService } from '../../src/schools/schools.service';
import { EducatorsService } from '../../src/educators/educators.service';
import { DashboardService } from '../../src/dashboard/dashboard.service';
import { ClassesService } from '../../src/class/classes.service';
import { StudentsService } from '../../src/students/students.service';
import { SimulationCatalogService } from '../../src/simulation-catalog/simulation-catalog.service';
import { EducatorSimulationsService } from '../../src/educator-simulations/educator-simulations.service';
import { InvitesService } from '../../src/invites/invites.service';
import { UsersService } from '../../src/users/users.service';
import { SimulationsService } from '../../src/simulations/simulations.service';
import { CsrfService } from '../../src/csrf/csrf.service';
import { AzureBlobService } from '../../src/config/azure-blob.config';
import { ClsService } from 'nestjs-cls';
import { LmsLookupService } from '../../src/lms/services/lms-lookup.service';
import { LmsConfigService } from '../../src/lms/services/lms-config.service';
import { LmsRosterService } from '../../src/lms/services/lms-roster.service';

// ── misc ──────────────────────────────────────────────────────────────────────
export const PORT_FILE = path.resolve(__dirname, '.server-port.json');
export const TEST_JWT_SECRET = 'pre-deploy-test-secret-key-2024';

/** Default pre-seeded admin — used by school/educator/etc. specs that run on a fresh server */
const PRESEEDED_ADMIN_EMAIL = 'preseeded-admin@predeployment.test';
const PRESEEDED_ADMIN_PASSWORD = 'NewPassword@123';
const EXECUTION_DATA_FILE = path.resolve(__dirname, 'test-data/execution-data.json');

declare global {
  var __PRE_DEPLOY_APP__: INestApplication | undefined;
}

// ── free port ─────────────────────────────────────────────────────────────────
function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address() as net.AddressInfo;
      srv.close(() => resolve(addr.port));
    });
    srv.on('error', reject);
  });
}

// ── no-op CSRF guard ──────────────────────────────────────────────────────────
class NoOpCsrfGuard implements CanActivate {
  canActivate() { return true; }
}

// ── in-memory data stores ─────────────────────────────────────────────────────
// NOTE: globalSetup runs outside Jest sandbox — no jest.fn() available.

const _users = new Map<string, { id: string; email: string; passwordHash: string; fullName: string; role: string }>();
const _verifiedTokenBlacklist = new Set<string>();
const _schools = new Map<string, { id: string; school_name: string; userId: string; status: string; is_active: boolean }>();
const _educators = new Map<string, { id: string; email: string; fullName: string; adminId: string; schoolId: string; status: string; is_active: boolean; passwordHash?: string }>();
const _classes = new Map<string, { id: string; class_name: string; educatorId: string; status: string }>();
const _students = new Map<string, { id: string; student_name: string; classId: string; status: string; student_id?: string }>();
const _invites = new Map<string, { id: string; email: string; full_name?: string; adminId: string; schoolId: string; status: string; expires_at: Date }>();
const _educatorLibrary = new Set<string>(); // "educatorId:scenarioId" pairs
const MOCK_SCENARIO_ID = 'mock-scenario-001';

function uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

// ── constants mirrored from auth.constants.ts ────────────────────────────────
const MOCK_OTP_PURPOSE = 'otp_verify';
const MOCK_RESET_PURPOSE = 'reset_password';
const MOCK_REDEEM_MASTER_CODE = 'RWMASTER20250617';

// ── mock AuthService ──────────────────────────────────────────────────────────
function buildMockAuthService() {
  return {
    signup: async (dto: any) => {
      // Educator invite-based registration
      if (dto.invite_id) {
        const invite = _invites.get(dto.invite_id);
        if (!invite) return { success: false, message: 'Invalid or expired invite', type: 'bad' };
        if (new Date() > invite.expires_at) return { success: false, message: 'Invite has expired', type: 'bad' };
        if (invite.email.toLowerCase() !== (dto.email ?? '').toLowerCase()) return { success: false, message: 'Email does not match invite', type: 'bad' };
        const educator = [..._educators.values()].find(e => e.email.toLowerCase() === invite.email.toLowerCase());
        if (!educator) return { success: false, message: 'Educator record not found', type: 'bad' };
        const passwordHash = await bcrypt.hash(dto.password, 10);
        educator.passwordHash = passwordHash;
        educator.status = 'ACTIVE';
        invite.status = 'ACCEPTED';
        // Register educator as a user so they can log in
        _users.set(educator.email, { id: educator.id, email: educator.email, passwordHash, fullName: dto.full_name ?? educator.fullName, role: 'Educator' });
        return { success: true, message: 'Educator registered successfully', data: { id: educator.id, email: educator.email, full_name: educator.fullName, status: 'ACTIVE' } };
      }
      if (_users.has(dto.email)) {
        return { success: false, message: 'User already exists', type: 'bad' };
      }
      const id = uuid();
      const passwordHash = await bcrypt.hash(dto.password, 10);
      _users.set(dto.email, { id, email: dto.email, passwordHash, fullName: dto.full_name ?? '', role: 'District Admin' });
      // Generate access_token exactly like the real auth service does
      const accessToken = jwtSign(
        { sub: id, email: dto.email, type: 'admin', roles: ['District Admin'], userId: id },
        TEST_JWT_SECRET,
        { expiresIn: '1d' } as any,
      );
      return {
        success: true,
        message: 'Admin registered successfully',
        data: { id, email: dto.email, full_name: dto.full_name ?? '', status: 'ACTIVE', is_license_active: false, subscriptions: [], access_token: accessToken },
      };
    },
    login: async (dto: any) => {
      const user = _users.get(dto.email);
      if (!user) return { success: false, message: 'invalid username or password', type: 'unauthorized' };
      const valid = await bcrypt.compare(dto.password ?? '', user.passwordHash);
      if (!valid) return { success: false, message: 'invalid username or password', type: 'unauthorized' };
      // _nonce: Date.now() ensures tokens issued within the same second are distinct,
      // preventing blacklist collisions when multiple tests call login in rapid succession.
      const accessToken = jwtSign(
        { sub: user.id, email: user.email, roles: [user.role], type: 'admin', userId: user.id, _nonce: Date.now() },
        TEST_JWT_SECRET,
        { expiresIn: '1d' } as any,
      );
      return {
        success: true,
        data: {
          tokens: { accessToken },
          userId: user.id,
          user_id: user.id,
          user: { id: user.id, email: user.email, full_name: user.fullName, status: 'active', role: user.role, is_license_active: true, subscriptions: [] },
        },
      };
    },
    logout: async () => ({ success: true, message: 'Logged out successfully' }),
    forgotPassword: async (dto: any) => {
      if (!_users.has(dto.email)) return { success: false, message: 'No account found with this email', type: 'notfound' };
      const reset_token = jwtSign(
        { email: dto.email, purpose: MOCK_OTP_PURPOSE, otp: '123456' },
        TEST_JWT_SECRET,
        { expiresIn: '5m' } as any,
      );
      return { success: true, message: 'OTP sent to your email', data: { reset_token } };
    },
    resendOtp: async (dto: any) => {
      // Validate the reset_token JWT (check signature, ignore expiration)
      let decoded: any;
      try {
        decoded = jwtVerify(dto.reset_token, TEST_JWT_SECRET, { ignoreExpiration: true } as any);
      } catch {
        return { success: false, message: 'Invalid reset token. Please verify your OTP first', type: 'bad' };
      }
      if (!decoded || decoded.purpose !== MOCK_OTP_PURPOSE) {
        return { success: false, message: 'Invalid reset token. Please verify your OTP first', type: 'bad' };
      }
      // Simulate always-on rate-limit (token was just issued)
      return { success: false, message: 'Please wait 5 minutes before requesting a new OTP (5 min remaining)', type: 'bad' };
    },
    verifyOtp: async (dto: any) => {
      let decoded: any;
      try {
        decoded = jwtVerify(dto.reset_token, TEST_JWT_SECRET);
      } catch {
        return { success: false, message: 'Invalid reset token. Please verify your OTP first', type: 'bad' };
      }
      if (!decoded || decoded.purpose !== MOCK_OTP_PURPOSE) {
        return { success: false, message: 'Invalid reset token. Please verify your OTP first', type: 'bad' };
      }
      if (!dto.otp || decoded.otp !== String(dto.otp).trim()) {
        return { success: false, message: 'Invalid or expired OTP', type: 'bad' };
      }
      const verified_token = jwtSign(
        { email: decoded.email, purpose: MOCK_RESET_PURPOSE },
        TEST_JWT_SECRET,
        { expiresIn: '15m' } as any,
      );
      return { success: true, message: 'OTP verified successfully', data: { verified_token } };
    },
    resetPassword: async (dto: any) => {
      let decoded: any;
      try {
        decoded = jwtVerify(dto.verified_token, TEST_JWT_SECRET);
      } catch {
        return { success: false, message: 'Invalid reset token. Please verify your OTP first', type: 'bad' };
      }
      if (!decoded || decoded.purpose !== MOCK_RESET_PURPOSE) {
        return { success: false, message: 'Invalid reset token. Please verify your OTP first', type: 'bad' };
      }
      if (_verifiedTokenBlacklist.has(dto.verified_token)) {
        return { success: false, message: 'Reset session expired. Please request a new OTP', type: 'bad' };
      }
      // Consume token (blacklist it)
      _verifiedTokenBlacklist.add(dto.verified_token);
      // Update password in the in-memory store
      for (const user of _users.values()) {
        if (user.email === decoded.email) {
          user.passwordHash = await bcrypt.hash(dto.new_password, 10);
          break;
        }
      }
      return { success: true, message: 'Password reset successfully' };
    },
    redeem: async (dto: any) => {
      const cleanCode = (dto.code ?? '').replace(/[^A-Z0-9]/gi, '').toUpperCase();
      if (!cleanCode) return { success: false, message: 'Invalid activation code', type: 'bad' };
      if (cleanCode === MOCK_REDEEM_MASTER_CODE) {
        return { success: true, message: 'License activated successfully', data: {} };
      }
      return { success: false, message: 'Invalid activation code', type: 'bad' };
    },
  };
}

// ── mock SchoolsService ───────────────────────────────────────────────────────
function buildMockSchoolsService() {
  return {
    // controller checks: user && user.status === 'ACTIVE' — must be uppercase
    findUserById: async (id: string) => {
      const u = [..._users.values()].find(u => u.id === id);
      return u ? { id: u.id, email: u.email, status: 'ACTIVE', role: { role_name: u.role } } : null;
    },
    findByCriteria: async (name: string, userId: string) => {
      return [..._schools.values()].find(s => s.school_name === name && s.userId === userId) ?? null;
    },
    create: async (userId: string, dto: any) => {
      const id = uuid();
      _schools.set(id, { id, school_name: dto.school_name, userId, status: 'ACTIVE', is_active: true });
      return { success: true, message: 'School created successfully', data: { id } };
    },
    // controller calls findAll(userId, status?)
    findAll: async (userId: string, status?: string) => {
      let list = [..._schools.values()].filter(s => s.userId === userId && s.is_active);
      if (status && status !== 'all') {
        const activeFilter = status === 'active';
        list = list.filter(s => s.is_active === activeFilter);
      }
      return { success: true, message: 'School(s) fetched successfully', data: list };
    },
    // controller calls findByIdAndOwner(id, userId)
    findByIdAndOwner: async (id: string, userId: string) => {
      const s = _schools.get(id);
      return (s && s.userId === userId) ? s : null;
    },
    // controller calls findOne(school) where school is the entity from findByIdAndOwner
    findOne: async (school: any) => {
      const s = _schools.get(school.id);
      return s
        ? { success: true, message: 'School(s) fetched successfully', data: s }
        : { success: false, message: 'School not found', type: 'notfound' };
    },
    // controller calls update(school, dto)
    update: async (school: any, dto: any) => {
      const s = _schools.get(school.id);
      if (!s) return { success: false, message: 'School not found', type: 'notfound' };
      if (dto.school_name) s.school_name = dto.school_name;
      if (dto.status) s.status = dto.status;
      return { success: true, message: 'School updated successfully', data: s };
    },
    // controller calls remove(school)
    remove: async (school: any) => {
      if (!_schools.has(school.id)) return { success: false, message: 'School not found', type: 'notfound' };
      _schools.delete(school.id);
      return { success: true, message: 'School deleted successfully' };
    },
    // controller calls findAll(adminId, status?) for GET /admin/:adminId — same method
    getAllSchools: async () => ({ success: true, message: 'School(s) fetched successfully', data: [..._schools.values()] }),
  };
}

// ── mock EducatorsService ─────────────────────────────────────────────────────
function buildMockEducatorsService() {
  return {
    onModuleInit: async () => {},
    // controller: findAll(req.user.userId)
    findAll: async (adminId: string) => ({ success: true, message: 'Educator(s) fetched successfully', data: [..._educators.values()].filter(e => e.adminId === adminId && e.is_active) }),
    // controller: findByIdAndOwner(id, req.user.userId)
    findByIdAndOwner: async (educatorId: string, adminId: string) => {
      const e = _educators.get(educatorId);
      return (e && e.adminId === adminId) ? e : null;
    },
    // controller: findSchoolByOwner(dto.school_id, req.user.userId)
    findSchoolByOwner: async (schoolId: string, adminId: string) => {
      const s = _schools.get(schoolId);
      return (s && s.userId === adminId) ? s : null;
    },
    // controller: findById(id) — returns ServiceResponse<Educator>
    findById: async (id: string) => {
      const e = _educators.get(id);
      if (!e) return null;
      return { success: true, message: 'Educator(s) fetched successfully', data: e };
    },
    // controller: findOne(educator)
    findOne: async (educator: any) => {
      const e = _educators.get(educator.id);
      return e
        ? { success: true, message: 'Educator(s) fetched successfully', data: e }
        : { success: false, message: 'Educator not found', type: 'notfound' };
    },
    // controller: update(educator, dto, targetSchool?)
    update: async (educator: any, dto: any, targetSchool?: any) => {
      const e = _educators.get(educator.id);
      if (!e) return { success: false, message: 'Educator not found', type: 'notfound' };
      if (dto.full_name) e.fullName = dto.full_name;
      if (dto.status) e.status = dto.status;
      if (targetSchool) e.schoolId = targetSchool.id;
      return { success: true, message: 'Educator updated successfully', data: e };
    },
    // controller: remove(educator)
    remove: async (educator: any) => {
      if (!_educators.has(educator.id)) return { success: false, message: 'Educator not found', type: 'notfound' };
      _educators.delete(educator.id);
      return { success: true, message: 'Educator deleted successfully' };
    },
    // controller: resendInvite(id, req.user.userId)
    resendInvite: async (educatorId: string, adminId: string) => {
      const e = _educators.get(educatorId);
      if (!e || e.adminId !== adminId) return { success: false, message: 'Educator not found', type: 'notfound' };
      return { success: true, message: 'Invite resent successfully' };
    },
    // controller: getProfile(req.user.userId)
    getProfile: async (userId: string) => {
      const e = [..._educators.values()].find(e => e.id === userId);
      return e
        ? { success: true, message: 'Profile fetched', data: e }
        : { success: false, message: 'Profile not found', type: 'notfound' };
    },
    // controller: updateProfile(userId, body, file?)
    updateProfile: async () => ({ success: true, message: 'Profile updated', data: {} }),
    // controller: removeProfilePicture(userId)
    removeProfilePicture: async () => ({ success: true, message: 'Profile picture removed', data: null }),
    availableTokens: async () => 0,
    updateToken: async () => {},
    generateSasUrl: async (url: string) => url,
    isConfigured: () => false,
  };
}

// ── mock DashboardService ─────────────────────────────────────────────────────
function buildMockDashboardService() {
  return {
    getOverview: async (adminId: string) => {
      const schools = [..._schools.values()].filter(s => s.userId === adminId && s.is_active);
      const educators = [..._educators.values()].filter(e => e.adminId === adminId && e.is_active);
      const classes = [..._classes.values()].filter(c => {
        // classes owned by educators owned by this admin
        const ed = [..._educators.values()].find(e => e.id === c.educatorId);
        return ed && ed.adminId === adminId;
      });
      const students = [..._students.values()].filter(s => {
        const cls = _classes.get(s.classId);
        if (!cls) return false;
        const ed = [..._educators.values()].find(e => e.id === cls.educatorId);
        return ed && ed.adminId === adminId;
      });
      return {
        schools: { total: schools.length, data: schools },
        educators: { total: educators.length, data: educators },
        classes: { total: classes.length, data: classes },
        students: { total: students.length, data: students },
        classSimulations: { total: 0, data: [] },
      };
    },
  };
}

// ── mock ClassesService ───────────────────────────────────────────────────────
function buildMockClassesService() {
  return {
    onModuleInit: async () => {},
    // controller: findEducatorById(req.user.userId)
    findEducatorById: async (id: string) => {
      const e = [..._educators.values()].find(e => e.id === id && e.is_active);
      return e ? { id: e.id, email: e.email, school: { id: e.schoolId } } : null;
    },
    // controller: findByCriteria(name, term, year, educatorId)
    findByCriteria: async (name: string, term: any, year: any, educatorId: string) => {
      return [..._classes.values()].find(c => c.class_name === name && c.educatorId === educatorId) ?? null;
    },
    // controller: create(dto, educator, students[])
    create: async (dto: any, educator: any) => {
      const id = uuid();
      const educatorId = typeof educator === 'string' ? educator : educator?.id ?? '';
      _classes.set(id, { id, class_name: dto.class_name, educatorId, status: 'ACTIVE' });
      return { success: true, message: 'Class created successfully', data: { id, class_name: dto.class_name } };
    },
    // controller: findAll(req.user.userId)
    findAll: async (educatorId: string) => ({ success: true, message: 'Class(es) fetched successfully', data: [..._classes.values()].filter(c => c.educatorId === educatorId) }),
    // controller: findOne(id, educatorId)
    findOne: async (id: string, educatorId: string) => {
      const c = _classes.get(id);
      if (!c || c.educatorId !== educatorId) return { success: false, message: 'Class not found', type: 'notfound' };
      return { success: true, message: 'Class(es) fetched successfully', data: c };
    },
    // controller: findClassByIdWithEducator(id, educatorId)
    findClassByIdWithEducator: async (id: string, educatorId: string) => {
      const c = _classes.get(id);
      return (c && c.educatorId === educatorId) ? c : null;
    },
    // controller: update(classEntity, dto)
    update: async (classEntity: any, dto: any) => {
      const c = _classes.get(classEntity.id);
      if (!c) return { success: false, message: 'Class not found', type: 'notfound' };
      if (dto.class_name) c.class_name = dto.class_name;
      if (dto.status) c.status = dto.status;
      return { success: true, message: 'Class updated successfully', data: c };
    },
    // controller: remove(id)
    remove: async (id: string) => {
      _classes.delete(id);
      return { success: true, message: 'Class deleted successfully' };
    },
    countStudentsByClassId: async () => 0,
  };
}

// ── mock StudentsService ──────────────────────────────────────────────────────
function buildMockStudentsService() {
  return {
    findClassById: async (classId: string) => _classes.get(classId) ?? null,
    findEducatorById: async (id: string) => {
      const e = [..._educators.values()].find(e => e.id === id && e.is_active);
      return e ? { id: e.id, email: e.email, role: { role_name: 'Educator' } } : null;
    },
    findAnyUserByEmail: async (email: string) => {
      const u = _users.get(email);
      if (u) return u;
      return [..._educators.values()].find(e => e.email === email) ?? null;
    },
    create: async (dto: any, classData: any) => {
      const id = uuid();
      const status = dto.status ?? 'ACTIVE';
      _students.set(id, { id, student_name: dto.full_name ?? dto.student_name ?? 'Test Student', classId: classData?.id ?? '', status, student_id: dto.student_id });
      return { success: true, message: 'Student added successfully', data: { id, status, student_id: dto.student_id, student_code: 'TEST-CODE' } };
    },
    findAll: async () => ({ success: true, message: 'Student(s) fetched successfully', data: [..._students.values()] }),
    findByClass: async (classId: string) => {
      const list = [..._students.values()].filter(s => s.classId === classId);
      return { success: true, message: 'Student(s) fetched successfully', data: list };
    },
    findOne: async (id: string) => {
      const s = _students.get(id);
      return s
        ? { success: true, message: 'Student(s) fetched successfully', data: s }
        : { success: false, message: 'Student not found', type: 'notfound' };
    },
    findById: async (id: string) => _students.get(id) ?? null,
    update: async (student: any, dto: any) => {
      const s = _students.get(student.id);
      if (!s) return { success: false, message: 'Student not found', type: 'notfound' };
      if (dto.full_name) s.student_name = dto.full_name;
      return { success: true, message: 'Student updated successfully', data: s };
    },
    remove: async (student: any) => {
      _students.delete(student.id);
      return { success: true, message: 'Student deleted successfully' };
    },
    sendBatchEmail: async () => ({ success: true, message: 'Emails sent' }),
    sendEmailReport: async () => ({ success: true, message: 'Report sent' }),
    updateStudentCode: async (student: any) => ({ success: true, message: 'Student ID generated successfully', data: student }),
    revokeCode: async (student: any) => ({ success: true, message: 'Code revoked', data: student }),
    regenerateCode: async (student: any) => ({ success: true, message: 'Code regenerated', data: student }),
    getEmailReport: async () => ({ success: true, message: 'Report fetched', data: [] }),
    lookupByCode: async () => ({ success: false, message: 'Invalid code', type: 'unauthorized' }),
    studentLogin: async (studentId: string) => {
      if (studentId === 'MOCK-STUDENT-001') {
        const accessToken = jwtSign(
          { sub: 'MOCK-STUDENT-001', user_id: 'mock-student-uuid', student_id: 'MOCK-STUDENT-001', email: 'mockstudent@test.com', type: 'student', roles: ['Student'] },
          TEST_JWT_SECRET,
          { expiresIn: '1d' } as any,
        );
        return {
          success: true,
          message: 'Student login successful',
          data: {
            id: 'mock-student-uuid',
            student_id: 'MOCK-STUDENT-001',
            student_name: 'Mock Student',
            email: 'mockstudent@test.com',
            status: 'ACTIVE',
            class_id: 'mock-class-id',
            class_name: 'Mock Class',
            type: 'student',
            access_token: accessToken,
            token_type: 'Bearer',
          },
        };
      }
      return { success: false, message: 'No student account found with the provided student ID. Please check and try again.', type: 'notfound' };
    },
    startAssessment: async () => ({ success: true, message: 'Assessment started', data: {} }),
    getSimulationsByCode: async (studentCode: string) => {
      if (!studentCode || studentCode.length > 50) {
        return { success: false, message: 'Invalid student code', type: 'badrequest' };
      }
      if (studentCode === 'MOCK-STUDENT-001') {
        return {
          success: true,
          message: 'Simulations fetched',
          data: {
            simulations: [{ id: MOCK_SCENARIO_ID, title: 'Mock Scenario', modes: ['Assessment'] }],
            reports: [],
          },
        };
      }
      return { success: true, message: 'Simulations fetched', data: { simulations: [], reports: [] } };
    },
  };
}

// ── mock SimulationCatalogService ─────────────────────────────────────────────
function buildMockSimulationCatalogService() {
  return {
    getCatalog: async () => ({ success: true, message: 'Simulation catalog fetched successfully', data: [] }),
    getCatalogFromBlob: async () => ({
      success: true,
      message: 'Simulation catalog dashboard fetched successfully',
      data: { sections: [{ items: [{ id: MOCK_SCENARIO_ID, title: 'Mock Scenario', description: '' }] }] },
    }),
    getByScenarioId: async (id: string) => {
      if (id === MOCK_SCENARIO_ID) {
        return { success: true, message: 'Simulation detail fetched successfully', data: { id: MOCK_SCENARIO_ID, title: 'Mock Scenario' } };
      }
      return { success: false, message: 'Scenario not found', type: 'notfound' };
    },
    getAdminReport: async () => ({ success: true, message: 'Admin report fetched successfully', data: {} }),
    getAllScenarios: async () => ({ success: true, message: 'Simulation catalog fetched successfully', data: [] }),
    getStatusSummary: async () => ({ success: true, message: 'Summary fetched', data: {} }),
    getSimulationsByUnitId: async () => ({ success: true, message: 'Simulations fetched', data: [] }),
    getPublicBlobScenario: async () => ({ success: true, message: 'Scenario fetched', data: null }),
    remove: async () => ({ success: true, message: 'Deleted' }),
    getScenario: async () => ({ success: true, message: 'Scenario fetched', data: null }),
    getScenarioPublic: async () => ({ success: true, message: 'Scenario fetched', data: null }),
    getScenariosByCategory: async () => ({ success: true, message: 'Scenarios fetched', data: [] }),
    deleteCatalogEntry: async () => ({ success: true, message: 'Deleted' }),
  };
}

// ── mock EducatorSimulationsService ───────────────────────────────────────────
function buildMockEducatorSimulationsService() {
  return {
    addToLibrary: async (scenarioId: string, educatorId: string) => {
      // Treat any non-MOCK_SCENARIO_ID as not found
      if (scenarioId !== MOCK_SCENARIO_ID) {
        return { success: false, message: 'Simulation not found in library', type: 'notfound' };
      }
      const key = `${educatorId}:${scenarioId}`;
      if (_educatorLibrary.has(key)) {
        return { success: false, message: 'Simulation already exists in library', type: 'badrequest' };
      }
      _educatorLibrary.add(key);
      return { success: true, message: 'Simulation added to library successfully', data: { scenarioId } };
    },
    removeFromLibrary: async (scenarioId: string, educatorId: string) => {
      const key = `${educatorId}:${scenarioId}`;
      _educatorLibrary.delete(key);
      return { success: true, message: 'Simulation removed from library successfully' };
    },
    getMyLibrary: async () => ({ success: true, message: 'Library fetched', data: [] }),
  };
}

// ── mock InvitesService ───────────────────────────────────────────────────────
function buildMockInvitesService() {
  return {
    // controller: findCreatorById(req.user.userId)
    findCreatorById: async (id: string) => {
      const u = [..._users.values()].find(u => u.id === id);
      return u ? { id: u.id, email: u.email, full_name: u.fullName, status: 'ACTIVE', subscriptions: [], role: { role_name: u.role } } : null;
    },
    // controller: findSchoolByOwner(dto.school_id, creatorId)
    findSchoolByOwner: async (schoolId: string, ownerId: string) => {
      const s = _schools.get(schoolId);
      return (s && s.userId === ownerId) ? s : null;
    },
    // controller: findEducatorByEmail(dto.email)
    findEducatorByEmail: async (email: string) => {
      return [..._educators.values()].find(e => e.email === email) ?? null;
    },
    // controller: findPendingInviteByEmail(dto.email)
    findPendingInviteByEmail: async (email: string) => {
      return [..._invites.values()].find(i => i.email === email && i.status === 'PENDING') ?? null;
    },
    // controller: findRoleByName('Educator')
    findRoleByName: async (name: string) => ({ id: uuid(), role_name: name }),
    // controller: findInviteById(dto.invite_id)
    findInviteById: async (id: string) => _invites.get(id) ?? null,
    // controller: createInvite(dto, creator, school, educatorRole, existingEducator)
    createInvite: async (dto: any, creator: any, school: any, educatorRole: any, existingEducator: any) => {
      const inviteId = uuid();
      const educatorId = existingEducator?.id ?? uuid();
      const expires_at = new Date(Date.now() + 30 * 60000);
      _invites.set(inviteId, { id: inviteId, email: dto.email, full_name: dto.full_name, adminId: creator.id, schoolId: school.id, status: 'PENDING', expires_at });
      _educators.set(educatorId, { id: educatorId, email: dto.email, fullName: dto.full_name ?? '', adminId: creator.id, schoolId: school.id, status: 'PENDING', is_active: true });
      const message = dto.status === 'INACTIVE' ? 'Educator created successfully' : 'Invite sent successfully';
      return { success: true, message, data: { invite: { id: inviteId, school: { id: school.id } }, educator: { id: educatorId, email: dto.email } } };
    },
    // controller: verifyInvite(invite)
    verifyInvite: async (invite: any) => {
      return { success: true, message: 'Valid invite', data: invite };
    },
    // controller: getInviteDetails(invite)
    getInviteDetails: async (invite: any) => {
      return { success: true, message: 'Invite details fetched', data: { email: invite.email, full_name: invite.full_name ?? '' } };
    },
    acceptInvite: async (invite: any) => {
      if (_invites.has(invite.id)) {
        const inv = _invites.get(invite.id)!;
        inv.status = 'ACCEPTED';
      }
      return invite;
    },
    onModuleInit: async () => {},
  };
}

// ── mock UsersService ─────────────────────────────────────────────────────────
function buildMockUsersService() {
  return {
    // controller: findAll()
    findAll: async () => {
      const users = [..._users.values()].map(u => ({ id: u.id, email: u.email, full_name: u.fullName, status: 'ACTIVE', role: { role_name: u.role } }));
      return { success: true, message: 'Users fetched', data: users };
    },
    // auth service + invites controller
    findByEmail: async (email: string) => {
      const u = _users.get(email);
      return u ? { id: u.id, email: u.email, full_name: u.fullName, status: 'ACTIVE', role: { role_name: u.role }, is_license_active: true, subscriptions: [] } : null;
    },
    // controller: findById(id) — returns ServiceResponse<User>
    findById: async (id: string) => {
      const u = [..._users.values()].find(u => u.id === id);
      if (!u) return { success: false, message: 'User not found', type: 'notfound' };
      return { success: true, message: 'User fetched', data: { id: u.id, email: u.email, full_name: u.fullName, status: 'ACTIVE', role: { role_name: u.role } } };
    },
    // auth service calls createUser to register admin
    createUser: async (dto: any) => {
      const id = uuid();
      const passwordHash = dto.password ?? '';
      _users.set(dto.email, { id, email: dto.email, passwordHash, fullName: dto.full_name ?? '', role: 'District Admin' });
      return { id, email: dto.email, full_name: dto.full_name, status: dto.status, is_license_active: false, subscriptions: [], role: { role_name: 'District Admin' } };
    },
    save: async (u: any) => u,
    updateByEmail: async () => null,
    // controller: changePassword
    changePassword: async () => ({ success: true, message: 'Password changed successfully' }),
    // controller: updateProfile
    updateProfile: async () => ({ success: true, message: 'Profile updated successfully', data: {} }),
    // controller: getProfilePicture
    getProfilePicture: async () => null,
    // controller: removeProfilePhoto
    removeProfilePhoto: async () => ({ success: true, message: 'Profile photo removed', data: null }),
    findBySubscriptionCode: async () => null,
  };
}

// ── mock SimulationsService ───────────────────────────────────────────────────
function buildMockSimulationsService() {
  return {
    getAll: async () => ({ success: true, message: 'Simulations fetched', data: [] }),
    getById: async () => ({ success: true, message: 'Simulation fetched', data: null }),
    getUnitById: async () => ({ success: true, message: 'Unit fetched', data: null }),
  };
}

// ── global setup entry point ───────────────────────────────────────────────────
export default async function globalSetup(): Promise<void> {
  console.log('\n[GlobalSetup] Bootstrapping NestJS in-process test server (all services mocked)...');

  // ── Determine which admin email to pre-seed ──────────────────────────────
  // When the module-executor runs subsequent specs (school, educator, etc.)
  // each gets a fresh in-memory server. We read the testUserEmail saved by the
  // auth spec into execution-data.json and pre-seed that user with the
  // expected password so later specs can authenticate against this fresh server.
  //
  // We always pre-seed BOTH the static default AND any dynamic email saved in
  // execution-data.json (they may differ when the auth spec ran first in the
  // module executor and saved a dynamic email).
  const emailsToPreseed = new Set<string>([PRESEEDED_ADMIN_EMAIL]);

  try {
    if (fs.existsSync(EXECUTION_DATA_FILE)) {
      const execData = JSON.parse(fs.readFileSync(EXECUTION_DATA_FILE, 'utf-8')) as { auth?: { testUserEmail?: string } };
      const saved = execData.auth?.testUserEmail;
      if (saved) {
        emailsToPreseed.add(saved);
        console.log(`[GlobalSetup] Also pre-seeding testUserEmail from execution-data: ${saved}`);
      }
    }
  } catch { /* ignore */ }

  console.log(`[GlobalSetup] Pre-seeding emails: ${[...emailsToPreseed].join(', ')}`);

  // Also ensure execution-data.json always has at least the static default so
  // specs that run in isolation (without the module executor) find a valid email.
  try {
    const dir = path.dirname(EXECUTION_DATA_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const base = fs.existsSync(EXECUTION_DATA_FILE)
      ? JSON.parse(fs.readFileSync(EXECUTION_DATA_FILE, 'utf-8'))
      : {};
    if (!base.auth?.testUserEmail) {
      base.auth = { ...(base.auth ?? {}), testUserEmail: PRESEEDED_ADMIN_EMAIL };
      fs.writeFileSync(EXECUTION_DATA_FILE, JSON.stringify(base, null, 2), 'utf-8');
    }
  } catch { /* ignore */ }

  // Pre-populate _users with all relevant admin accounts.
  const preseedHash = await bcrypt.hash(PRESEEDED_ADMIN_PASSWORD, 10);
  for (const email of emailsToPreseed) {
    _users.set(email, { id: uuid(), email, passwordHash: preseedHash, fullName: 'Pre-Seeded Admin', role: 'District Admin' });
  }

  // Pre-seed educator from registerApi.json so class/student/simulation specs
  // can log in as educator even when running after a fresh globalSetup.
  const REGISTER_API_FILE = path.resolve(__dirname, 'test-data/registerApi.json');
  try {
    if (fs.existsSync(REGISTER_API_FILE)) {
      const regData = JSON.parse(fs.readFileSync(REGISTER_API_FILE, 'utf-8')) as {
        educatorcreate?: { email?: string; password?: string; firstName?: string };
        adminUser?: { email?: string; password?: string; full_name?: string };
        adminUser2?: { email?: string; password?: string; full_name?: string };
        loginUser?: { email?: string; password?: string };
      };
      const edEmail = regData.educatorcreate?.email;
      const edPassword = regData.educatorcreate?.password ?? 'Test@123';
      if (edEmail && !_users.has(edEmail)) {
        const edHash = await bcrypt.hash(edPassword, 10);
        const edId = uuid();
        _users.set(edEmail, { id: edId, email: edEmail, passwordHash: edHash, fullName: regData.educatorcreate?.firstName ?? 'Educator', role: 'Educator' });
        // Also seed a matching educator record so findEducatorById works in ClassesController
        _educators.set(edId, { id: edId, email: edEmail, fullName: regData.educatorcreate?.firstName ?? 'Educator', adminId: [..._users.values()].find(u => u.role === 'District Admin')?.id ?? '', schoolId: '', status: 'ACTIVE', is_active: true });
        console.log(`[GlobalSetup] Pre-seeded educator from registerApi.json: ${edEmail}`);
      }
      // Pre-seed admin users so delete spec can login with loginUser/adminUser credentials
      for (const adminKey of ['adminUser', 'adminUser2', 'loginUser'] as const) {
        const adminEntry = regData[adminKey];
        const aEmail = adminEntry?.email;
        const aPassword = adminEntry?.password ?? 'Test@123';
        if (aEmail && !_users.has(aEmail)) {
          const aHash = await bcrypt.hash(aPassword, 10);
          _users.set(aEmail, { id: uuid(), email: aEmail, passwordHash: aHash, fullName: (adminEntry as any)?.full_name ?? 'Admin', role: 'District Admin' });
        }
      }
    }
  } catch { /* ignore */ }

  const port = await getFreePort();

  const mockCsrfService = {
    generateToken: () => 'mock-csrf-token-pre-deploy',
    storeToken: () => Promise.resolve(),
    validateToken: () => Promise.resolve(true),
    revokeToken: () => Promise.resolve(),
  };

  const mockClsService = {
    set: () => {},
    get: () => undefined,
    run: (cb: () => unknown) => cb(),
  };

  const moduleRef: TestingModule = await Test.createTestingModule({
    imports: [
      PassportModule.register({ defaultStrategy: 'jwt' }),
      JwtModule.register({
        secret: TEST_JWT_SECRET,
        signOptions: { expiresIn: '1d' },
      }),
    ],

    controllers: [
      AppController,
      AuthController,
      SchoolsController,
      EducatorsController,
      DashboardController,
      ClassesController,
      StudentsController,
      SimulationCatalogController,
      EducatorSimulationsController,
      InvitesController,
      UsersController,
      SimulationsController,
    ],

    providers: [
      AppService,
      TokenBlacklistService,
      JwtStrategy,
      JwtAuthGuard,
      Reflector,

      {
        provide: ConfigService,
        useValue: {
          get: (key: string) => {
            if (key === 'JWT_SECRET') return TEST_JWT_SECRET;
            if (key === 'JWT_EXPIRES_IN') return '1d';
            if (key === 'FRONTEND_URL') return 'http://localhost:3001';
            return process.env[key] ?? null;
          },
          getOrThrow: (key: string) => {
            if (key === 'JWT_SECRET') return TEST_JWT_SECRET;
            throw new Error(`[MockConfig] ${key} not configured`);
          },
        },
      },

      { provide: EducatorSessionService, useValue: { isTokenInvalidated: () => Promise.resolve(false), invalidateBySchool: () => Promise.resolve([]) } },
      { provide: ClsService, useValue: mockClsService },
      { provide: CsrfService, useValue: mockCsrfService },
      { provide: AzureBlobService, useValue: { uploadFile: () => Promise.resolve(''), deleteFile: () => Promise.resolve(), generateSasUrl: (u: string) => Promise.resolve(u), isConfigured: () => false } },

      { provide: AuthService, useValue: buildMockAuthService() },
      { provide: SchoolsService, useValue: buildMockSchoolsService() },
      { provide: EducatorsService, useValue: buildMockEducatorsService() },
      { provide: DashboardService, useValue: buildMockDashboardService() },
      { provide: ClassesService, useValue: buildMockClassesService() },
      { provide: StudentsService, useValue: buildMockStudentsService() },
      { provide: SimulationCatalogService, useValue: buildMockSimulationCatalogService() },
      { provide: EducatorSimulationsService, useValue: buildMockEducatorSimulationsService() },
      { provide: InvitesService, useValue: buildMockInvitesService() },
      { provide: UsersService, useValue: buildMockUsersService() },
      { provide: SimulationsService, useValue: buildMockSimulationsService() },
      { provide: LmsConfigService, useValue: {
        upsertConfig: async () => null,
        findSchoolbyIssuer: async () => null,
        findByIssuer: async () => null,
        findByClientId: async () => null,
        findSchoolByClientId: async () => null,
        getBySchoolId: async () => null,
        getOptionalBySchoolId: async () => null,
      }},
      { provide: LmsRosterService, useValue: {
        fetchRoster: async () => ({ members: [] }),
        fetchRosterWithWsFallback: async () => ({ members: [] }),
      }},
      { provide: LmsLookupService, useValue: {
        lookupStudentProfile: async () => null,
        findStudentCodeByLmsUserId: async () => null,
        findStudentByConstructedCode: async () => null,
        findStudentCodeByLmsClassAndUserId: async () => null,
        findStudentCodeByLmsUserIdInSchool: async () => null,
        findStudentCodeByLmsUserIdGlobally: async () => null,
        ensureMappedStudentAccount: async () => null,
      }},

      { provide: APP_GUARD, useClass: NoOpCsrfGuard },
    ],
  }).compile();

  const app: INestApplication = moduleRef.createNestApplication();

  app.use(cookieParser());
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());

  await app.listen(port, '127.0.0.1');

  const jwtService = moduleRef.get(JwtService);
  const testToken = jwtService.sign({
    sub: 'pre-deploy-admin-id',
    email: 'admin@predeployment.test',
    roles: ['District Admin'],
    type: 'admin',
    userId: 'pre-deploy-admin-id',
  });

  fs.writeFileSync(
    PORT_FILE,
    JSON.stringify({ port, baseURL: `http://127.0.0.1:${port}/api`, testToken }),
    'utf-8',
  );

  global.__PRE_DEPLOY_APP__ = app;

  console.log(`[GlobalSetup] Test server running at http://127.0.0.1:${port}/api`);
  console.log(`[GlobalSetup] Port file: ${PORT_FILE}`);
}
