import type { StudentCodeRow } from '@/redux/api/classes/classesService';

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** Makes text safe to place inside HTML markup. */
export const escapeHtml = (text: string): string =>
  text.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char] ?? char);

export interface StudentCodesPrintLabels {
  windowTitle: string;
  heading: string;
  studentName: string;
  studentCode: string;
  noStudents: string;
  missingName: string;
}

const PAGE_STYLES = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: sans-serif; padding: 40px; display: flex; flex-direction: column; align-items: center; }
  .title { font-size: 24px; font-weight: 700; color: #f97316; text-align: center; margin-bottom: 32px; }
  .class-name { font-size: 20px; font-weight: 700; color: #1f2937; text-align: center; margin-bottom: 8px; }
  .status { font-size: 16px; color: #6b7280; margin-top: 40px; }
  table { width: 100%; border-collapse: collapse; }
  th { color: #1f1b1b; padding: 10px 16px; font-weight: 750; text-align: left; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; border: 1px solid #e5e7eb; }
  td { padding: 10px 16px; font-size: 14px; color: #363638; border: 1px solid #e5e7eb; }
  .empty { text-align: center; color: #6b7280; }
`;

const page = (title: string, body: string) => `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>${PAGE_STYLES}</style>
</head>
<body>${body}</body>
</html>`;

/** Placeholder shown in the print window while the codes are fetched. */
export const buildPrintPreparingHtml = (title: string, message: string) =>
  page(title, `<p class="status">${escapeHtml(message)}</p>`);

/**
 * The printable "All Student Codes" page: class name, heading and a
 * Student Name / Student Code table sorted by name (nameless students last).
 * Every value is escaped, since names and class names are user-supplied.
 */
export const buildStudentCodesPrintHtml = (
  className: string,
  students: StudentCodeRow[],
  labels: StudentCodesPrintLabels
): string => {
  const sorted = [...students].sort((a, b) => {
    if (!a.name || !b.name) return a.name ? -1 : b.name ? 1 : 0;
    return a.name.localeCompare(b.name);
  });
  const rows =
    sorted.length > 0
      ? sorted
          .map(
            (student) =>
              `<tr><td>${escapeHtml(student.name || labels.missingName)}</td><td>${escapeHtml(student.code)}</td></tr>`
          )
          .join('')
      : `<tr><td class="empty" colspan="2">${escapeHtml(labels.noStudents)}</td></tr>`;

  return page(
    labels.windowTitle,
    `<div class="class-name">${escapeHtml(className)}</div>
<div class="title">${escapeHtml(labels.heading)}</div>
<table>
  <thead><tr><th>${escapeHtml(labels.studentName)}</th><th>${escapeHtml(labels.studentCode)}</th></tr></thead>
  <tbody>${rows}</tbody>
</table>`
  );
};

/** Replaces the whole document of a window opened with `window.open('')`. */
export const writeWindowDocument = (target: Window, html: string) => {
  target.document.open();
  target.document.write(html);
  target.document.close();
};
