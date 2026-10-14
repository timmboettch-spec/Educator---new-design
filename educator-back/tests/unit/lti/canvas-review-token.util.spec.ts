import {
  buildCanvasSubmissionLaunchUrl,
  buildReportDetailRedirectPath,
  CANVAS_REVIEW_QUERY_PARAM,
  extractCanvasReviewTokenFromTargetLinkUri,
  signCanvasReviewToken,
  verifyCanvasReviewToken,
} from '../../../src/lti/utils/canvas-review-token.util';

describe('canvas-review-token.util', () => {
  const secret = 'unit-test-jwt-secret-for-canvas-review';
  const claims = {
    classId: 'class-1',
    studentCode: 'STU001',
    simulationId: 'sim-9',
    reportId: 'report-blob-42',
  };

  it('signs and verifies a review token', async () => {
    const token = await signCanvasReviewToken(claims, secret);
    await expect(verifyCanvasReviewToken(token, secret)).resolves.toEqual(claims);
  });

  it('rejects forged or wrong-secret tokens', async () => {
    const token = await signCanvasReviewToken(claims, secret);
    await expect(verifyCanvasReviewToken(token, 'other-secret')).resolves.toBeNull();
    await expect(verifyCanvasReviewToken('not-a-jwt', secret)).resolves.toBeNull();
  });

  it('builds report-detail redirect path', () => {
    expect(buildReportDetailRedirectPath(claims)).toBe(
      '/report-detail?classId=class-1&studentCode=STU001&simulationId=sim-9&reportId=report-blob-42',
    );
  });

  it('embeds rw_review on the Canvas submission launch URL', async () => {
    const url = await buildCanvasSubmissionLaunchUrl({
      apiBaseUrl: 'https://api.example.com/',
      secret,
      claims,
    });
    const parsed = new URL(url);
    expect(parsed.origin + parsed.pathname).toBe('https://api.example.com/api/lti/launch');
    const token = parsed.searchParams.get(CANVAS_REVIEW_QUERY_PARAM);
    expect(token).toBeTruthy();
    await expect(verifyCanvasReviewToken(token!, secret)).resolves.toEqual(claims);
  });

  it('extracts rw_review from target_link_uri', () => {
    expect(
      extractCanvasReviewTokenFromTargetLinkUri(
        'https://api.example.com/api/lti/launch?rw_review=abc.def.ghi&x=1',
      ),
    ).toBe('abc.def.ghi');
    expect(extractCanvasReviewTokenFromTargetLinkUri('https://api.example.com/api/lti/launch')).toBe(
      null,
    );
  });
});
