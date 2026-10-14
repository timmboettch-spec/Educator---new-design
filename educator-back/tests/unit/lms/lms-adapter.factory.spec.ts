import { LmsType } from '../../../src/common/enums/lms.enum';
import { CanvasAdapter } from '../../../src/lms/adapters/canvas.adapter';
import { LtiAgsAdapter } from '../../../src/lms/adapters/lti-ags.adapter';
import { MoodleAdapter } from '../../../src/lms/adapters/moodle.adapter';
import { LmsAdapterFactory } from '../../../src/lms/factories/lms-adapter.factory';
import { LoggerService } from '../../../src/common/services';

describe('LmsAdapterFactory', () => {
  const moodleAdapter = {} as MoodleAdapter;
  const canvasAdapter = {} as CanvasAdapter;
  const ltiAgsAdapter = {} as LtiAgsAdapter;
  const mockLogger = {
    log: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    verbose: jest.fn(),
    fatal: jest.fn(),
  } as unknown as LoggerService;
  let factory: LmsAdapterFactory;

  beforeEach(() => {
    factory = new LmsAdapterFactory(moodleAdapter, canvasAdapter, ltiAgsAdapter, mockLogger);
  });

  it('returns MoodleAdapter for MOODLE type', () => {
    expect(factory.getAdapter(LmsType.MOODLE)).toBe(moodleAdapter);
  });

  it('returns CanvasAdapter for CANVAS type (no throw)', () => {
    expect(factory.getAdapter(LmsType.CANVAS)).toBe(canvasAdapter);
  });

  it('tryGetAdapter returns adapter for supported types and null for unsupported', () => {
    expect(factory.tryGetAdapter(LmsType.CANVAS)).toBe(canvasAdapter);
    expect(factory.tryGetAdapter(LmsType.MOODLE)).toBe(moodleAdapter);
    expect(factory.tryGetAdapter(LmsType.GOOGLE_CLASSROOM)).toBeNull();
  });

  it('getGradePassbackAdapter returns shared LtiAgsAdapter for supported LMS types', () => {
    expect(factory.getGradePassbackAdapter(LmsType.MOODLE)).toBe(ltiAgsAdapter);
    expect(factory.getGradePassbackAdapter(LmsType.CANVAS)).toBe(ltiAgsAdapter);
  });

  it('getGradePassbackAdapter throws for unsupported LMS types', () => {
    expect(() => factory.getGradePassbackAdapter(LmsType.GOOGLE_CLASSROOM)).toThrow(
      'Grade passback not supported for google_classroom',
    );
  });
});
