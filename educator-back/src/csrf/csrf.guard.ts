import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Request } from 'express';
import { CsrfService } from './csrf.service';

@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(
    private readonly csrfService: CsrfService,
  ) {}
  private static readonly CSRF_EXCLUDED_PATHS = [
    '/health',
    '/healthz',
    '/readyz',
    '/api/health',
    '/api/healthz',
    '/api/readyz',
    '/api/auth/signup',
    '/api/auth/login',
    '/api/auth/forgot-password',
    '/api/auth/verify-otp',
    '/api/auth/resend-otp',
    '/api/auth/reset-password',
    '/api/auth/csrf-token',
    '/api/invites',
    '/api/students/lookup/:studentsCode',
    '/api/students/login',
    '/api/students/logout',
    '/api/students/simulations/:studentId',
    '/api/simulation-catalog/scenario/:scenarioId',
    '/api/simulation-catalog/scenario/:scenarioId/public',
    '/api/simulation-reports/student/:studentId/update',
    '/api/reports/student/:studentId/update',
    '/api/simulation-reports/student/:simId/update',
    '/api/reports/sim/:simId/update',

    '/api/lti/login',
    '/api/lti/callback',
    '/api/lti/launch',
    '/api/lti/jwks',
    '/api/lti/metadata',
    '/api/lti/studentlogin',
    '/api/lti/studentcallback',
    '/api/lti/studentlaunch',
    '/api/lti/studentjwks',
    '/api/lti/bootstrap-config',
    '/api/lti/debug-launch',
    '/api/lti/session/exchange',
    '/api/lms/moodle/students',
    '/api/lms/moodle/courses',
    '/api/lms/moodle/mapped-classes',
  ];

  async canActivate(
  context: ExecutionContext,
): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const method = request.method;
    const path = request.path;

    const stateChangingMethods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
    if (!stateChangingMethods.includes(method)) {
      return true;
    }

    if (this.isPathExcluded(path) || path.includes('students-backend')) {
      return true;
    }
return await this.validateCsrfToken(request);
  }

  private isPathExcluded(path: string): boolean {
    const cleanPath = path.split('?')[0];
    return CsrfGuard.CSRF_EXCLUDED_PATHS.some((excludedPath) => {
      if (!excludedPath.includes(':')) {
        return cleanPath === excludedPath || cleanPath.startsWith(excludedPath + '/');
      }
      const pattern = excludedPath.replace(/:[^/]+/g, '[^/]+');
      const regex = new RegExp(`^${pattern}(/|$)`);
      return regex.test(cleanPath);
    });
  }

private async validateCsrfToken(
  request: Request,
): Promise<boolean> {
  const headerToken = request.headers['x-csrf-token'];

  let submittedToken: string | undefined;
  if (typeof headerToken === 'string') {
    submittedToken = headerToken;
  } else if (Array.isArray(headerToken)) {
    submittedToken = headerToken[0];
  }

  const body = request.body as Record<string, unknown> | undefined;
  const bodyToken = body?._csrf;

  if (!submittedToken && typeof bodyToken === 'string') {
    submittedToken = bodyToken;
  }

  if (!submittedToken) {
    throw new ForbiddenException(
      'CSRF token missing in header or body',
    );
  }

  const isValid =
    await this.csrfService.validateToken(submittedToken);

  if (!isValid) {
    throw new ForbiddenException('Invalid CSRF token');
  }

  return true;
}
}