import { randomBytes } from 'crypto';
import { getMetadataArgsStorage, ValueTransformer } from 'typeorm';
import { LmsSchoolConfig, LmsClassMapping } from '../../../src/database/entities';
import { LMS_SECRET_PREFIX } from '../../../src/lms/utils/lms-secret-crypto';
import { LmsConfigService } from '../../../src/lms/services/lms-config.service';

const KEY = randomBytes(32).toString('base64');

const SECRET_COLUMNS: ReadonlyArray<{ target: Function; property: string }> = [
  { target: LmsSchoolConfig, property: 'lmsApiToken' },
  { target: LmsSchoolConfig, property: 'platformPrivateKeyPem' },
  { target: LmsClassMapping, property: 'lmsApiToken' },
];

function transformerFor(target: Function, property: string): ValueTransformer | undefined {
  const column = getMetadataArgsStorage().columns.find(
    (c) => c.target === target && c.propertyName === property,
  );
  const transformer = column?.options?.transformer;
  return Array.isArray(transformer) ? transformer[0] : transformer;
}

describe('LMS secret columns', () => {
  const originalKey = process.env.LMS_SECRETS_ENCRYPTION_KEY;

  beforeEach(() => {
    process.env.LMS_SECRETS_ENCRYPTION_KEY = KEY;
  });

  afterAll(() => {
    if (originalKey === undefined) {
      delete process.env.LMS_SECRETS_ENCRYPTION_KEY;
    } else {
      process.env.LMS_SECRETS_ENCRYPTION_KEY = originalKey;
    }
  });

  describe.each(SECRET_COLUMNS)('$target.name.$property', ({ target, property }) => {
    it('has an encryption transformer attached', () => {
      expect(transformerFor(target, property)).toBeDefined();
    });

    it('writes ciphertext and reads back plaintext', () => {
      const transformer = transformerFor(target, property);
      const plaintext = 'super-secret-value';

      const stored = transformer?.to(plaintext) as string;

      expect(stored.startsWith(LMS_SECRET_PREFIX)).toBe(true);
      expect(stored).not.toContain(plaintext);
      expect(transformer?.from(stored)).toBe(plaintext);
    });
  });

  it('covers every column named in the ticket', () => {
    const covered = SECRET_COLUMNS.filter(({ target, property }) =>
      Boolean(transformerFor(target, property)),
    );

    expect(covered).toHaveLength(3);
  });

  describe('sanitize()', () => {
    it('still strips both secrets from API responses', () => {
      const service = new LmsConfigService(
        {} as never,
        {} as never,
        { log: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() } as never,
        { getAccessToken: jest.fn() } as never,
        { fetch: jest.fn() } as never,
      );

      const safe = service.sanitize({
        id: 'cfg-1',
        schoolId: 'school-1',
        platformPrivateKeyPem: '-----BEGIN PRIVATE KEY-----',
        lmsApiToken: 'ws-token',
        lmsBaseUrl: 'https://moodle.test',
      } as never);

      expect(safe).not.toHaveProperty('platformPrivateKeyPem');
      expect(safe).not.toHaveProperty('lmsApiToken');
      expect(JSON.stringify(safe)).not.toContain('ws-token');
      expect(JSON.stringify(safe)).not.toContain('BEGIN PRIVATE KEY');
    });
  });
});
