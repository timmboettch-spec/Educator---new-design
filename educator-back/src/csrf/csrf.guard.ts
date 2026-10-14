import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';

import { SERVICE_AUTH_KEY } from '../common/decorators/service-auth.decorator';
import { CsrfService } from './csrf.service';

@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(
    private readonly csrfService: CsrfService,
    private readonly reflector: Reflector,
  ) { }
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
    '/api/simulations/:scenarioId/public',
    '/api/simulation-reports/student/:studentId/update',
    '/api/reports/student/:studentId/update',
    '/api/simulation-reports/student/:simId/simupdate',
    '/api/reports/student/:simId/simupdate',
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
    '/api/lti/session/exchange',
    '/api/lti/deep-linking',
    '/api/auth/google/callback',
    // Nest may expose paths without the global /api prefix depending on middleware order
    '/lti/login',
    '/lti/callback',
    '/lti/launch',
    '/lti/jwks',
    '/lti/metadata',
    '/lti/studentlogin',
    '/lti/studentcallback',
    '/lti/studentlaunch',
    '/lti/studentjwks',
    '/lti/session/exchange',
    '/lti/deep-linking',
    '/auth/google/callback',
    '/api/lms/moodle/students',
    '/api/lms/moodle/courses',
    '/api/lms/moodle/mapped-classes',

    '/api/units'
  ];

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const method = request.method;
    const path = request.path;

    // CSRF protects state-changing requests only. Requiring it on GET breaks
    // Canvas/LMS iframes where the FE csrf cookie often never sticks, while the
    // BE auth cookie (SameSite=None) still authenticates — causing
    // "CSRF token missing" on reads like /api/lms/live-classes.
    const stateChangingMethods = ['POST', 'PUT', 'PATCH', 'DELETE'];
    if (!stateChangingMethods.includes(method)) {
      return true;
    }

    if (this.isPathExcluded(path) || path.includes('students-backend')) {
      return true;
    }

    // A route marked @ServiceAuth() is callable by a machine holding the
    // service key. CSRF defends against a BROWSER being tricked into sending a
    // request with cookies it already holds; a secret in a header cannot be
    // attached that way, so there is nothing here to defend. Requiring a token
    // of a machine caller would mean inventing one and handing it over.
    //
    // Note this skips CSRF for the ROUTE, not only for key-holders -- the same
    // shape as CSRF_EXCLUDED_PATHS above, and the reason @ServiceAuth() is
    // applied per route rather than per controller.
    const isServiceRoute = this.reflector.getAllAndOverride<boolean>(SERVICE_AUTH_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isServiceRoute) {
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

  private async validateCsrfToken(request: Request): Promise<boolean> {
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
      throw new ForbiddenException('CSRF token missing in header or body');
    }

    const isValid = await this.csrfService.validateToken(submittedToken);

    if (!isValid) {
      throw new ForbiddenException('Invalid CSRF token');
    }

    return true;
  }
}
