/** Escape a string for safe inclusion in an HTML attribute value. */
export function escapeHtmlAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Navigate the top-level browser window to `url`.
 * Used for Moodle (and non-Canvas) educator handoffs where top-frame
 * navigation is allowed.
 */
export function buildTopLevelRedirectHtml(url: string): string {
  const safeUrl = escapeHtmlAttribute(url);
  const jsUrl = JSON.stringify(url);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta http-equiv="refresh" content="0;url=${safeUrl}" />
  <title>Opening RealityWorks…</title>
</head>
<body>
  <p>Opening RealityWorks Educator Portal…</p>
  <p><a href="${safeUrl}" target="_top" rel="noopener">Continue</a></p>
  <script>
    (function () {
      var url = ${jsUrl};
      try {
        if (window.top && window.top !== window.self) {
          window.top.location.href = url;
          return;
        }
      } catch (e) {
        // Cross-origin frame access blocked — fall through to same-window navigate.
      }
      window.location.href = url;
    })();
  </script>
</body>
</html>`;
}

/**
 * Interstitial page with a user-gesture button that opens `url` in a new tab.
 * Use only for Canvas SpeedGrader / submission-review report handoffs (not
 * course-nav Setup). SpeedGrader blocks programmatic top-frame navigation; a
 * clicked target=_blank link opens the educator portal outside the LMS iframe
 * while preserving auto-login (`code`) and report redirect (`redirect`).
 */
export function buildOpenInNewTabHandoffHtml(url: string): string {
  const safeUrl = escapeHtmlAttribute(url);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Open RealityWorks report</title>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; background: #fafaf9; color: #1c1917;
      display: flex; min-height: 100vh; align-items: center; justify-content: center; margin: 0; }
    .card { background: #fff; border: 1px solid #e7e5e4; border-radius: 12px; padding: 2rem;
      max-width: 28rem; text-align: center; box-shadow: 0 1px 2px rgb(0 0 0 / 6%); }
    h1 { font-size: 1.25rem; margin: 0 0 0.75rem; }
    p { margin: 0 0 1.25rem; line-height: 1.5; color: #57534e; font-size: 0.95rem; }
    a.btn { display: inline-block; padding: 0.75rem 1.25rem; border-radius: 8px;
      background: #ed621f; color: #fff; font-weight: 600; text-decoration: none; font-size: 0.95rem; }
    a.btn:hover { background: #d4551a; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Open student report</h1>
    <p>Canvas keeps this view inside SpeedGrader. Click below to open the RealityWorks Educator Portal in a new tab with the student report.</p>
    <a class="btn" href="${safeUrl}" target="_blank" rel="noopener noreferrer">Open in RealityWorks</a>
  </div>
</body>
</html>`;
}

/**
 * Build an HTML page that auto-submits a POST form to the launch endpoint.
 * Keeps id_token out of the browser URL (history, Referer, proxy logs).
 */
export function buildAutoSubmitPostHandoffHtml(
  actionUrl: string,
  fields: Record<string, string>,
): string {
  const inputs = Object.entries(fields)
    .map(
      ([name, value]) =>
        `<input type="hidden" name="${escapeHtmlAttribute(name)}" value="${escapeHtmlAttribute(value)}" />`,
    )
    .join('\n    ');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Launching...</title>
</head>
<body>
  <form method="post" action="${escapeHtmlAttribute(actionUrl)}">
    ${inputs}
    <noscript>
      <p>JavaScript is required to continue. Click the button below to launch.</p>
      <button type="submit">Continue</button>
    </noscript>
  </form>
  <script>document.forms[0].submit();</script>
</body>
</html>`;
}
