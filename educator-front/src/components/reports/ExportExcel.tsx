import { TABLE_HEADERS, type ExportSource } from '@/types';
import * as XLSX from 'xlsx';
import { getMetaLines } from './GetMetaLines';

export function ExportExcel(
  source: ExportSource,
  rows: string[][],
  fromDate: string,
  toDate: string,
  filenameBase: string,
): void {
  const meta = getMetaLines(source, fromDate, toDate);

  const wb = XLSX.utils.book_new();

  const sheetData = [
    ...meta.map(([k, v]) => [`${k}:`, v]),

    [],
    ['Executive Summary'],
    ['No summary available'],

    [],
    ['Performance Summary'],
    [],

    TABLE_HEADERS,
    ...rows,
  ];

  const ws = XLSX.utils.aoa_to_sheet(sheetData);
  ws['!cols'] = [{ wch: 22 }, { wch: 22 }, { wch: 10 }, { wch: 10 }, { wch: 14 }, { wch: 18 }];

  XLSX.utils.book_append_sheet(wb, ws, 'Report');
  XLSX.writeFile(wb, `${filenameBase}.xlsx`);
}
