import { isSyntheticTestRecipient } from '../../../src/mail/mail-test-recipient.util';

describe('isSyntheticTestRecipient', () => {
  const TEST_MAILBOX = 'test@curionn.com';

  it('does not match a "+"-tagged sub-address of the configured test mailbox — real catch-all inbox', () => {
    expect(isSyntheticTestRecipient('test+auth-ctrl-1788325434223@curionn.com', TEST_MAILBOX)).toBe(
      false,
    );
  });

  it('matches any other local-part on the same domain (e.g. other hardcoded test literals)', () => {
    expect(isSyntheticTestRecipient('negative@curionn.com', TEST_MAILBOX)).toBe(true);
    expect(isSyntheticTestRecipient('noauth@curionn.com', TEST_MAILBOX)).toBe(true);
    expect(isSyntheticTestRecipient('badtoken@curionn.com', TEST_MAILBOX)).toBe(true);
    expect(isSyntheticTestRecipient('other+auth-ctrl-1@curionn.com', TEST_MAILBOX)).toBe(true);
  });

  it('is case-insensitive on both local part and domain', () => {
    expect(isSyntheticTestRecipient('Test+Foo-123@Curionn.COM', TEST_MAILBOX)).toBe(false);
    expect(isSyntheticTestRecipient('Negative@Curionn.COM', TEST_MAILBOX)).toBe(true);
  });

  it('does not match the exact bare test mailbox — may be a real monitored inbox', () => {
    expect(isSyntheticTestRecipient('test@curionn.com', TEST_MAILBOX)).toBe(false);
    expect(isSyntheticTestRecipient('Test@Curionn.COM', TEST_MAILBOX)).toBe(false);
  });

  it('does not match a real recipient address on a different, non-reserved domain', () => {
    expect(isSyntheticTestRecipient('educator@gmail.com', TEST_MAILBOX)).toBe(false);
    expect(isSyntheticTestRecipient('kavyesh.shah@rwthrive.com', TEST_MAILBOX)).toBe(false);
  });

  it('does not match an address on a different, non-reserved domain, even with the test local-part pattern', () => {
    expect(isSyntheticTestRecipient('test+auth-ctrl-1@gmail.com', TEST_MAILBOX)).toBe(false);
  });

  it('returns false for a malformed test mailbox config', () => {
    expect(isSyntheticTestRecipient('test+x@curionn.com', 'not-an-email')).toBe(false);
  });

  it('returns false for a malformed recipient address', () => {
    expect(isSyntheticTestRecipient('not-an-email', TEST_MAILBOX)).toBe(false);
  });

  // RFC 2606 permanently reserves .test/.example/.invalid/.localhost and
  // example.com/.net/.org — these can never be real mailboxes, so they're
  // always skipped regardless of TEST_EMAIL_ADDRESS. Confirmed live:
  // nobody@nowhere.invalid reached a real ACS send attempt via
  // forgot-password (which doesn't require the account to exist) even
  // after the domain-based curionn.com guard was deployed.
  describe('RFC 2606 reserved test domains (independent of TEST_EMAIL_ADDRESS)', () => {
    it('matches addresses on .invalid', () => {
      expect(isSyntheticTestRecipient('nobody@nowhere.invalid', TEST_MAILBOX)).toBe(true);
      expect(isSyntheticTestRecipient('ghost@nowhere.invalid', TEST_MAILBOX)).toBe(true);
    });

    it('matches addresses on .test', () => {
      expect(isSyntheticTestRecipient('smoke-edu@smoke.test', TEST_MAILBOX)).toBe(true);
    });

    it('matches example.com / .net / .org exactly', () => {
      expect(isSyntheticTestRecipient('admin-smoke@example.com', TEST_MAILBOX)).toBe(true);
      expect(isSyntheticTestRecipient('someone@example.net', TEST_MAILBOX)).toBe(true);
      expect(isSyntheticTestRecipient('someone@example.org', TEST_MAILBOX)).toBe(true);
    });

    it('matches .example and .localhost', () => {
      expect(isSyntheticTestRecipient('someone@foo.example', TEST_MAILBOX)).toBe(true);
      expect(isSyntheticTestRecipient('someone@foo.localhost', TEST_MAILBOX)).toBe(true);
    });

    it('is case-insensitive', () => {
      expect(isSyntheticTestRecipient('Nobody@Nowhere.INVALID', TEST_MAILBOX)).toBe(true);
    });

    it('does not match a domain that merely contains a reserved word as a substring', () => {
      expect(isSyntheticTestRecipient('someone@invalid-looking-but-real.com', TEST_MAILBOX)).toBe(
        false,
      );
      expect(isSyntheticTestRecipient('someone@testcompany.com', TEST_MAILBOX)).toBe(false);
    });

    it('still applies even when testMailbox config is malformed', () => {
      expect(isSyntheticTestRecipient('nobody@nowhere.invalid', 'not-an-email')).toBe(true);
    });
  });
});
