import { jsPDF } from 'jspdf';

/** The part of a Chart.js instance the exports need. */
export interface ExportableChart {
  toBase64Image: (type?: string, quality?: unknown) => string;
}

export function downloadDataUrl(url: string, fileName: string): void {
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  try {
    downloadDataUrl(url, fileName);
  } finally {
    URL.revokeObjectURL(url);
  }
}

// Spreadsheets run a cell starting with one of these as a formula (OWASP CSV injection).
const FORMULA_PREFIX = /^[=+\-@\t\r]/;

const escapeCsvCell = (value: string | number): string => {
  // Only text is neutralized, so counts (including negatives) stay numbers.
  const text =
    typeof value === 'string' && FORMULA_PREFIX.test(value)
      ? `'${value}`
      : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

/**
 * RFC 4180 CSV: cells with commas, quotes or newlines are quoted, quotes doubled.
 * Text cells that start like a formula get a leading `'` so spreadsheets show them as text.
 */
export const toCsv = (rows: (string | number)[][]): string =>
  rows.map((row) => row.map(escapeCsvCell).join(',')).join('\r\n');

/** Lowercase, hyphenated text safe for a file name. */
export const toFileSlug = (text: string): string =>
  text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);

export function exportChartPng(chart: ExportableChart, fileName: string): void {
  downloadDataUrl(chart.toBase64Image('image/png', 1), fileName);
}

export function exportChartPdf(
  chart: ExportableChart,
  {
    title,
    lines,
    fileName,
  }: { title: string; lines: string[]; fileName: string }
): void {
  const pdf = new jsPDF({
    orientation: 'landscape',
    unit: 'px',
    format: [800, 440],
  });
  pdf.setFontSize(16);
  pdf.text(title, 20, 30);
  pdf.setFontSize(11);
  lines.forEach((line, i) => pdf.text(line, 20, 50 + i * 15));
  const imageTop = 60 + lines.length * 15;
  pdf.addImage(
    chart.toBase64Image('image/png', 1),
    'PNG',
    20,
    imageTop,
    760,
    Math.max(200, 420 - imageTop)
  );
  pdf.save(fileName);
}

export function exportCsv(rows: (string | number)[][], fileName: string): void {
  // BOM so Excel opens accented text (e.g. Spanish month names) as UTF-8.
  const blob = new Blob(['﻿', toCsv(rows)], {
    type: 'text/csv;charset=utf-8;',
  });
  downloadBlob(blob, fileName);
}
