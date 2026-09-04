import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';

import { ScenarioAssignmentService } from '../scenario-assignment.service';

import type { Request } from 'express';

/**
 * Shape of the authenticated principal placed on `req.user` by the
 * `educator-jwt` Passport strategy after the student JWT is verified.
 */
interface StudentPrincipal {
  type?: string;
  sub?: string;
  studentId?: string;
  student_id?: string;
}

/**
 * Guard that enforces "student may only launch a scenario that was
 * assigned to them by the educator" at the backend authorization layer.
 *
 * Assumptions / order-of-operations:
 *   1. `ScenarioAuthGuard` must run FIRST (per `@UseGuards` order in the
 *      controller). It performs JWT verification and populates `req.user`.
 *   2. If the caller is a local (admin/instructor) principal — i.e. the
 *      request was authenticated by the local `jwt` Passport strategy and
 *      therefore has no `type === 'student'` marker — this guard is a
 *      no-op. Admins retain their existing access.
 *   3. For student principals, this guard resolves the requested
 *      `scenarioId` from the route params or request body and calls the
 *      Educator API (via {@link ScenarioAssignmentService}) as the source
 *      of truth. Requests for scenarios that are NOT in the returned
 *      assignment set are rejected with `403 Forbidden`.
 *
 * Local assignment data (`json-data.service`) is intentionally NOT
 * consulted; only the Educator API result may authorize a launch.
 */
@Injectable()
export class ScenarioAssignmentGuard implements CanActivate {
  private static readonly logger = new Logger(ScenarioAssignmentGuard.name);

  constructor(private readonly assignmentService: ScenarioAssignmentService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const user = req.user as Record<string, unknown>;

    // No `req.user` means `ScenarioAuthGuard` did not run first (or the
    // upstream JWT validation failed). Fail closed rather than silently
    // allowing the request through.
    if (!user) {
      throw new UnauthorizedException();
    }

    // Only student-typed principals need assignment validation.
    // Local admin/instructor tokens (validated by the local `jwt`
    // strategy) do not carry `type === 'student'` and are allowed through.
    if (user.type !== 'student') {
      return true;
    }

    const scenarioId = ScenarioAssignmentGuard.extractScenarioId(req);
    // No scenario id in the request path/body → nothing to authorize
    // against (e.g. list endpoints). Let the handler decide what to do.
    if (!scenarioId) {
      return true;
    }

    // Prefer the human-readable student code (`student_id` / `studentId`)
    // over `sub`. The Educator API `/students/simulations/:studentCode`
    // expects the student code (e.g. `REP-PH9N`), whereas `sub` is the
    // internal UUID and will result in "Invalid student code".
    const studentId = (user.student_id ?? user.studentId ?? user.sub ?? undefined) as string;
    if (!studentId) {
      ScenarioAssignmentGuard.logger.warn(
        'Student JWT is missing student_id / studentId / sub — denying scenario launch',
      );
      throw new ForbiddenException('Scenario not assigned to this student');
    }

    const bearerToken = ScenarioAssignmentGuard.extractBearerToken(req);
    if (!bearerToken) {
      throw new UnauthorizedException();
    }

    const allowed = await this.assignmentService.isScenarioAssigned(
      studentId,
      scenarioId,
      bearerToken,
    );

    if (!allowed) {
      ScenarioAssignmentGuard.logger.warn(
        `Denying scenario launch — student=${studentId} attempted scenarioId=${scenarioId} which is not in the Educator-reported assignment set`,
      );
      throw new ForbiddenException('Scenario not assigned to this student');
    }

    return true;
  }

  /**
   * Reads the scenario id from the route params or body. Route params
   * covered: `id`, `scenarioId`. Body fields covered: `id`, `scenarioId`.
   * Returns `undefined` when nothing meaningful is present.
   */
  private static extractScenarioId(req: Request): string | undefined {
    const params = (req.params ?? {}) as Record<string, unknown>;
    const body = (req.body ?? {}) as Record<string, unknown>;

    const candidates: unknown[] = [params.id, params.scenarioId, body.id, body.scenarioId];

    for (const c of candidates) {
      if (typeof c === 'string' && c.trim().length > 0) {
        return c.trim();
      }
      if (typeof c === 'number' && Number.isFinite(c)) {
        return String(c);
      }
    }
    return undefined;
  }

  private static extractBearerToken(req: Request): string | undefined {
    const header = req.headers?.authorization;
    if (typeof header !== 'string' || header.length === 0) {
      return undefined;
    }
    const match = /^Bearer\s+(.+)$/i.exec(header);
    return match ? match[1].trim() : undefined;
  }
}
