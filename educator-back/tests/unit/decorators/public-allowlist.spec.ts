import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../../../src/common/decorators/public.decorator';
import { AppController } from '../../../src/app.controller';
import { HealthController } from '../../../src/health/health.controller';
import { HealthController as StudentHealthController } from '../../../src/student-backend/health/health.controller';
import { GoogleOAuthController } from '../../../src/google/google-oauth.controller';
import { InvitesController } from '../../../src/invites/invites.controller';
import { TelemetryController } from '../../../src/student-backend/modules/telemetry/telemetry.controller';
import { VoiceProfilesController } from '../../../src/voice-profiles/voice-profiles.controller';

describe('@Public() allowlist (RWAI-3087 ticket 02)', () => {
  const reflector = new Reflector();

  const isPublic = (controller: object, handler?: string): boolean | undefined => {
    const targets: (object | ((...args: unknown[]) => unknown))[] = [];
    if (handler) {
      targets.push(
        (controller as { prototype: Record<string, (...args: unknown[]) => unknown> }).prototype[
          handler
        ],
      );
    }
    targets.push(controller);
    return reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets as never);
  };

  it.each([
    ['AppController', AppController],
    ['HealthController', HealthController],
    ['student-backend HealthController', StudentHealthController],
    ['GoogleOAuthController', GoogleOAuthController],
    ['TelemetryController', TelemetryController],
  ])('%s is public at controller level', (_name, controller) => {
    expect(isPublic(controller)).toBe(true);
  });

  it('marks only verify-token and accept-invite public on InvitesController', () => {
    expect(isPublic(InvitesController)).toBeUndefined();
    const handlers = Object.getOwnPropertyNames(InvitesController.prototype).filter(
      (name) => name !== 'constructor',
    );
    const publicHandlers = handlers.filter((name) => isPublic(InvitesController, name) === true);
    expect(publicHandlers.sort()).toEqual(['acceptInvite', 'verifyInviteToken'].sort());
  });

  it('marks no VoiceProfilesController handler public (the signed audio route is gone)', () => {
    expect(isPublic(VoiceProfilesController)).toBeUndefined();
    const handlers = Object.getOwnPropertyNames(VoiceProfilesController.prototype).filter(
      (name) => name !== 'constructor',
    );
    expect(handlers).not.toContain('streamSignedAudio');
    const publicHandlers = handlers.filter(
      (name) => isPublic(VoiceProfilesController, name) === true,
    );
    expect(publicHandlers).toEqual([]);
  });
});
