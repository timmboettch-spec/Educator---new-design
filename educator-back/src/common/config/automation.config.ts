import { registerAs } from '@nestjs/config';

export default registerAs('automation', () => ({
  // Email of the account allowed to see/launch the automation-only unit
  // (AUTO-UNIT-001) and simulation ("Pressure Injury Prevention Assessment").
  // See AutomationAccessService.
  testerEmail: process.env.AUTOMATION_TESTER_EMAIL || '',
  // Student login codes for the tester's dedicated automation student accounts
  // (one per environment) — these always see the automation-only simulation as
  // assigned, since it has no real class assignment row to check against.
  studentCodes: [
    process.env.STUDENT_CODE_DEV || 'AUT-JXXD',
    process.env.STUDENT_CODE_QA || 'AUT-DGVQ',
    process.env.STUDENT_CODE_PROD || 'AUT-WUJM',
  ]
    .map((code) => code.trim().toUpperCase())
    .filter(Boolean),
}));
