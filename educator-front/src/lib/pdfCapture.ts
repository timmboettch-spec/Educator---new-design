import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

export interface PdfCaptureLabels {
  reportId: string;
  page: string;
  of: string;
}

export interface GeneratePdfFromElementOptions {
  elementId: string;
  fileName: string;
  reportId: string;
  labels: PdfCaptureLabels;
  onCloneExtra?: (clonedEl: HTMLElement) => void;
}

function loadLogoImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    let settled = false;

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        reject(new Error('Image load timeout'));
      }
    }, 1500);

    img.onload = () => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve(img);
      }
    };
    img.onerror = (err) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        reject(err);
      }
    };
    img.src = src;

    if (img.complete && img.naturalWidth > 0) {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve(img);
      }
    }
  });
}

function getLogoDataUrl(img: HTMLImageElement): string {
  const canvas = document.createElement('canvas');
  const width = img.naturalWidth || img.width || 200;
  const height = img.naturalHeight || img.height || 50;
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.drawImage(img, 0, 0, width, height);
  }
  return canvas.toDataURL('image/png');
}

export async function generatePdfFromElement({
  elementId,
  fileName,
  reportId,
  labels,
  onCloneExtra,
}: GeneratePdfFromElementOptions): Promise<void> {
  const target = document.getElementById(elementId);
  if (!target) {
    throw new Error(`Element with id "${elementId}" not found.`);
  }

  let measuredBoundaries: number[] = [];
  const captureWidth = 1024;
  const scale = 2;

  let canvas: HTMLCanvasElement;
  try {
    canvas = await html2canvas(target, {
      scale: scale,
      backgroundColor: '#ffffff',
      useCORS: true,
      windowWidth: captureWidth,
      ignoreElements: (element: Element) => {
        return element.classList?.contains('pdf-hide') ?? false;
      },
      onclone: (clonedDoc: Document) => {
        const clonedEl = clonedDoc.getElementById(
          elementId
        ) as HTMLElement | null;
        if (!clonedEl) {
          return;
        }

        // Ensure solid white background and standard 1024px desktop container width for clean A4 printing
        clonedEl.style.backgroundColor = '#ffffff';
        clonedEl.style.minHeight = 'auto';
        clonedEl.style.width = `${captureWidth}px`;
        clonedEl.style.maxWidth = `${captureWidth}px`;
        clonedEl.style.margin = '0 auto';
        clonedEl.style.boxSizing = 'border-box';

        // Expand all constrained max-w-* containers to fill 100% full printable width
        const constrainedContainers = clonedDoc.querySelectorAll<HTMLElement>(
          '.max-w-4xl, .max-w-5xl, .max-w-3xl, .max-w-2xl'
        );
        constrainedContainers.forEach((container) => {
          container.style.maxWidth = '100%';
          container.style.width = '100%';
          container.style.paddingLeft = '0';
          container.style.paddingRight = '0';
          container.style.margin = '0';
        });

        const hideElements =
          clonedDoc.querySelectorAll<HTMLElement>('.pdf-hide');
        hideElements.forEach((el) => {
          el.style.display = 'none';
        });
        if (clonedEl.classList.contains('pdf-hide')) {
          clonedEl.style.display = 'none';
        }

        const pdfOnlyElements =
          clonedDoc.querySelectorAll<HTMLElement>('[data-pdfonly]');
        pdfOnlyElements.forEach((el) => {
          el.style.display = 'inline-block';
        });
        if (clonedEl.hasAttribute('data-pdfonly')) {
          clonedEl.style.display = 'inline-block';
        }

        onCloneExtra?.(clonedEl);

        // html2canvas degrades `inline-flex` / `inline-block` / `inline-table`
        // to plain `inline` layout and ignores `vertical-align: middle` on
        // inline SVGs — the icon ends up baseline-aligned, sitting ~2px
        // above the text center. Fix it with a tiny `translateY` (the only
        // vertical transform html2canvas honors). Do NOT shrink line-height:
        // the natural line box must stay taller than the SVG so the shifted
        // icon is not clipped during rasterization.
        const shiftIconsDown = (container: HTMLElement) => {
          container.style.overflow = 'visible';
          // Grow the pill 2px at the bottom in the clone so the shifted SVG
          // isn't clipped by the rounded border.
          const currentPb = parseFloat(
            getComputedStyle(container).paddingBottom || '0'
          );
          container.style.paddingBottom = `${currentPb + 2}px`;
          const svgs = container.querySelectorAll<SVGElement>(':scope > svg');
          svgs.forEach((svg) => {
            svg.style.verticalAlign = 'middle';
            svg.style.transform = 'translateY(2px)';
            svg.style.overflow = 'visible';
          });
        };

        // Explicit vertical centering for Date & Time header badges in html2canvas
        const dateBadges =
          clonedEl.querySelectorAll<HTMLElement>('[data-date-badge]');
        dateBadges.forEach((badge) => {
          badge.style.display = 'inline-flex';
          badge.style.alignItems = 'center';
          badge.style.justifyContent = 'center';
          badge.style.boxSizing = 'border-box';
          badge.style.paddingTop = '2px';
          badge.style.paddingBottom = '5px';
          badge.style.paddingLeft = '16px';
          badge.style.paddingRight = '16px';
          badge.style.lineHeight = '1';
          badge.style.verticalAlign = 'middle';

          const childSpans = badge.querySelectorAll<HTMLElement>('span');
          childSpans.forEach((span) => {
            span.style.display = 'inline-block';
            span.style.verticalAlign = 'middle';
            span.style.lineHeight = '1';
            span.style.marginTop = '-1px';
            span.style.marginBottom = '0';
          });
        });

        // Explicit vertical alignment for timeline timestamp badges (Clock SVG + timestamp text)
        const timestampBadges = clonedEl.querySelectorAll<HTMLElement>(
          '[data-timestamp-badge]'
        );
        timestampBadges.forEach((badge) => {
          badge.style.display = 'inline-flex';
          badge.style.alignItems = 'center';
          badge.style.verticalAlign = 'middle';
          badge.style.lineHeight = '1';
          badge.style.paddingTop = '1px';
          badge.style.paddingBottom = '3px';
          badge.style.overflow = 'visible';

          const svg = badge.querySelector<SVGElement>('svg');
          if (svg) {
            svg.style.display = 'inline-block';
            svg.style.verticalAlign = 'middle';
            svg.style.transform = 'translateY(1px)';
            svg.style.overflow = 'visible';
          }

          const childSpans = badge.querySelectorAll<HTMLElement>('span');
          childSpans.forEach((span) => {
            span.style.display = 'inline-block';
            span.style.verticalAlign = 'middle';
            span.style.lineHeight = '1';
            span.style.marginTop = '0';
            span.style.marginBottom = '0';
          });
        });

        const iconContainers = clonedEl.querySelectorAll<HTMLElement>(
          "[data-cat-pill], [data-status-pill], [data-hdr-field], span[class*='rounded-full'], span[class*='rounded-md'], span[class*='rounded-lg'], span[class*='rounded-xl'], [class*='badge']"
        );
        iconContainers.forEach((c) => {
          if (
            c.closest(
              "#sec-score, [data-pdf-scorecard], #exec-summary, [data-pdf-card='exec-summary']"
            )
          ) {
            return;
          }
          if (!c.querySelector(':scope > svg')) {
            return;
          }
          shiftIconsDown(c);
        });

        // html2canvas renders CSS `::marker` (list-decimal) at line-top, not
        // aligned with the item text. Replace markers with real inline spans
        // so numbers sit on the same baseline as the text.
        const decimalLists = clonedEl.querySelectorAll<HTMLOListElement>(
          "ol.list-decimal, ol[class*='list-decimal']"
        );
        decimalLists.forEach((ol) => {
          ol.style.listStyle = 'none';
          ol.style.paddingLeft = '0';
          const items = Array.from(ol.children).filter(
            (c) => c.tagName === 'LI'
          ) as HTMLElement[];
          items.forEach((li, i) => {
            li.style.display = 'block';
            li.style.position = 'relative';
            li.style.paddingLeft = '22px';
            li.style.lineHeight = '1.4';
            const marker = clonedDoc.createElement('span');
            marker.textContent = `${i + 1}.`;
            marker.style.position = 'absolute';
            marker.style.left = '0';
            marker.style.top = '0';
            marker.style.width = '18px';
            marker.style.lineHeight = '1.4';
            li.insertBefore(marker, li.firstChild);
          });
        });

        // Flatten card wrappers without affecting badge/icon colors
        const cardElements = clonedDoc.querySelectorAll<HTMLElement>(
          '[data-pdf-card], [data-pdf-rubric], [data-pdf-nobreak]'
        );
        cardElements.forEach((el) => {
          el.style.backgroundColor = 'transparent';
          el.style.backgroundImage = 'none';
          el.style.border = 'none';
          el.style.boxShadow = 'none';
        });

        // Header Border Box for Transcript PDF export only ([data-pdf-header])
        const pdfHeaders =
          clonedDoc.querySelectorAll<HTMLElement>('[data-pdf-header]');
        pdfHeaders.forEach((header) => {
          header.style.border = '2px solid #cbd5e1';
          header.style.borderRadius = '16px';
          header.style.padding = '20px 24px';
          header.style.marginBottom = '24px';
          header.style.backgroundColor = '#ffffff';
          header.style.boxSizing = 'border-box';
          header.style.width = '100%';
        });

        // Outer Transcript Container Border for PDF export only ([data-pdf-transcript-container])
        const transcriptContainers = clonedDoc.querySelectorAll<HTMLElement>(
          '[data-pdf-transcript-container]'
        );
        transcriptContainers.forEach((container) => {
          container.style.border = '2px solid #cbd5e1';
          container.style.borderRadius = '24px';
          container.style.backgroundColor = '#ffffff';
        });

        // Thicker Divider Lines between transcript items for PDF export only ([data-pdf-nobreak])
        const pdfNobreakItems = clonedDoc.querySelectorAll<HTMLElement>(
          '[data-pdf-transcript-container] [data-pdf-nobreak]'
        );
        pdfNobreakItems.forEach((item, idx) => {
          if (idx < pdfNobreakItems.length - 1) {
            item.style.borderBottom = '2px solid #cbd5e1';
            item.style.paddingBottom = '18px';
            item.style.marginBottom = '18px';
          }
        });

        // Add light bottom divider to rubrics
        const rubricElements =
          clonedDoc.querySelectorAll<HTMLElement>('[data-pdf-rubric]');
        rubricElements.forEach((el) => {
          el.style.borderBottom = '1px solid #e9e9e9';
          el.style.paddingBottom = '16px';
          el.style.marginBottom = '16px';
        });

        // Add light bottom divider to Executive Summary
        const execSummary = clonedDoc.querySelector<HTMLElement>(
          "#exec-summary, [data-pdf-card='exec-summary'], [data-pdf-section='exec-summary']"
        );
        if (execSummary) {
          execSummary.style.borderBottom = '1px solid #e9e9e9';
          execSummary.style.paddingBottom = '16px';
          execSummary.style.marginBottom = '16px';
        }

        // Compensate for html2canvas SVG baseline shift in Executive Summary badge & Rubric score badge trophy icons ONLY
        const trophySvgs = clonedDoc.querySelectorAll<SVGElement>(
          "[data-pdf-trophy], #exec-summary svg, [data-pdf-card='exec-summary'] svg, svg.lucide-trophy, [class*='lucide-trophy'], svg.text-amber-500, svg.text-slate-400"
        );
        trophySvgs.forEach((svg) => {
          // Exclude main overall score card big trophy (handled separately with marginTop: 25px)
          if (svg.closest('#sec-score, [data-pdf-scorecard]')) {
            return;
          }
          svg.setAttribute('viewBox', '0 -3 24 29');
          svg.style.overflow = 'visible';
          svg.style.transform = 'translateY(2px)';
          if (svg.parentElement) {
            svg.parentElement.style.overflow = 'visible';
            svg.parentElement.style.minHeight = 'auto';
          }
        });

        // Indent item rows + sub-labels with pl-4 (16px) in PDF clone
        const indentElements = clonedDoc.querySelectorAll<HTMLElement>(
          '[data-pdf-indent], .pdf-indent, [data-pdf-rubric] p, [data-pdf-rubric] .pl-3, [data-pdf-rubric] .pl-4, [data-pdf-rubric] [data-pdf-nobreak]'
        );
        indentElements.forEach((el) => {
          el.style.paddingLeft = '16px';
        });

        // ── B-04 PDF Score Card Styling ──
        const scoreLabels = clonedDoc.querySelectorAll<HTMLElement>(
          '[data-pdf-scorelabel]'
        );
        scoreLabels.forEach((el) => {
          el.style.color = '#5f6060';
        });

        const scoreCard = clonedDoc.querySelector<HTMLElement>(
          '#sec-score, [data-pdf-scorecard]'
        );
        if (scoreCard) {
          scoreCard.style.background = '#ffffff';
          scoreCard.style.backgroundImage = 'none';
          scoreCard.style.backgroundColor = '#ffffff';
          scoreCard.style.boxShadow = 'none';

          const scorePill =
            scoreCard.querySelector<HTMLElement>('div.bg-white');
          if (scorePill) {
            scorePill.style.display = 'flex';
            scorePill.style.flexDirection = 'row';
            scorePill.style.alignItems = 'flex-start';
            scorePill.style.justifyContent = 'center';
            scorePill.style.gap = '14px';
            scorePill.style.overflow = 'visible';
            scorePill.style.padding = '20px 32px';

            const trophySvg = scorePill.querySelector<SVGElement>('svg');
            if (trophySvg) {
              trophySvg.style.transform = 'none';
              trophySvg.style.overflow = 'visible';
              trophySvg.style.flexShrink = '0';
              trophySvg.style.width = '40px';
              trophySvg.style.height = '40px';
              // Push trophy down to align with where html2canvas renders "100"
              trophySvg.style.marginTop = '25px';
            }
          }
        }

        const rootRect = clonedEl.getBoundingClientRect();
        const selectors =
          '[data-pdf-nobreak], [data-pdf-card], [data-pdf-rubric], [data-pdf-section], #exec-summary, #sec-score';
        const boundaryElements =
          clonedEl.querySelectorAll<HTMLElement>(selectors);

        const rawBoundaries: number[] = [];
        boundaryElements.forEach((el) => {
          if (el.classList.contains('pdf-hide') || el.closest('.pdf-hide')) {
            return;
          }
          const rect = el.getBoundingClientRect();
          const bottomRel = rect.bottom - rootRect.top;
          if (bottomRel > 0) {
            rawBoundaries.push(bottomRel);
          }
        });

        measuredBoundaries = Array.from(
          new Set(rawBoundaries.map((b) => Math.round(b)))
        ).sort((a, b) => a - b);
      },
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('html2canvas DOM capture error:', err);
    const fallbackCanvas = document.createElement('canvas');
    fallbackCanvas.width = captureWidth * scale;
    fallbackCanvas.height = 600;
    canvas = fallbackCanvas;
  }

  let logoDataUrl = '';
  let logoNaturalWidth = 200;
  let logoNaturalHeight = 50;

  // 1. Try to capture full horizontal brand logo directly from active DOM if available
  const domLogo = document.querySelector<HTMLImageElement>(
    "img[src*='Realityworks_AI_RGB'], img[src*='Realityworks_AI'], img[alt*='Realityworks AI']"
  );
  if (
    domLogo &&
    domLogo.complete &&
    domLogo.naturalWidth > 0 &&
    domLogo.naturalWidth > domLogo.naturalHeight
  ) {
    try {
      logoNaturalWidth = domLogo.naturalWidth || domLogo.width || 200;
      logoNaturalHeight = domLogo.naturalHeight || domLogo.height || 50;
      logoDataUrl = getLogoDataUrl(domLogo);
    } catch {
      // Fallback to loadLogoImage if canvas CORS export fails on DOM element
    }
  }

  // 2. Fallback to network image loading with 1500ms timeout for cold cache
  if (!logoDataUrl) {
    try {
      const logoImg = await loadLogoImage('/Realityworks_AI_RGB.png');
      logoNaturalWidth = logoImg.naturalWidth || logoImg.width || 200;
      logoNaturalHeight = logoImg.naturalHeight || logoImg.height || 50;
      logoDataUrl = getLogoDataUrl(logoImg);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('Logo image could not be loaded for PDF export:', err);
    }
  }

  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'pt',
    format: 'a4',
    compress: true,
  });

  const pageWidthPt = pdf.internal.pageSize.getWidth(); // ~595.28 pt
  const pageHeightPt = pdf.internal.pageSize.getHeight(); // ~841.89 pt

  const logoWidthPt = 144;
  const logoAspectRatio = logoNaturalWidth / logoNaturalHeight;
  const logoHeightPt = logoWidthPt / logoAspectRatio;
  const logoX = (pageWidthPt - logoWidthPt) / 2;
  const logoY = 20;

  const headerSpacing = 15;
  const topOffset = logoY + logoHeightPt + headerSpacing;
  const bottomOffset = 40;
  const marginPt = 36;

  const contentWidthPt = pageWidthPt - marginPt * 2;
  const maxPageContentHeightPt = pageHeightPt - topOffset - bottomOffset;

  // Calculate scaling derived directly from actual rendered canvas width to prevent horizontal distortion
  const actualDomWidthCss = canvas.width / scale || captureWidth;
  const cssToPtScale = contentWidthPt / actualDomWidthCss;
  const maxPageContentHeightCss = maxPageContentHeightPt / cssToPtScale;

  const totalCssHeight = canvas.height / scale;

  const sliceRanges: Array<{ startY: number; endY: number }> = [];
  let currentY = 0;

  while (currentY < totalCssHeight) {
    const maxBottom = currentY + maxPageContentHeightCss;

    if (maxBottom >= totalCssHeight) {
      sliceRanges.push({ startY: currentY, endY: totalCssHeight });
      break;
    }

    const candidates = measuredBoundaries.filter(
      (b) => b > currentY && b <= maxBottom
    );

    let nextY: number;
    if (candidates.length > 0) {
      nextY = Math.max(...candidates);
    } else {
      // Single block taller than entire A4 page -> hard cut exception
      nextY = maxBottom;
    }

    if (nextY <= currentY) {
      nextY = maxBottom;
    }

    sliceRanges.push({ startY: currentY, endY: nextY });
    currentY = nextY;
  }

  const totalPages = sliceRanges.length;

  // Render each page slice into jsPDF
  for (let i = 0; i < totalPages; i++) {
    if (i > 0) {
      pdf.addPage();
    }

    pdf.setFillColor(255, 255, 255);
    pdf.rect(0, 0, pageWidthPt, pageHeightPt, 'F');

    if (logoDataUrl) {
      pdf.addImage(logoDataUrl, 'PNG', logoX, logoY, logoWidthPt, logoHeightPt);
    }

    const slice = sliceRanges[i];
    const sliceCssHeight = slice.endY - slice.startY;
    const sliceCanvasHeight = Math.max(1, Math.round(sliceCssHeight * scale));
    const sliceCanvasWidth = canvas.width;
    const sliceTopCanvas = Math.round(slice.startY * scale);

    const sliceCanvas = document.createElement('canvas');
    sliceCanvas.width = sliceCanvasWidth;
    sliceCanvas.height = sliceCanvasHeight;

    const ctx = sliceCanvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, sliceCanvasWidth, sliceCanvasHeight);
      ctx.drawImage(
        canvas,
        0,
        sliceTopCanvas,
        sliceCanvasWidth,
        sliceCanvasHeight,
        0,
        0,
        sliceCanvasWidth,
        sliceCanvasHeight
      );
    }

    const sliceImgData = sliceCanvas.toDataURL('image/jpeg', 0.92);
    const slicePtHeight = sliceCssHeight * cssToPtScale;

    pdf.addImage(
      sliceImgData,
      'JPEG',
      marginPt,
      topOffset,
      contentWidthPt,
      slicePtHeight,
      undefined,
      'FAST'
    );
    pdf.setFontSize(9);
    pdf.setTextColor(100, 100, 100);

    const leftText = `${labels.reportId}: ${reportId}`;
    pdf.text(leftText, marginPt, pageHeightPt - 20);

    const rightText = `${labels.page} ${i + 1} ${labels.of} ${totalPages}`;
    const rightTextWidth = pdf.getTextWidth(rightText);
    pdf.text(
      rightText,
      pageWidthPt - marginPt - rightTextWidth,
      pageHeightPt - 20
    );
  }

  // Trigger Download
  pdf.save(fileName);
}
