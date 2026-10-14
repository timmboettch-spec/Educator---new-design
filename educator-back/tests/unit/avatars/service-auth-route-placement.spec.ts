import { Reflector } from '@nestjs/core';

import { AvatarsController } from 'src/avatars/avatars.controller';
import { ROLES_KEY } from 'src/common/decorators/required-roles.decorator';
import { SERVICE_AUTH_KEY } from 'src/common/decorators/service-auth.decorator';

/**
 * WHICH avatar routes accept the service key.
 *
 * `service-auth.guard.spec.ts` proves the guard honours the decorator; it uses a
 * synthetic Reflector, so it cannot tell whether a given route actually carries
 * one. This file pins the placement itself, which is the part that decides what
 * a leaked key could do.
 *
 * It matters because the set has already changed once. The decorator shipped on
 * `POST` and `PATCH` only, explicitly withholding the `GET`s so a CI key could
 * not read the catalog. The `GET`s were added when the scenario app's catalog
 * proxy needed them -- a server-side caller behind an admin-gated page, not CI.
 * `DELETE` stays off: nothing automated should remove a catalog row.
 *
 * A failure here is a deliberate decision to re-make, not a test to update
 * reflexively. Widening this set hands the key more reach; narrowing it breaks
 * whichever machine caller depended on the route.
 */
describe('@ServiceAuth() — which avatar routes accept the service key', () => {
  const reflector = new Reflector();

  const acceptsServiceKey = (handler: keyof AvatarsController): boolean =>
    reflector.get<boolean>(SERVICE_AUTH_KEY, AvatarsController.prototype[handler]) === true;

  describe('the pipeline writes', () => {
    it.each(['create', 'update'] as const)('%s accepts it', (handler) => {
      expect(acceptsServiceKey(handler)).toBe(true);
    });
  });

  describe('the catalog reads, for the scenario app proxy', () => {
    it.each(['findAll', 'findOne'] as const)('%s accepts it', (handler) => {
      expect(acceptsServiceKey(handler)).toBe(true);
    });
  });

  describe('destructive routes stay closed to machines', () => {
    it('remove does NOT accept it', () => {
      // A machine has no reason to delete an avatar, and a missing avatar is a
      // worse failure than a wrong field: scenarios reference it by FK.
      expect(acceptsServiceKey('remove')).toBe(false);
    });
  });

  it('the service key never replaces the role gate', () => {
    // Every @ServiceAuth() route keeps @RequiredRoles, so a human still needs
    // scenario_admin. The decorator adds a second way in; it does not open the
    // route. If this fails, a route became service-key-only for humans too.
    const roleGated = ['findAll', 'findOne', 'create', 'update', 'remove'] as const;

    for (const handler of roleGated) {
      const roles = reflector.get<string[]>(ROLES_KEY, AvatarsController.prototype[handler]);
      expect(roles).toBeDefined();
      expect(roles?.length).toBeGreaterThan(0);
    }
  });

  it('the decorated set is exactly the four, so a new route must be a decision', () => {
    // If a future handler picks up @ServiceAuth() by copy-paste, this fails
    // and forces the question "which machine caller needs it, and what does
    // the key gain?" instead of the widening passing unnoticed.
    const decorated = Object.getOwnPropertyNames(AvatarsController.prototype)
      .filter(
        (name) =>
          name !== 'constructor' &&
          typeof (AvatarsController.prototype as unknown as Record<string, unknown>)[name] ===
            'function',
      )
      .filter((name) => acceptsServiceKey(name as keyof AvatarsController))
      .sort();

    expect(decorated).toEqual(['create', 'findAll', 'findOne', 'update']);
  });
});
