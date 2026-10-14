/** Brand chart colours: orange and gray (design: educator-front). */
export const CHART_ORANGE = '#db8833';
export const CHART_GRAY = '#5f6060';

type SeriesFill =
  'solid' | 'diagonal' | 'dots' | 'crosshatch' | 'reverseDiagonal';

export interface CompareSeriesStyle {
  color: string;
  fill: SeriesFill;
}

/**
 * Compare series, in order. Every series has its own fill shape, so none is told apart
 * by colour alone: orange and gray are only 2.28:1, under the 3:1 WCAG 1.4.11 asks of
 * chart graphics, and look alike in a grayscale print of the export.
 */
export const COMPARE_SERIES_STYLES: CompareSeriesStyle[] = [
  { color: CHART_ORANGE, fill: 'solid' },
  { color: CHART_GRAY, fill: 'diagonal' },
  { color: CHART_ORANGE, fill: 'dots' },
  { color: CHART_GRAY, fill: 'crosshatch' },
  { color: CHART_ORANGE, fill: 'reverseDiagonal' },
];

const PATTERN_SIZE = 8;
const STRIPE_WIDTH = 2.5;
const DOT_RADIUS = 1.8;

/**
 * One diagonal across the tile plus the corner pieces that join it to the next tile:
 * `/` runs bottom-left to top-right, `\` top-left to bottom-right.
 */
function drawDiagonal(ctx: CanvasRenderingContext2D, direction: '/' | '\\') {
  const s = PATTERN_SIZE;
  ctx.lineWidth = STRIPE_WIDTH;
  ctx.beginPath();
  if (direction === '/') {
    ctx.moveTo(0, s);
    ctx.lineTo(s, 0);
    ctx.moveTo(-2, 2);
    ctx.lineTo(2, -2);
    ctx.moveTo(s - 2, s + 2);
    ctx.lineTo(s + 2, s - 2);
  } else {
    ctx.moveTo(0, 0);
    ctx.lineTo(s, s);
    ctx.moveTo(s - 2, -2);
    ctx.lineTo(s + 2, 2);
    ctx.moveTo(-2, s - 2);
    ctx.lineTo(2, s + 2);
  }
  ctx.stroke();
}

function drawDots(ctx: CanvasRenderingContext2D) {
  ctx.beginPath();
  ctx.arc(PATTERN_SIZE / 2, PATTERN_SIZE / 2, DOT_RADIUS, 0, Math.PI * 2);
  ctx.fill();
}

/**
 * A bar fill for the style: the plain colour for `solid`, else a repeating pattern on
 * white. Falls back to the plain colour where canvas isn't available.
 */
export function getSeriesFill(
  style: CompareSeriesStyle
): string | CanvasPattern {
  if (style.fill === 'solid' || typeof document === 'undefined') {
    return style.color;
  }
  const canvas = document.createElement('canvas');
  canvas.width = PATTERN_SIZE;
  canvas.height = PATTERN_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) return style.color;

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, PATTERN_SIZE, PATTERN_SIZE);
  ctx.fillStyle = style.color;
  ctx.strokeStyle = style.color;
  switch (style.fill) {
    case 'diagonal':
      drawDiagonal(ctx, '/');
      break;
    case 'reverseDiagonal':
      drawDiagonal(ctx, '\\');
      break;
    case 'crosshatch':
      drawDiagonal(ctx, '/');
      drawDiagonal(ctx, '\\');
      break;
    case 'dots':
      drawDots(ctx);
      break;
  }
  return ctx.createPattern(canvas, 'repeat') ?? style.color;
}
