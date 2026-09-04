import { LmsType } from '../../../src/common/enums/lms.enum';
import { MoodleAdapter } from '../../../src/lms/adapters/moodle.adapter';
import { LmsAdapterFactory } from '../../../src/lms/factories/lms-adapter.factory';

describe('LmsAdapterFactory', () => {
  const moodleAdapter = {} as MoodleAdapter;
  let factory: LmsAdapterFactory;

  beforeEach(() => {
    factory = new LmsAdapterFactory(moodleAdapter);
  });

  it('returns MoodleAdapter for MOODLE type', () => {
    expect(factory.getAdapter(LmsType.MOODLE)).toBe(moodleAdapter);
  });

  it('throws for CANVAS type', () => {
    expect(() => factory.getAdapter(LmsType.CANVAS)).toThrow(
      'Canvas adapter not yet implemented',
    );
  });

  it('throws for BLACKBOARD type', () => {
    expect(() => factory.getAdapter(LmsType.BLACKBOARD)).toThrow(
      'Blackboard adapter not yet implemented',
    );
  });
});
