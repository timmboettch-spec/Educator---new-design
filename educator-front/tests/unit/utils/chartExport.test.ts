import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const pdfCalls = vi.hoisted(() => ({
  text: vi.fn(),
  addImage: vi.fn(),
  save: vi.fn(),
  setFontSize: vi.fn(),
  ctor: vi.fn(),
}));

vi.mock('jspdf', () => ({
  jsPDF: class {
    constructor(opts: unknown) {
      pdfCalls.ctor(opts);
    }
    text = pdfCalls.text;
    addImage = pdfCalls.addImage;
    save = pdfCalls.save;
    setFontSize = pdfCalls.setFontSize;
  },
}));

import {
  downloadBlob,
  exportChartPdf,
  exportChartPng,
  exportCsv,
  toCsv,
  toFileSlug,
} from '../../../src/utils/chartExport';

const chart = { toBase64Image: vi.fn(() => 'data:image/png;base64,AAA') };

describe('toCsv', () => {
  it('quotes cells with commas, quotes or newlines and doubles quotes', () => {
    expect(
      toCsv([
        ['Month', 'Count'],
        ['Biology, Sec A', 3],
        ['Says "hi"', 1],
        ['Line\nbreak', 0],
      ])
    ).toBe(
      'Month,Count\r\n"Biology, Sec A",3\r\n"Says ""hi""",1\r\n"Line\nbreak",0'
    );
  });
});

describe('toCsv formula injection', () => {
  it.each(['=SUM(A1)', '+1', '-1', '@cmd', '\tx'])(
    'prefixes %j with an apostrophe so it is read as text',
    (label) => {
      expect(toCsv([[label, 1]])).toBe(`'${label},1`);
    }
  );

  it('prefixes before quoting', () => {
    expect(toCsv([['=a,b', 1]])).toBe(`"'=a,b",1`);
    expect(toCsv([['\rx', 1]])).toBe(`"'\rx",1`);
  });

  it('leaves numbers, including negatives, and normal labels unchanged', () => {
    expect(toCsv([['Biology 101', -5]])).toBe('Biology 101,-5');
  });
});

describe('toFileSlug', () => {
  it('lowercases, strips accents and hyphenates', () => {
    expect(toFileSlug('Últimos 6 meses · Clases: Biología 101')).toBe(
      'ultimos-6-meses-clases-biologia-101'
    );
  });
});

describe('downloads', () => {
  let click: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {});
    URL.createObjectURL = vi.fn(() => 'blob:mock');
    URL.revokeObjectURL = vi.fn();
    Object.values(pdfCalls).forEach((fn) => fn.mockClear());
  });

  afterEach(() => {
    click.mockRestore();
  });

  // The anchor `click()` was invoked on.
  const clickedAnchor = () =>
    click.mock.contexts[0] as HTMLAnchorElement | undefined;

  it('downloadBlob clicks a temporary anchor, removes it, and revokes the URL', () => {
    let wasAttached = false;
    click.mockImplementation(function (this: HTMLAnchorElement) {
      wasAttached = document.body.contains(this);
    });

    downloadBlob(new Blob(['x']), 'file.csv');

    const clicked = clickedAnchor();
    expect(wasAttached).toBe(true);
    expect(clicked?.download).toBe('file.csv');
    expect(clicked?.href).toBe('blob:mock');
    expect(document.body.contains(clicked ?? null)).toBe(false);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock');
  });

  it('exportChartPng downloads the chart image under the given name', () => {
    exportChartPng(chart, 'chart.png');
    expect(chart.toBase64Image).toHaveBeenCalledWith('image/png', 1);
    expect(clickedAnchor()?.download).toBe('chart.png');
  });

  it('exportChartPdf writes the title, each selection line and the image', () => {
    exportChartPdf(chart, {
      title: 'Simulations Completed',
      lines: ['Classes: Biology · Last 6 Months', 'Generated 9/25/2026'],
      fileName: 'chart.pdf',
    });
    const written = pdfCalls.text.mock.calls.map(([text]) => text);
    expect(written).toEqual([
      'Simulations Completed',
      'Classes: Biology · Last 6 Months',
      'Generated 9/25/2026',
    ]);
    expect(pdfCalls.addImage).toHaveBeenCalledWith(
      'data:image/png;base64,AAA',
      'PNG',
      expect.any(Number),
      expect.any(Number),
      expect.any(Number),
      expect.any(Number)
    );
    expect(pdfCalls.save).toHaveBeenCalledWith('chart.pdf');
  });

  it('exportCsv downloads a UTF-8 CSV with a BOM', async () => {
    let blob: Blob | undefined;
    URL.createObjectURL = vi.fn((b: Blob) => {
      blob = b;
      return 'blob:mock';
    });
    exportCsv(
      [
        ['Mes', 'Total'],
        ['abr 26', 2],
      ],
      'data.csv'
    );
    expect(blob?.type).toBe('text/csv;charset=utf-8;');
    const bytes = await new Promise<Uint8Array>((resolve) => {
      const reader = new FileReader();
      reader.onload = () =>
        resolve(new Uint8Array(reader.result as ArrayBuffer));
      reader.readAsArrayBuffer(blob!);
    });
    // UTF-8 BOM, then the CSV body.
    expect(Array.from(bytes.slice(0, 3))).toEqual([0xef, 0xbb, 0xbf]);
    expect(new TextDecoder().decode(bytes.slice(3))).toBe(
      'Mes,Total\r\nabr 26,2'
    );
  });
});
