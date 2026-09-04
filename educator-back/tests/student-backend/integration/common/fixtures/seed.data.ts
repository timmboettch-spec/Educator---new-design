/** Seed data used across integration test suites */

export const seedUsers = [
  {
    id: 'seed-user-1',
    username: 'student1',
    email: 'student1@test.com',
    role: 'student',
  },
  {
    id: 'seed-admin-1',
    username: 'admin1',
    email: 'admin1@test.com',
    role: 'admin',
  },
];

export const seedUnits = [
  { id: 'seed-unit-1', name: 'Emergency Nursing', categories: ['Nursing'] },
  { id: 'seed-unit-2', name: 'Cardiac Assessment', categories: ['Cardiology'] },
];

export const seedScenarios = [
  {
    id: 'seed-scenario-1',
    title: 'Chest Pain Assessment',
    unitId: 'seed-unit-1',
    expectedActions: [],
  },
];
