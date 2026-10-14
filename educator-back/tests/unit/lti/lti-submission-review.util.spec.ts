import {
  extractForUserId,
  isSubmissionReviewLaunch,
  LTI_SUBMISSION_REVIEW_MESSAGE_TYPE,
  normalizeLineItemUrl,
} from '../../../src/lti/utils/lti-submission-review.util';

describe('lti-submission-review.util', () => {
  it('extracts for_user.user_id', () => {
    expect(
      extractForUserId({
        'https://purl.imsglobal.org/spec/lti/claim/for_user': { user_id: '42' },
      }),
    ).toBe('42');
  });

  it('detects explicit SubmissionReviewRequest', () => {
    expect(
      isSubmissionReviewLaunch({
        'https://purl.imsglobal.org/spec/lti/claim/message_type':
          LTI_SUBMISSION_REVIEW_MESSAGE_TYPE,
      }),
    ).toBe(true);
  });

  it('detects Canvas-style for_user on resource link launches', () => {
    expect(
      isSubmissionReviewLaunch({
        'https://purl.imsglobal.org/spec/lti/claim/message_type': 'LtiResourceLinkRequest',
        'https://purl.imsglobal.org/spec/lti/claim/for_user': { user_id: '99' },
      }),
    ).toBe(true);
  });

  it('does not treat normal resource launches as submission review', () => {
    expect(
      isSubmissionReviewLaunch({
        'https://purl.imsglobal.org/spec/lti/claim/message_type': 'LtiResourceLinkRequest',
      }),
    ).toBe(false);
  });

  it('normalizes trailing slashes on line item URLs', () => {
    expect(normalizeLineItemUrl('https://lms.example/lineitems/1/')).toBe(
      'https://lms.example/lineitems/1',
    );
  });
});
