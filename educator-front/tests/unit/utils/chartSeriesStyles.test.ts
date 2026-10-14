import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CHART_GRAY,
  CHART_ORANGE,
  COMPARE_SERIES_STYLES,
  getSeriesFill,
} from '../../../src/utils/chartSeriesStyles';

const PATTERN = { kind: 'pattern' } as unknown as CanvasPattern;

/** A 2D context that records the drawing calls getSeriesFill makes. */
const mockContext = (pattern: CanvasPattern | null = PATTERN) => {
  const lines: [number, number, number, number][] = [];
  let from: [number, number] = [0, 0];
  const ctx = {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
    fillRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn((x: number, y: number) => {
      from = [x, y];
    }),
    lineTo: vi.fn((x: number, y: number) => {
      lines.push([...from, x, y]);
    }),
    stroke: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    createPattern: vi.fn(() => pattern),
  };
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    ctx as unknown as CanvasRenderingContext2D
  );
  return { ctx, lines };
};

// The main line across the 8px tile in each direction.
const FORWARD = [0, 8, 8, 0]; // "/"
const BACKWARD = [0, 0, 8, 8]; // "\"

afterEach(() => {
  vi.restoreAllMocks();
});

describe('COMPARE_SERIES_STYLES', () => {
  it('gives every series its own fill, so none relies on colour alone', () => {
    const fills = COMPARE_SERIES_STYLES.map((style) => style.fill);
    expect(new Set(fills).size).toBe(COMPARE_SERIES_STYLES.length);
    expect(COMPARE_SERIES_STYLES).toHaveLength(5);
  });

  it('alternates the brand colours, starting with solid orange', () => {
    expect(COMPARE_SERIES_STYLES.map((s) => s.color)).toEqual([
      CHART_ORANGE,
      CHART_GRAY,
      CHART_ORANGE,
      CHART_GRAY,
      CHART_ORANGE,
    ]);
    expect(COMPARE_SERIES_STYLES[0]?.fill).toBe('solid');
  });
});

describe('getSeriesFill', () => {
  it('returns the plain colour for a solid fill without drawing', () => {
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext');
    expect(getSeriesFill({ color: CHART_ORANGE, fill: 'solid' })).toBe(
      CHART_ORANGE
    );
    expect(getContext).not.toHaveBeenCalled();
  });

  it('draws "/" stripes on white for a diagonal fill', () => {
    const { ctx, lines } = mockContext();
    expect(getSeriesFill({ color: CHART_GRAY, fill: 'diagonal' })).toBe(
      PATTERN
    );
    expect(ctx.fillRect).toHaveBeenCalledWith(0, 0, 8, 8);
    expect(ctx.strokeStyle).toBe(CHART_GRAY);
    expect(ctx.lineWidth).toBe(2.5);
    expect(lines).toContainEqual(FORWARD);
    expect(lines).not.toContainEqual(BACKWARD);
    expect(ctx.createPattern).toHaveBeenCalledWith(
      expect.any(HTMLCanvasElement),
      'repeat'
    );
  });

  it('draws "\\" stripes for a reverse diagonal fill', () => {
    const { lines } = mockContext();
    getSeriesFill({ color: CHART_ORANGE, fill: 'reverseDiagonal' });
    expect(lines).toContainEqual(BACKWARD);
    expect(lines).not.toContainEqual(FORWARD);
  });

  it('draws both directions for a crosshatch fill', () => {
    const { ctx, lines } = mockContext();
    getSeriesFill({ color: CHART_GRAY, fill: 'crosshatch' });
    expect(lines).toContainEqual(FORWARD);
    expect(lines).toContainEqual(BACKWARD);
    expect(ctx.stroke).toHaveBeenCalledTimes(2);
  });

  it('draws a centred dot for a dots fill', () => {
    const { ctx, lines } = mockContext();
    getSeriesFill({ color: CHART_ORANGE, fill: 'dots' });
    expect(ctx.arc).toHaveBeenCalledWith(4, 4, 1.8, 0, Math.PI * 2);
    expect(ctx.fill).toHaveBeenCalled();
    expect(lines).toHaveLength(0);
  });

  it('falls back to the plain colour without a 2D context', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    expect(getSeriesFill({ color: CHART_GRAY, fill: 'crosshatch' })).toBe(
      CHART_GRAY
    );
  });

  it('falls back to the plain colour when the pattern cannot be made', () => {
    mockContext(null);
    expect(getSeriesFill({ color: CHART_ORANGE, fill: 'dots' })).toBe(
      CHART_ORANGE
    );
  });
});
