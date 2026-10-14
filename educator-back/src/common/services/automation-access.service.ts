import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClsService } from 'nestjs-cls';
import { isAutomationOnlyRecord, isSameEmail } from '../utils/automation-access.util';
import { ClsUser } from '../interfaces';

/**
 * Single, reusable enforcement point for the automation-only unit/simulation
 * (AUTO-UNIT-001 / "Pressure Injury Prevention Assessment") restriction.
 * Every data-access path that reads scenarios/units must filter through this
 * service — never duplicate the tester-email comparison inline elsewhere.
 *
 * The tester email is never hardcoded: it comes from `AUTOMATION_TESTER_EMAIL`
 * via the project's `registerAs('automation', ...)` config pattern.
 */
@Injectable()
export class AutomationAccessService {
  constructor(
    private readonly configService: ConfigService,
    private readonly cls: ClsService,
  ) {}

  private getTesterEmail(): string {
    return this.configService.get<string>('automation.testerEmail') ?? '';
  }

  /** Email of the currently authenticated request user, if any (set by JwtStrategy via CLS). */
  getCurrentUserEmail(): string | undefined {
    if (!this.cls.isActive()) return undefined;
    return this.cls.get<ClsUser>('user')?.email;
  }

  /**
   * Login/user id of the currently authenticated request, if any. For student
   * tokens this is the student's login code (JWT `sub`) — populated in CLS by
   * `AutomationUserContextMiddleware` even on student-backend routes, which
   * don't run the root `JwtStrategy`.
   */
  getCurrentUserId(): string | undefined {
    if (!this.cls.isActive()) return undefined;
    return this.cls.get<ClsUser>('user')?.userId;
  }

  /** Case-insensitive comparison against the configured tester email. */
  isTesterEmail(email?: string | null): boolean {
    const testerEmail = this.getTesterEmail();
    if (!testerEmail) return false;
    return isSameEmail(email, testerEmail);
  }

  /** Whether the current request belongs to the automation tester account (any role). */
  isCurrentUserTester(): boolean {
    return this.isTesterEmail(this.getCurrentUserEmail());
  }

  /** Whether `code` is one of the tester's dedicated automation student login codes. */
  isAutomationStudentCode(code?: string | null): boolean {
    if (!code) return false;
    const codes = this.configService.get<string[]>('automation.studentCodes') ?? [];
    return codes.includes(code.trim().toUpperCase());
  }

  /** Whether the current request's authenticated login id is a whitelisted automation student code. */
  isCurrentUserAutomationStudent(): boolean {
    return this.isAutomationStudentCode(this.getCurrentUserId());
  }

  /** Whether a scenario/unit record may be shown to the current request's user. */
  canAccessRecord(record: object | null | undefined, studentCode?: string | null): boolean {
    if (!isAutomationOnlyRecord(record as Record<string, unknown> | null | undefined)) return true;
    return (
      this.isCurrentUserTester() ||
      this.isCurrentUserAutomationStudent() ||
      this.isAutomationStudentCode(studentCode)
    );
  }

  /** Removes the automation-only unit/simulation from a list for non-tester users. */
  filterRecords<T extends object>(records: T[], studentCode?: string | null): T[] {
    if (
      this.isCurrentUserTester() ||
      this.isCurrentUserAutomationStudent() ||
      this.isAutomationStudentCode(studentCode)
    ) {
      return records;
    }
    return records.filter((record) => !isAutomationOnlyRecord(record as Record<string, unknown>));
  }

  /** Applies the restriction to a single-record lookup, returning null instead of exposing it. */
  filterRecord<T extends object>(record: T | null | undefined): T | null {
    if (!record) return null;
    return this.canAccessRecord(record) ? record : null;
  }
}
