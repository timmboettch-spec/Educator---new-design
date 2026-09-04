/* eslint-disable */
/**
 * testSequencer.js
 * Controls the execution order of smoke test files.
 * Ensures auth runs first (establishes token) then other modules follow.
 */

const Sequencer = require('@jest/test-sequencer').default;

const ORDER = [
  'auth.smoke.ts',
  'admin.smoke.ts',
  'classes.smoke.ts',
  'scenarios.smoke.ts',
  'units.smoke.ts',
  'reports.smoke.ts',
  'uploads.smoke.ts',
];

class SmokeTestSequencer extends Sequencer {
  sort(tests) {
    return tests.slice().sort((a, b) => {
      const nameA = a.path.replace(/\\/g, '/').split('/').pop() ?? '';
      const nameB = b.path.replace(/\\/g, '/').split('/').pop() ?? '';
      const idxA = ORDER.findIndex((o) => nameA.endsWith(o));
      const idxB = ORDER.findIndex((o) => nameB.endsWith(o));
      // Unknown files go to the end
      const posA = idxA === -1 ? ORDER.length : idxA;
      const posB = idxB === -1 ? ORDER.length : idxB;
      return posA - posB;
    });
  }
}

module.exports = SmokeTestSequencer;
