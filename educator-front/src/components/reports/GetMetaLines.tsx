import type { ExportSource } from '@/types';

export function getMetaLines(source: ExportSource, fromDate: string, toDate: string): string[][] {
  if (source.type === 'sim') {
    return [
      ['Simulation', source.simName ?? ''],
      ['Class', source.className ?? ''],
      ['From Date', fromDate],
      ['To Date', toDate],
    ];
  }
  return [
    ['Class', source.className ?? ''],
    ['From Date', fromDate],
    ['To Date', toDate],
  ];
}
