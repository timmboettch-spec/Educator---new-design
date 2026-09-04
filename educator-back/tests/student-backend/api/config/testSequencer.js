/**
 * Ensures auth.smoke.ts always runs first so the accessToken is populated
 * in smoke-state before any other smoke file executes.
 */
const Sequencer = require('@jest/test-sequencer').default;

class SmokeSequencer extends Sequencer {
  sort(tests) {
    return tests.sort((a, b) => {
      const authA = a.path.includes('auth.smoke');
      const authB = b.path.includes('auth.smoke');
      if (authA && !authB) return -1;
      if (!authA && authB) return 1;
      return a.path.localeCompare(b.path);
    });
  }
}

module.exports = SmokeSequencer;
