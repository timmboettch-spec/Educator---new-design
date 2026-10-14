/**
 * smoke-state.ts
 * Shared state bag for the pre-deployment smoke suite.
 * Holds entity IDs and tokens created during test execution so later
 * tests (and cleanup) can reference them without re-querying.
 */

import { testEmail } from '../utils/env';

interface SmokeState {
  adminEmail: string;
  adminPassword: string;
  accessToken: string;
  adminId: string;
  schoolId: string;
  educatorId: string;
  educatorEmail: string;
  educatorPassword: string;
  educatorToken: string;
  inviteId: string;
  classId: string;
  studentId: string;
  scenarioId: string;
  /** Token for a brand-new admin with no data — used to verify the empty dashboard state. */
  freshAdminToken: string;
}

const state: SmokeState = {
  adminEmail: testEmail('smoke-admin'),
  adminPassword: 'SmokeAdmin@123',
  accessToken: '',
  adminId: '',
  schoolId: '',
  educatorId: '',
  educatorEmail: '',
  educatorPassword: 'SmokeEducator@123',
  educatorToken: '',
  inviteId: '',
  classId: '',
  studentId: '',
  scenarioId: 'mock-scenario-001',
  freshAdminToken: '',
};

export const smokeState = state;
