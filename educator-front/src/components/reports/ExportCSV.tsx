import { TABLE_HEADERS, type ExportSource } from '@/types';
import { getMetaLines } from './GetMetaLines';

export function ExportCSV(
  source: ExportSource,
  rows: string[][],
  fromDate: string,
  toDate: string,
  filenameBase: string,
): void {
  const meta = getMetaLines(source, fromDate, toDate);
  const lines = [
    ...meta.map(([k, v]) => `${k}:,${v}`),
    '',
    TABLE_HEADERS.join(','),
    ...rows.map((r) => r.map((v) => `"${v}"`).join(',')),
  ];
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  triggerDownload(blob, `${filenameBase}.csv`);
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
