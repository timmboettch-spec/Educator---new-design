/** Escape a string for safe inclusion in an HTML attribute value. */
export function escapeHtmlAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
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
