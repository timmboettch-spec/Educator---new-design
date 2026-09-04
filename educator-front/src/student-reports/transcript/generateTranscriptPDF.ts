import jsPDF from 'jspdf';
import { sanitizePdfText } from '../../lib/utils';
import {
  EDUCATION_LABEL_MAP,
  EDUCATION_ORDER,
  VERIFICATION_LABEL_MAP,
  VERIFICATION_ORDER,
  normalizeChecklistList,
} from './MedicationTranscriptCard';
import type { AssessmentReport } from '../../types/assessmentReport';
import type { TimelineItem, SummaryEntry } from './types';

export interface TranscriptPDFData {
  reportId: string;
  timelineItems: TimelineItem[];
  vitalsMapState: Record<string, Array<{ title?: string; details?: string }>> | null;
  report: AssessmentReport | null;
  displayClassName: string | undefined;
  realSessionStartTime: string | null;
  simulationStartDate: string | null;
  simulationStartTime: string | null;
}

export interface BuildTranscriptPDFOptions {
  returnDoc?: boolean;
}

const formatDurationLabel = (seconds: number): string => {
  const safeValue = Math.max(0, Math.round(seconds));
  if (safeValue < 60) return `${safeValue}s`;
  const mins = Math.floor(safeValue / 60);
  const secs = safeValue % 60;
  return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
};

const formatActionType = (type: string): string => {
  switch (type) {
    case "single": return "Multiple Choice Question";
    case "question": return "Open-Ended Question";
    case "ordering": return "Sequential Question";
    case "vital-signs": return "Vital Signs";
    default: return type;
  }
};

export function buildTranscriptPDF(
  data: TranscriptPDFData,
  opts?: BuildTranscriptPDFOptions,
): jsPDF {
    const pdf = new jsPDF({ unit: "mm", format: "a4" });

    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // Layout & theme constants
    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const PAGE_W = pdf.internal.pageSize.getWidth();
    const PAGE_H = pdf.internal.pageSize.getHeight();
    const MARGIN_L = 14;
    const MARGIN_R = 14;
    const CONTENT_W = PAGE_W - MARGIN_L - MARGIN_R;
    const FOOTER_Y = PAGE_H - 10;
    const CONTENT_BOTTOM = PAGE_H - 18; // keep clear of footer

    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // Color palette â€” exact match to UI constants.tsx
    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    type RGB = [number, number, number];

    // Base colors
    const C_BRAND: RGB = [232, 84, 26]; // #E8541A (brand orange)
    const C_WHITE: RGB = [255, 255, 255];
    const C_GRAY50: RGB = [249, 250, 251];
    const C_GRAY100: RGB = [243, 244, 246];
    const C_GRAY200: RGB = [229, 231, 235];
    const C_GRAY400: RGB = [156, 163, 175];
    const C_GRAY500: RGB = [107, 114, 128];
    const C_GRAY600: RGB = [75, 85, 99];
    const C_GRAY700: RGB = [55, 65, 81];
    const C_GRAY900: RGB = [17, 24, 39];
    const C_TEXT_PRIMARY: RGB = C_GRAY900;
    const C_TEXT_SECONDARY: RGB = C_GRAY600;
    const C_TEXT_MUTED: RGB = C_GRAY500;

    // Speaker â€” User / student_team_comm â†’ orange (#db8833)
    const C_STUDENT_TEXT: RGB = [251, 96, 51];
    const C_STUDENT_BG: RGB = [255, 240, 235]; // #FFF0EB
    const C_STUDENT_BORDER: RGB = [255, 231, 224]; // #FFE7E0
    const C_STUDENT_BUBBLE: RGB = [254, 242, 242]; // #fef2f2 â€” matches web UI

    // Speaker â€” Patient (assistant) â†’ teal
    const C_PATIENT_TEXT: RGB = [13, 148, 136]; // teal-600
    const C_PATIENT_BG: RGB = [240, 253, 250]; // teal-50
    const C_PATIENT_BORDER: RGB = [153, 246, 228]; // teal-200 (visible teal border)
    const C_PATIENT_BUBBLE: RGB = [240, 253, 244]; // #f0fdf4 â€” matches web UI

    // Speaker â€” Provider â†’ blue
    const C_PROVIDER_TEXT: RGB = [37, 99, 235]; // blue-600
    const C_PROVIDER_BG: RGB = [239, 246, 255]; // blue-50
    const C_PROVIDER_BORDER: RGB = [219, 234, 254]; // blue-100
    const C_PROVIDER_BUBBLE: RGB = [246, 249, 255];

    // Speaker â€” Orders (order) â†’ pink
    const C_ORDER_TEXT: RGB = [219, 39, 119]; // pink-600
    const C_ORDER_BG: RGB = [253, 242, 248]; // pink-50
    const C_ORDER_BORDER: RGB = [252, 231, 243]; // pink-100

    // Speaker â€” sbar_report (Team Communication) â†’ primary-600
    const C_SBAR_TEXT: RGB = [234, 88, 12]; // primary-600
    const C_SBAR_BG: RGB = [255, 247, 237]; // primary-50
    const C_SBAR_BORDER: RGB = [255, 237, 213]; // primary-100

    // System â†’ gray
    const C_SYSTEM_TEXT: RGB = C_GRAY500;
    const C_SYSTEM_BG: RGB = C_GRAY50;
    const C_SYSTEM_BORDER: RGB = C_GRAY100;

    // Category â€” vitals â†’ green
    const C_VITAL_TEXT: RGB = [21, 128, 61]; // green-700
    const C_VITAL_BG: RGB = [240, 253, 244]; // #F0FDF4
    const C_VITAL_BORDER: RGB = [187, 247, 208]; // #BBF7D0

    // Category â€” demographics â†’ primary-700
    const C_DEMO_TEXT: RGB = [194, 65, 12]; // primary-700
    const C_DEMO_BG: RGB = C_GRAY50;
    const C_DEMO_BORDER: RGB = C_GRAY100;

    // Category â€” history â†’ blue-700
    const C_HIST_TEXT: RGB = [29, 78, 216]; // blue-700
    const C_HIST_BG: RGB = [240, 247, 255]; // #F0F7FF
    const C_HIST_BORDER: RGB = [191, 219, 254]; // #BFDBFE

    // Category â€” actions / clinical â†’ blue (matches web UI #eff6ff)
    const C_ACTION_TEXT: RGB = [29, 78, 216]; // blue-700
    const C_ACTION_BG: RGB = [239, 246, 255]; // #eff6ff
    const C_ACTION_BORDER: RGB = [191, 219, 254]; // blue-200 #BFDBFE

    // Category â€” orders â†’ pink (distinct from medication cards)
    const C_ORDERS_TEXT: RGB = [219, 39, 119]; // pink-600
    const C_ORDERS_BG: RGB = [253, 242, 248]; // pink-50
    const C_ORDERS_BORDER: RGB = [252, 231, 243]; // pink-100

    // Category â€” medications â†’ violet-700
    const C_MED_TEXT: RGB = [109, 40, 217]; // violet-700
    const C_MED_BG: RGB = [245, 243, 255]; // #F5F3FF
    const C_MED_BORDER: RGB = [221, 214, 254]; // #DDD6FE

    // Category â€” team_communication â†’ blue-700
    const C_TC_TEXT: RGB = [29, 78, 216];
    const C_TC_BG: RGB = [239, 246, 255];
    const C_TC_BORDER: RGB = [219, 234, 254];

    // Common action types
    const C_INFECTION_TEXT: RGB = [234, 88, 12]; // #EA580C
    const C_INFECTION_BG: RGB = [255, 240, 230]; // #fff0e6 â€” matches web UI
    const C_INFECTION_BORDER: RGB = [254, 215, 170]; // #f6ddc2
    const C_PRIVACY_TEXT: RGB = [13, 148, 136]; // #0D9488
    const C_PRIVACY_BG: RGB = [230, 250, 247]; // #e6faf7 â€” matches web UI
    const C_PRIVACY_BORDER: RGB = [153, 246, 228]; // #99F6E4
    const C_ENV_TEXT: RGB = [37, 99, 235]; // #2563EB
    const C_ENV_BG: RGB = [239, 246, 255]; // #EFF6FF
    const C_ENV_BORDER: RGB = [191, 219, 254]; // #BFDBFE

    // Success / danger
    const C_SUCCESS: RGB = [21, 128, 61]; // emerald-700
    const C_SUCCESS_BG: RGB = [209, 250, 229];
    const C_DANGER: RGB = [220, 38, 38]; // red-600
    const C_DANGER_BG: RGB = [254, 226, 226];

    // Helpers
    const setFill = (rgb: RGB) => pdf.setFillColor(rgb[0], rgb[1], rgb[2]);
    const setDraw = (rgb: RGB) => pdf.setDrawColor(rgb[0], rgb[1], rgb[2]);
    const setText = (rgb: RGB) => pdf.setTextColor(rgb[0], rgb[1], rgb[2]);

    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // Speaker / category metadata helpers (mirror constants.tsx)
    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    type SpeakerIconType =
      | "user"
      | "activity"
      | "message"
      | "clipboard"
      | "filetext"
      | "info";
    type SpeakerMeta = {
      label: string;
      textColor: RGB;
      bgColor: RGB;
      borderColor: RGB;
      bubbleBg: RGB;
      rightAlign: boolean; // student messages are right-aligned
      iconType: SpeakerIconType;
    };
    const getSpeakerMeta = (speaker: string): SpeakerMeta => {
      switch (speaker) {
        case "user":
          return {
            label: "Student",
            textColor: C_STUDENT_TEXT,
            bgColor: C_STUDENT_BG,
            borderColor: C_STUDENT_BORDER,
            bubbleBg: C_STUDENT_BUBBLE,
            rightAlign: true, // student bubbles are right-aligned in web UI
            iconType: "user",
          };
        case "student_team_comm":
          return {
            label: "Student Response - Team Communication",
            textColor: C_STUDENT_TEXT,
            bgColor: C_STUDENT_BG,
            borderColor: C_STUDENT_BORDER,
            bubbleBg: C_STUDENT_BUBBLE,
            rightAlign: true, // student bubbles are right-aligned in web UI
            iconType: "user",
          };
        case "provider":
          return {
            label: "Provider",
            textColor: C_PROVIDER_TEXT,
            bgColor: C_PROVIDER_BG,
            borderColor: C_PROVIDER_BORDER,
            bubbleBg: C_PROVIDER_BUBBLE,
            rightAlign: false,
            iconType: "message",
          };
        case "sbar_report":
          return {
            label: "Team Communication",
            textColor: C_SBAR_TEXT,
            bgColor: C_SBAR_BG,
            borderColor: C_SBAR_BORDER,
            bubbleBg: C_SBAR_BG,
            rightAlign: false,
            iconType: "filetext",
          };
        case "order":
          return {
            label: "Orders",
            textColor: C_ORDER_TEXT,
            bgColor: C_ORDER_BG,
            borderColor: C_ORDER_BORDER,
            bubbleBg: C_ORDER_BG,
            rightAlign: false,
            iconType: "clipboard",
          };
        case "system":
          return {
            label: "System",
            textColor: C_SYSTEM_TEXT,
            bgColor: C_SYSTEM_BG,
            borderColor: C_SYSTEM_BORDER,
            bubbleBg: C_SYSTEM_BG,
            rightAlign: false,
            iconType: "info",
          };
        default: // assistant = Patient
          return {
            label: "Patient",
            textColor: C_PATIENT_TEXT,
            bgColor: C_PATIENT_BG,
            borderColor: C_PATIENT_BORDER,
            bubbleBg: C_PATIENT_BUBBLE,
            rightAlign: false,
            iconType: "activity",
          };
      }
    };

    type CategoryMeta = {
      label: string;
      textColor: RGB;
      bgColor: RGB;
      borderColor: RGB;
    };
    const getCategoryMetaPdf = (
      category?: string,
      title?: string,
    ): CategoryMeta => {
      if (title === "Team Communication") {
        return {
          label: "Team Communication",
          textColor: C_TC_TEXT,
          bgColor: C_TC_BG,
          borderColor: C_TC_BORDER,
        };
      }
      const c = (category ?? "").toLowerCase();
      if (c === "vitals") {
        return {
          label: "Vitals",
          textColor: C_VITAL_TEXT,
          bgColor: C_VITAL_BG,
          borderColor: C_VITAL_BORDER,
        };
      }
      if (c === "demographics") {
        return {
          label: "Demographics",
          textColor: C_DEMO_TEXT,
          bgColor: C_DEMO_BG,
          borderColor: C_DEMO_BORDER,
        };
      }
      if (c === "history") {
        return {
          label: "History",
          textColor: C_HIST_TEXT,
          bgColor: C_HIST_BG,
          borderColor: C_HIST_BORDER,
        };
      }
      if (c === "actions" || c === "action" || c === "clinical") {
        return {
          label: "Actions",
          textColor: C_ACTION_TEXT,
          bgColor: C_ACTION_BG,
          borderColor: C_ACTION_BORDER,
        };
      }
      if (c === "orders") {
        return {
          label: "Orders",
          textColor: C_ORDERS_TEXT,
          bgColor: C_ORDERS_BG,
          borderColor: C_ORDERS_BORDER,
        };
      }
      if (c === "medications") {
        return {
          label: "Medications",
          textColor: C_MED_TEXT,
          bgColor: C_MED_BG,
          borderColor: C_MED_BORDER,
        };
      }
      if (c === "ppe" || c === "safety") {
        return {
          label: "Common Actions",
          textColor: C_INFECTION_TEXT,
          bgColor: C_INFECTION_BG,
          borderColor: C_INFECTION_BORDER,
        };
      }
      return {
        label: category ?? "Summary",
        textColor: C_GRAY700,
        bgColor: C_GRAY50,
        borderColor: C_GRAY100,
      };
    };

    const getCommonActionMeta = (
      type: string,
    ): { textColor: RGB; bgColor: RGB; borderColor: RGB } => {
      if (type === "privacy") {
        return {
          textColor: C_PRIVACY_TEXT,
          bgColor: C_PRIVACY_BG,
          borderColor: C_PRIVACY_BORDER,
        };
      }
      if (type === "environmental") {
        return {
          textColor: C_ENV_TEXT,
          bgColor: C_ENV_BG,
          borderColor: C_ENV_BORDER,
        };
      }
      return {
        textColor: C_INFECTION_TEXT,
        bgColor: C_INFECTION_BG,
        borderColor: C_INFECTION_BORDER,
      }; // infection (default)
    };

    let yPosition = 0;
    let pageNumber = 1;
    // Tracks the active card's background colour while drawContent runs.
    // drawPageHeader reads this so it can paint the continuation background BEFORE
    // any content is written on the new page (jsPDF appends to the stream, so the
    // only way to paint behind content is to paint it first).
    let activeCardBg: RGB | null = null;

    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // Header / footer helpers
    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const drawFooter = () => {
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(8);
      setText(C_TEXT_MUTED);
      const footerLeft = sanitizePdfText(`Full User Transcript  ${data.reportId}`);
      pdf.text(footerLeft, MARGIN_L, FOOTER_Y);
      const pageLabel = `Page ${pageNumber}`;
      const w = pdf.getTextWidth(pageLabel);
      pdf.text(pageLabel, PAGE_W - MARGIN_R - w, FOOTER_Y);
    };

    const drawPageHeader = () => {
      // Orange brand strip at top
      setFill(C_BRAND);
      pdf.rect(0, 0, PAGE_W, 14, "F");
      setText(C_WHITE);
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(12);
      pdf.text(sanitizePdfText("Full User Transcript"), MARGIN_L, 9);
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(9);
      const rightMeta = sanitizePdfText(
        `Generated ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}`,
      );
      const rw = pdf.getTextWidth(rightMeta);
      pdf.text(rightMeta, PAGE_W - MARGIN_R - rw, 9);
      setText(C_TEXT_PRIMARY);
      yPosition = 24; // 10mm gap below the 14mm header strip

      // If we are continuing a card across pages, paint its background fill
      // BEFORE any content is drawn on this page. Because jsPDF appends draw
      // operations to the end of the page stream, this ensures the background
      // sits behind subsequent content rather than over it.
      if (activeCardBg) {
        setFill(activeCardBg);
        pdf.rect(MARGIN_L, 24, CONTENT_W, CONTENT_BOTTOM - 24 + 6, "F");
      }
    };

    const ensureSpace = (needed: number) => {
      if (yPosition + needed > CONTENT_BOTTOM) {
        drawFooter();
        pdf.addPage();
        pageNumber += 1;
        drawPageHeader();
      }
    };

    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // Primitive helpers â€” matches UI card structure
    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    /** Format epoch ms as "Jan 01, 06:15" â€” matches formatAdminDate() in MedicationTranscriptCard (short, no year, 24h) */
    const fmtAdminDate = (ms: number | null | undefined): string => {
      if (!ms) {
        return "";
      }
      try {
        const d = new Date(ms);
        if (isNaN(d.getTime())) {
          return "";
        }
        return d.toLocaleString("en-US", {
          month: "short",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        });
      } catch {
        return "";
      }
    };

    /** Format epoch ms as "mm/dd/yyyy, HH:MM:SS" â€” matches formatWallClock() */
    const fmtWallClock = (ms: number | null | undefined): string => {
      if (!ms) {
        return "";
      }
      try {
        const d = new Date(ms);
        if (isNaN(d.getTime())) {
          return "";
        }
        return d.toLocaleString("en-US", {
          month: "2-digit",
          day: "2-digit",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false,
        });
      } catch {
        return "";
      }
    };

    /**
     * Draw the small rounded elapsed-time badge (Row 1 of each timeline item).
     * Returns badge height.
     */
    const drawClockBadge = (
      time: string,
      textColor: RGB,
      bgColor: RGB,
      borderColor: RGB,
      drawAtY?: number, // if supplied, draws at this Y instead of yPosition
    ): number => {
      const fontSize = 9;
      const padX = 3;
      const padY = 1.8;
      const iconD = 3.2; // clock icon diameter
      const iconGap = 1.8;
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(fontSize);
      const label = sanitizePdfText(time);
      const tw = pdf.getTextWidth(label);
      const bw = padX + iconD + iconGap + tw + padX;
      const bh = fontSize * 0.42 + padY * 2;
      const ry = drawAtY ?? yPosition;
      // Pill background
      setFill(bgColor);
      setDraw(borderColor);
      pdf.setLineWidth(0.3);
      pdf.roundedRect(MARGIN_L, ry, bw, bh, 1.5, 1.5, "FD");
      // Clock icon: circle outline + two hands
      const iconR = iconD / 2;
      const iconCX = MARGIN_L + padX + iconR;
      const iconCY = ry + bh / 2;
      setDraw(textColor);
      pdf.setLineWidth(0.25);
      pdf.circle(iconCX, iconCY, iconR, "S");
      // Minute hand (pointing up ~12)
      pdf.line(iconCX, iconCY, iconCX, iconCY - iconR + 0.4);
      // Hour hand (pointing right ~3)
      pdf.line(iconCX, iconCY, iconCX + iconR - 0.5, iconCY);
      // Time text
      setText(textColor);
      pdf.setLineWidth(0.3);
      pdf.text(label, MARGIN_L + padX + iconD + iconGap, ry + bh - padY - 0.3);
      return bh;
    };

    /**
     * Draw speaker-specific icon at (cx, cy) within a szÃ—sz bounding box.
     */
    const drawSpeakerIcon = (
      iconType: SpeakerIconType,
      cx: number,
      cy: number,
      sz: number,
      color: RGB,
    ) => {
      setFill(color);
      setDraw(color);
      pdf.setLineWidth(0.3);
      switch (iconType) {
        case "user": {
          // Head circle
          const headR = sz * 0.24;
          const headCY = cy - sz * 0.14;
          pdf.circle(cx, headCY, headR, "F");
          // Shoulders arc (rounded rect)
          const bw = sz * 0.62;
          const bh = sz * 0.3;
          pdf.roundedRect(
            cx - bw / 2,
            headCY + headR + sz * 0.04,
            bw,
            bh,
            bw / 4,
            bw / 4,
            "F",
          );
          break;
        }
        case "activity": {
          // EKG / pulse wave â€” wider segments so it reads correctly at small sizes
          pdf.setLineWidth(0.4);
          const y0 = cy;
          // flat left
          pdf.line(cx - sz * 0.5, y0, cx - sz * 0.22, y0);
          // rise to peak
          pdf.line(cx - sz * 0.22, y0, cx - sz * 0.1, y0 - sz * 0.4);
          // drop through baseline to trough
          pdf.line(cx - sz * 0.1, y0 - sz * 0.4, cx + sz * 0.1, y0 + sz * 0.4);
          // rise back to baseline
          pdf.line(cx + sz * 0.1, y0 + sz * 0.4, cx + sz * 0.22, y0);
          // flat right
          pdf.line(cx + sz * 0.22, y0, cx + sz * 0.5, y0);
          break;
        }
        case "message": {
          // Rounded speech bubble
          const bx = cx - sz * 0.4,
            by = cy - sz * 0.38;
          const bw = sz * 0.8,
            bh = sz * 0.6;
          pdf.roundedRect(bx, by, bw, bh, 0.8, 0.8, "S");
          // Tail
          pdf.line(bx + sz * 0.1, by + bh, bx, by + bh + sz * 0.22);
          pdf.line(bx, by + bh + sz * 0.22, bx + sz * 0.32, by + bh);
          break;
        }
        case "clipboard": {
          const bx = cx - sz * 0.33,
            by = cy - sz * 0.36;
          const bw = sz * 0.66,
            bh = sz * 0.68;
          pdf.roundedRect(
            bx,
            by + sz * 0.09,
            bw,
            bh - sz * 0.04,
            0.5,
            0.5,
            "S",
          );
          // Clip at top
          const cw = sz * 0.3,
            ch = sz * 0.14;
          pdf.roundedRect(cx - cw / 2, by, cw, ch, ch / 2, ch / 2, "S");
          // Lines
          const lx1 = bx + sz * 0.1,
            lx2 = bx + bw - sz * 0.1;
          pdf.line(lx1, by + bh * 0.38, lx2, by + bh * 0.38);
          pdf.line(lx1, by + bh * 0.55, lx2, by + bh * 0.55);
          pdf.line(lx1, by + bh * 0.72, lx2 - sz * 0.14, by + bh * 0.72);
          break;
        }
        case "filetext": {
          const bx = cx - sz * 0.32,
            by = cy - sz * 0.4;
          const bw = sz * 0.64,
            bh = sz * 0.78;
          const fold = sz * 0.18;
          pdf.roundedRect(bx, by, bw, bh, 0.4, 0.4, "S");
          // Fold corner
          pdf.line(bx + bw - fold, by, bx + bw - fold, by + fold);
          pdf.line(bx + bw - fold, by + fold, bx + bw, by + fold);
          // Lines
          const lx1 = bx + sz * 0.1,
            lx2 = bx + bw - sz * 0.1;
          pdf.line(lx1, by + bh * 0.42, lx2, by + bh * 0.42);
          pdf.line(lx1, by + bh * 0.58, lx2, by + bh * 0.58);
          pdf.line(lx1, by + bh * 0.74, lx2 - sz * 0.14, by + bh * 0.74);
          break;
        }
        case "info": {
          pdf.circle(cx, cy, sz * 0.44, "S");
          pdf.circle(cx, cy - sz * 0.17, sz * 0.06, "F");
          pdf.setLineWidth(0.4);
          pdf.line(cx, cy - sz * 0.04, cx, cy + sz * 0.22);
          break;
        }
      }
    };

    /**
     * Draw a fully-rounded pill badge (rounded-full in Tailwind).
     * Returns { width, height }.
     */
    const drawPill = (
      label: string,
      x: number,
      y: number,
      textColor: RGB,
      bgColor: RGB,
      borderColor: RGB,
      opts: {
        fontSize?: number;
        bold?: boolean;
        iconType?: SpeakerIconType;
      } = {},
    ): { width: number; height: number } => {
      const fontSize = opts.fontSize ?? 7.5;
      const padX = 2.8;
      const padY = 1.3;
      pdf.setFont("helvetica", opts.bold !== false ? "bold" : "normal");
      pdf.setFontSize(fontSize);
      const text = sanitizePdfText(label.toUpperCase());
      const tw = pdf.getTextWidth(text);
      const bh = fontSize * 0.42 + padY * 2;
      const iconSz = opts.iconType ? bh * 0.72 : 0;
      const iconGap = opts.iconType ? 1.6 : 0;
      const bw = padX + iconSz + iconGap + tw + padX;
      setFill(bgColor);
      setDraw(borderColor);
      pdf.setLineWidth(0.25);
      pdf.roundedRect(x, y, bw, bh, bh / 2, bh / 2, "FD"); // rounded-full
      if (opts.iconType) {
        const iconCX = x + padX + iconSz / 2;
        const iconCY = y + bh / 2;
        drawSpeakerIcon(opts.iconType, iconCX, iconCY, iconSz, textColor);
      }
      setText(textColor);
      pdf.text(text, x + padX + iconSz + iconGap, y + bh - padY - 0.3);
      return { width: bw, height: bh };
    };

    /**
     * Draw a small status pill (Not Given / Administered / etc.)
     */
    const drawStatusPill = (
      label: string,
      x: number,
      y: number,
      textColor: RGB,
      bgColor: RGB,
      borderColor: RGB,
    ): { width: number; height: number } => {
      return drawPill(label, x, y, textColor, bgColor, borderColor, {
        fontSize: 7,
        bold: true,
      });
    };

    /**
     * Draw a sub-box inside a card (Clinical Prompt / Student Response / Notes).
     * Returns total height consumed.
     */
    const drawSubBox = (
      labelText: string,
      valueText: string,
      labelColor: RGB,
      bgColor: RGB,
      borderColor: RGB,
      innerX: number,
      innerW: number,
      items?: string[], // optional: render as numbered list with hanging indent
    ): number => {
      const rowH = 4.4;
      const itemGap = 1.5; // gap between list items (matches web UI space-y-1)
      const numW = 7; // width reserved for "22. " prefix (number + dot + space)
      const textXItems = innerX + 3 + numW;
      const textW = innerW - 6 - numW;
      const LABEL_H = 9; // top-padding + label row height inside the box
      const BOTTOM_PAD = 6;

      if (items && items.length > 0) {
        // â”€â”€ Numbered list: split across pages as needed â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        // Pre-compute lines for each item so we can chunk them by page.
        const parsed: { num: string; lines: string[] }[] = items.map(
          (item, i) => ({
            num: `${i + 1}.`,
            lines: pdf.splitTextToSize(
              sanitizePdfText(item.trim()),
              textW,
            ) as string[],
          }),
        );

        // Split into page-sized chunks.
        type ItemChunk = {
          startGlobalIdx: number;
          parsed: { num: string; lines: string[] }[];
        };
        const chunks: ItemChunk[] = [];
        let curChunk: ItemChunk = { startGlobalIdx: 0, parsed: [] };
        // Available body height on first page (already positioned at yPosition)
        let avail = CONTENT_BOTTOM - (yPosition + 1) - LABEL_H - BOTTOM_PAD;
        let usedH = 0;

        parsed.forEach((p, i) => {
          const itemH =
            p.lines.length * rowH + (curChunk.parsed.length > 0 ? itemGap : 0);
          if (curChunk.parsed.length > 0 && usedH + itemH > avail) {
            chunks.push(curChunk);
            curChunk = { startGlobalIdx: i, parsed: [p] };
            usedH = p.lines.length * rowH;
            // Subsequent pages: full content area
            avail = CONTENT_BOTTOM - 24 - LABEL_H - BOTTOM_PAD;
          } else {
            if (curChunk.parsed.length === 0) {
              curChunk.startGlobalIdx = i;
            }
            curChunk.parsed.push(p);
            usedH += itemH;
          }
        });
        if (curChunk.parsed.length > 0) {
          chunks.push(curChunk);
        }

        // Render each chunk as its own box (page break between chunks)
        let totalConsumed = 0;
        chunks.forEach((chunk, ci) => {
          if (ci > 0) {
            drawFooter();
            pdf.addPage();
            pageNumber += 1;
            drawPageHeader();
          }
          // Height of this chunk's box
          const bodyH = chunk.parsed.reduce(
            (h, p, j) => h + p.lines.length * rowH + (j > 0 ? itemGap : 0),
            0,
          );
          const chunkBoxH = LABEL_H + bodyH + BOTTOM_PAD;
          const boxY = yPosition + 1;

          setFill(bgColor);
          setDraw(borderColor);
          pdf.setLineWidth(0.25);
          pdf.roundedRect(innerX, boxY, innerW, chunkBoxH, 2, 2, "FD");

          // label (show "CONT." for continuation chunks)
          pdf.setFont("helvetica", "bold");
          pdf.setFontSize(7.5);
          setText(labelColor);
          const lbl =
            ci === 0
              ? sanitizePdfText(labelText.toUpperCase())
              : sanitizePdfText(`${labelText.toUpperCase()} (CONT.)`);
          pdf.text(lbl, innerX + 3, boxY + 4);

          // items
          pdf.setFont("helvetica", "normal");
          pdf.setFontSize(11.25);
          setText(C_TEXT_PRIMARY);
          let yPos = boxY + LABEL_H;
          chunk.parsed.forEach((p, j) => {
            if (j > 0) {
              yPos += itemGap;
            }
            pdf.text(p.num, innerX + 3, yPos);
            pdf.text(p.lines, textXItems, yPos);
            yPos += p.lines.length * rowH;
          });

          const chunkTotal = chunkBoxH + 2;
          yPosition += chunkTotal;
          totalConsumed += chunkTotal;
        });

        return totalConsumed;
      }

      // â”€â”€ Plain-text sub-box (unchanged) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
      const rowHPlain = 4.4;
      const valueLines = pdf.splitTextToSize(
        sanitizePdfText(valueText),
        innerW - 4,
      ) as string[];
      const estH = 5 + valueLines.length * rowHPlain + 6;

      if (yPosition + estH > CONTENT_BOTTOM) {
        drawFooter();
        pdf.addPage();
        pageNumber += 1;
        drawPageHeader();
      }
      const boxY = yPosition + 1;
      const boxH = estH;
      setFill(bgColor);
      setDraw(borderColor);
      pdf.setLineWidth(0.25);
      pdf.roundedRect(innerX, boxY, innerW, boxH, 2, 2, "FD");
      // label
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(7.5);
      setText(labelColor);
      pdf.text(sanitizePdfText(labelText.toUpperCase()), innerX + 3, boxY + 4);
      // value
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(11.25); // 15px = 11.25pt
      setText(C_TEXT_PRIMARY);
      const reLines = pdf.splitTextToSize(
        sanitizePdfText(valueText),
        innerW - 6,
      ) as string[];
      pdf.text(reLines, innerX + 3, boxY + 9);
      const total = boxH + 2;
      yPosition += total;
      return total;
    };

    /**
     * Detect a medication status string in details and return color + label.
     */
    const getMedStatus = (
      details: string,
    ): { label: string; tc: RGB; bg: RGB; bc: RGB } | null => {
      const d = details;
      if (
        d.includes("Status: Not Given") ||
        d.startsWith("[Not Given]") ||
        d.startsWith("[Hold]")
      ) {
        return {
          label: "Not Given",
          tc: [146, 64, 14] as RGB,
          bg: [254, 243, 199] as RGB,
          bc: [253, 230, 138] as RGB,
        };
      }
      if (
        d.includes("Status: Refused") ||
        d.startsWith("[Refused]") ||
        d.startsWith("[Refuse]")
      ) {
        return {
          label: "Refused",
          tc: [159, 18, 57] as RGB,
          bg: [255, 228, 230] as RGB,
          bc: [254, 205, 211] as RGB,
        };
      }
      if (d.includes("Status: Missed") || d.startsWith("[Missed]")) {
        return {
          label: "Missed",
          tc: [154, 52, 18] as RGB,
          bg: [255, 237, 213] as RGB,
          bc: [254, 215, 170] as RGB,
        };
      }
      if (
        d.includes("Status: Administered") ||
        d.startsWith("[Administered]")
      ) {
        return {
          label: "Administered",
          tc: [6, 95, 70] as RGB,
          bg: [209, 250, 229] as RGB,
          bc: [167, 243, 208] as RGB,
        };
      }
      if (d.includes("Status: Held") || d.startsWith("[Held]")) {
        return {
          label: "Held",
          tc: [146, 64, 14] as RGB,
          bg: [254, 243, 199] as RGB,
          bc: [253, 230, 138] as RGB,
        };
      }
      if (
        d.includes("Status: Inappropriate") ||
        d.startsWith("[Inappropriate]")
      ) {
        return {
          label: "Inappropriate",
          tc: [109, 40, 217] as RGB,
          bg: [237, 233, 254] as RGB,
          bc: [221, 214, 254] as RGB,
        };
      }
      return null;
    };

    /**
     * Render a full bubble card with bg fill.
     * Single-render: pre-check forces a new page if card won't fit, then draw bg, content, clip excess.
     */
    const drawBubbleCard = (
      bgColor: RGB,
      borderColor: RGB,
      drawContent: (innerX: number, innerW: number) => void,
      estimateH: number, // full (uncapped) estimated card height
    ): void => {
      if (yPosition < 30) {
        yPosition = 30;
      }

      // Pre-check: if this card won't fit on the current page, start a new page.
      // Use yPosition > 50 (not 30) so we don't double-jump: ensureSpace already
      // moved to a fresh page and drew the clock badge (yPosition â‰ˆ 34mm after badge).
      // We only page-break here if we are genuinely mid-page, not just past the header.
      const availableSpace = CONTENT_BOTTOM - yPosition;
      if (estimateH > availableSpace && yPosition > 50) {
        drawFooter();
        pdf.addPage();
        pageNumber += 1;
        drawPageHeader();
      }

      const cardX = MARGIN_L;
      const cardW = CONTENT_W;
      const padTop = 6; // matches p-6 (24px â‰ˆ 6.35mm)
      const padSide = 6;
      const padBot = 7;
      const innerX = cardX + padSide;
      const innerW = cardW - padSide * 2;
      const startY = yPosition;
      const startPageNum = pageNumber; // track if content spans pages

      // â”€â”€ 1. Draw bg fill with estimated height first â€” text will render on top
      setFill(bgColor);
      pdf.roundedRect(cardX, startY, cardW, estimateH, 2.5, 2.5, "F");

      // â”€â”€ 2. Draw content (single render)
      // Track this card's colours so drawPageHeader can paint the continuation
      // background before content on any new pages created inside drawContent.
      activeCardBg = bgColor;
      yPosition = startY + padTop;
      drawContent(innerX, innerW);
      activeCardBg = null;

      if (pageNumber !== startPageNum) {
        // Content spanned to a new page (e.g. long ordered list).
        // The continuation background was already painted by drawPageHeader BEFORE
        // any content, so it is correctly behind the content in the PDF stream.
        // We only need to:
        //   a) clip the excess background on the START page
        //   b) draw borders on both pages
        //   c) white-clip the leftover background BELOW content on the END page
        const endPageNum = pageNumber;
        const endY = yPosition;

        pdf.setPage(startPageNum);

        // Original page: card extends to CONTENT_BOTTOM
        const origActualH = CONTENT_BOTTOM - startY + 6;
        // Clip anything below origActualH (bg was drawn for `estimateH`)
        if (origActualH < estimateH) {
          setFill([255, 255, 255]);
          pdf.rect(
            cardX - 0.5,
            startY + origActualH,
            cardW + 1,
            estimateH - origActualH + 3,
            "F",
          );
        }
        // Draw border on original page
        setDraw(borderColor);
        pdf.setLineWidth(0.35);
        pdf.roundedRect(cardX, startY, cardW, origActualH, 2.5, 2.5, "S");

        // Return to the continuation page.
        // The background was already drawn by drawPageHeader (before content).
        // Clip anything below the actual card bottom with white, then draw border.
        pdf.setPage(endPageNum);

        const contStartY = 24; // just below page header
        const contActualH = Math.max(endY + padBot - contStartY, 14);
        // White-clip the excess background below the card bottom (drawn on top of bg)
        setFill([255, 255, 255]);
        pdf.rect(
          cardX - 0.5,
          contStartY + contActualH,
          cardW + 1,
          CONTENT_BOTTOM - (contStartY + contActualH) + 20,
          "F",
        );
        // Draw border on continuation page
        setDraw(borderColor);
        pdf.setLineWidth(0.35);
        pdf.roundedRect(cardX, contStartY, cardW, contActualH, 2.5, 2.5, "S");

        yPosition = endY + 5;
      } else {
        // â”€â”€ Single-page card (original logic) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        const actualH = Math.max(yPosition + padBot - startY, 14);

        // â”€â”€ 3. Clip any excess bg area with white (page-background colour)
        if (actualH < estimateH) {
          setFill([255, 255, 255]);
          // Extend 0.5mm beyond card edges and 2mm extra height to fully cover
          // the rounded bottom corners of the background rect (fixes ghost outline).
          pdf.rect(
            cardX - 0.5,
            startY + actualH,
            cardW + 1,
            estimateH - actualH + 3,
            "F",
          );
        } else if (actualH > estimateH) {
          // Background was too short â€” fill the overflow strip with bgColor,
          // drawn as a plain rect so it merges flush with the rounded-rect above.
          setFill(bgColor);
          pdf.rect(
            cardX,
            startY + estimateH - 0.5,
            cardW,
            actualH - estimateH + 0.5,
            "F",
          );
        }

        // â”€â”€ 4. Draw border at actual height
        setDraw(borderColor);
        pdf.setLineWidth(0.35);
        pdf.roundedRect(cardX, startY, cardW, actualH, 2.5, 2.5, "S");

        yPosition = startY + actualH + 5; // 5mm gap between cards
      }
    };

    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // 1. Title page header
    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    drawPageHeader();

    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // 1b. Centered title + subtitle (matches UI h1 + subtitle)
    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const attemptTypeLabel =
      data.report?.mode === "Practice" ? "Practice" : "Assessment";

    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(36); // 48px = 36pt â€” matches web UI h1 text-[48px]
    setText(C_TEXT_PRIMARY);
    const mainTitle = sanitizePdfText("Full User Transcript");
    const mainTitleW = pdf.getTextWidth(mainTitle);
    // baseline offset so cap sits 2mm below yPosition
    pdf.text(mainTitle, (PAGE_W - mainTitleW) / 2, yPosition + 13);
    yPosition += 22; // title cap-height + 9mm gap
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(13.5); // 18px = 13.5pt â€” matches web UI text-[18px]
    setText(C_TEXT_SECONDARY);
    const subtitle = sanitizePdfText(attemptTypeLabel);
    const subtitleW = pdf.getTextWidth(subtitle);
    pdf.text(subtitle, (PAGE_W - subtitleW) / 2, yPosition);
    yPosition += 9;

    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // 2. User info bar â€” Student Code Â· Class Â· Scenario (matches UI info bar)
    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    if (data.report) {
      const infoItems: string[] = [];
      if (data.report.userId) {
        infoItems.push(`Student Code: ${String(data.report.userId)}`);
      }
      if (data.displayClassName) {
        infoItems.push(`Class: ${data.displayClassName}`);
      }
      const scenarioLabel =
        data.report.scenarioTitle ??
        String(data.report.scenarioId ?? "").replace(/-/g, " ");
      if (scenarioLabel) {
        infoItems.push(`Sim: ${scenarioLabel}`);
      }
      if (infoItems.length > 0) {
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(9);
        setText(C_TEXT_SECONDARY);
        // Build the full string with a plain " | " separator first to measure width,
        // then draw each item + a filled-circle dot between them so the dot renders
        // correctly in jsPDF (the middle-dot U+00B7 is dropped by Helvetica).
        const DOT_GAP = 3.5; // gap on each side of the dot
        const DOT_R = 0.7; // filled circle radius (mm)
        // Measure total width for centring
        let totalW = 0;
        infoItems.forEach((item, i) => {
          totalW += pdf.getTextWidth(sanitizePdfText(item));
          if (i < infoItems.length - 1) {
            totalW += DOT_GAP * 2 + DOT_R * 2;
          }
        });
        let cx = (PAGE_W - totalW) / 2;
        const textBaseY = yPosition;
        infoItems.forEach((item, i) => {
          const txt = sanitizePdfText(item);
          pdf.text(txt, cx, textBaseY);
          cx += pdf.getTextWidth(txt);
          if (i < infoItems.length - 1) {
            cx += DOT_GAP;
            // Draw filled dot at vertical mid of the text (9pt * 0.42 â‰ˆ 3.78mm)
            setFill(C_TEXT_SECONDARY);
            pdf.circle(cx, textBaseY - 1.2, DOT_R, "F");
            cx += DOT_R * 2 + DOT_GAP;
          }
        });
        yPosition += 8;
      }
    }

    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // 3. Date/time badges row â€” Real Date/Time (green) + SIM Date/Time (indigo)
    //    Matches the flex-wrap pill row in the UI
    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    {
      type DateBadge = {
        label: string;
        value: string;
        tc: RGB;
        bg: RGB;
        bc: RGB;
      };
      const dateBadges: DateBadge[] = [];

      const C_GREEN_TEXT: RGB = [21, 128, 61]; // green-700
      const C_GREEN_BG: RGB = [240, 253, 244]; // green-50
      const C_GREEN_BC: RGB = [34, 197, 94]; // green-500 â€” matches border-green-500 in HTML
      const C_BLUE_TEXT: RGB = [29, 78, 216]; // blue-700
      const C_BLUE_BG: RGB = [239, 246, 255]; // blue-50
      const C_BLUE_BC: RGB = [59, 130, 246]; // blue-500 â€” matches border-blue-500 in HTML

      if (data.realSessionStartTime) {
        try {
          const rd = new Date(data.realSessionStartTime);
          if (!isNaN(rd.getTime())) {
            dateBadges.push({
              label: "Real Date",
              value: rd.toLocaleDateString("en-US", {
                month: "long",
                day: "numeric",
                year: "numeric",
              }),
              tc: C_GREEN_TEXT,
              bg: C_GREEN_BG,
              bc: C_GREEN_BC,
            });
            dateBadges.push({
              label: "Real Time",
              value: rd.toLocaleTimeString("en-US", {
                hour: "2-digit",
                minute: "2-digit",
                hour12: false,
              }),
              tc: C_GREEN_TEXT,
              bg: C_GREEN_BG,
              bc: C_GREEN_BC,
            });
          }
        } catch {
          /* skip */
        }
      }
      if (data.simulationStartDate) {
        const dateStr = (() => {
          try {
            const d = new Date(data.simulationStartDate);
            if (!isNaN(d.getTime())) {
              return d.toLocaleDateString("en-US", {
                month: "short",
                day: "2-digit",
              });
            }
          } catch {
            /* fallthrough */
          }
          return String(data.simulationStartDate).replace(/,?\s*\d{4}\s*$/, "");
        })();
        dateBadges.push({
          label: "SIM Date",
          value: dateStr,
          tc: C_BLUE_TEXT,
          bg: C_BLUE_BG,
          bc: C_BLUE_BC,
        });
      }
      if (data.simulationStartTime) {
        let simTimeStr = String(data.simulationStartTime);
        try {
          const d = new Date(data.simulationStartTime);
          if (!isNaN(d.getTime())) {
            simTimeStr = d.toLocaleTimeString("en-US", {
              hour: "2-digit",
              minute: "2-digit",
              hour12: false,
            });
          }
        } catch {
          /* keep raw */
        }
        dateBadges.push({
          label: "SIM Time",
          value: simTimeStr,
          tc: C_BLUE_TEXT,
          bg: C_BLUE_BG,
          bc: C_BLUE_BC,
        });
      }

      if (dateBadges.length > 0) {
        // Render badges â€” each has: [clock icon] [LABEL:] [value]
        // Matches UI: inline-flex items-center gap-2 px-4 py-2 rounded-lg border
        const badgePadX = 4.5; // px-4 (16px â‰ˆ 4.2mm)
        const badgePadY = 2.5; // py-2 (8px â‰ˆ 2.1mm)
        const labelFontSize = 8; // text-xs font-bold uppercase (12px â‰ˆ 8.5pt)
        const valFontSize = 9.5; // text-sm font-semibold (14px â‰ˆ 9.9pt)
        const iconD = 3.2; // clock icon outer diameter â€” matches drawClockBadge sizing
        const iconGap = 2.2; // gap-2 between icon and text

        // Measure natural badge widths
        const badgeWidths = dateBadges.map((b) => {
          pdf.setFont("helvetica", "bold");
          pdf.setFontSize(labelFontSize);
          const lw = pdf.getTextWidth(
            sanitizePdfText(`${b.label.toUpperCase()}:`),
          );
          pdf.setFont("helvetica", "bold");
          pdf.setFontSize(valFontSize);
          const vw = pdf.getTextWidth(sanitizePdfText(b.value));
          return badgePadX + iconD + iconGap + lw + 2.5 + vw + badgePadX;
        });
        // Distribute chips across the full content width (same left/right edge as
        // cards below) with equal gaps between them â€” mirrors the page margins.
        const n = dateBadges.length;
        const naturalRowW = badgeWidths.reduce((s, w) => s + w, 0);
        // Equal gap between chips so the row spans exactly CONTENT_W
        const finalGap = n > 1 ? (CONTENT_W - naturalRowW) / (n - 1) : 0;
        const finalWidths = badgeWidths; // each badge keeps its natural content width
        let startX = MARGIN_L; // flush with left content edge, matches cards

        // Badge height driven by valFontSize
        const badgeH = valFontSize * 0.42 + badgePadY * 2;
        // Ensure the entire stats row fits on the current page without splitting
        ensureSpace(badgeH + 6);

        dateBadges.forEach((b, i) => {
          const bw = finalWidths[i];
          // Background â€” rounded-lg (3mm radius to match 8px corner)
          setFill(b.bg);
          setDraw(b.bc);
          pdf.setLineWidth(0.4);
          pdf.roundedRect(startX, yPosition, bw, badgeH, 3, 3, "FD");

          // Clock icon (circle + hands) â€” matches drawClockBadge icon style
          const iconR = iconD / 2;
          // isGreen: green channel dominates (G > B); isBlue: blue channel dominates (B > G)
          const isGreen = b.bg[1] > b.bg[2]; // green-50: G=253>B=244; blue-50: G=246<B=255
          const iconColor: RGB = isGreen ? [22, 163, 74] : [37, 99, 235]; // green-600 / blue-600
          const valueDark: RGB = isGreen ? [20, 83, 45] : [30, 58, 138];

          // Measure total content width: icon + gap + label + gap + value
          pdf.setFont("helvetica", "bold");
          pdf.setFontSize(labelFontSize);
          const labelStr = sanitizePdfText(`${b.label.toUpperCase()}:`);
          const labelTextW = pdf.getTextWidth(labelStr);
          pdf.setFont("helvetica", "bold");
          pdf.setFontSize(valFontSize);
          const valStr = sanitizePdfText(b.value);
          const valTextW = pdf.getTextWidth(valStr);
          const totalContentW = iconD + iconGap + labelTextW + 2.5 + valTextW;

          // Start X so the whole group is horizontally centred in the badge
          let curX = startX + (bw - totalContentW) / 2;

          // Text baseline: center the total glyph height (ascender + descender)
          // inside the badge so top and bottom padding are visually equal.
          // Helvetica metrics: ascender = 0.718em, descender = 0.207em, 1pt = 0.353mm
          // baseline = badgeCenter + (ascender âˆ’ descender) / 2 Ã— ptToMm Ã— fontSize
          const textBaseY =
            yPosition +
            badgeH / 2 +
            (valFontSize * 0.353 * (0.718 - 0.207)) / 2;

          // Icon center: align with the visual midline of the text.
          // Cap height for Helvetica â‰ˆ fontSize(pt) Ã— 0.353(mm/pt) Ã— 0.72
          // Icon center = baseline âˆ’ cap_height/2
          const iconCX = curX + iconR;
          const iconCY = textBaseY - (valFontSize * 0.353 * 0.72) / 2;

          // Draw clock icon
          setDraw(iconColor);
          pdf.setLineWidth(0.25);
          pdf.circle(iconCX, iconCY, iconR, "S");
          pdf.line(iconCX, iconCY, iconCX, iconCY - iconR + 0.4); // minute hand up
          pdf.line(iconCX, iconCY, iconCX + iconR - 0.5, iconCY); // hour hand right
          curX += iconD + iconGap;

          // Label text
          pdf.setFont("helvetica", "bold");
          pdf.setFontSize(labelFontSize);
          setText(b.tc);
          pdf.text(labelStr, curX, textBaseY);
          curX += labelTextW + 2.5;

          // Value text
          pdf.setFont("helvetica", "bold");
          pdf.setFontSize(valFontSize);
          setText(valueDark);
          pdf.text(valStr, curX, textBaseY);

          startX += bw + finalGap;
        });
        yPosition += badgeH + 3;
      }
    }

    yPosition += 6; // spacer before timeline

    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // 4. Timeline items
    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    data.timelineItems.forEach((item) => {
      // Ensure at least the clock badge + a minimal card header fits on the current page.
      // Each item type does its own combined keep-together space check below.

      // â”€â”€ Message item (student / patient / provider / order / sbar_report / system)
      if (item.type === "message") {
        const msg = item.data;
        const meta = getSpeakerMeta(msg.speaker);

        // Row 1: elapsed-time clock badge (left) + avatar circle (right)
        // Row height is driven by avatar size so badge is vertically centred inside it
        const avatarR = 5.5; // ~11mm diameter â€” matches UI w-12 h-12 rounded-full
        const rowH = avatarR * 2 + 2; // total Row 1 height with a small bottom gap

        // â”€â”€ Compute card estimate BEFORE drawing the badge row so we can do a
        //    combined keep-together space check (badge + card must never be split).
        const innerW = CONTENT_W - 12;
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(12.75); // use same font size as render for accurate line count
        const msgLines = pdf.splitTextToSize(
          sanitizePdfText(msg.message),
          innerW,
        ) as string[];
        const estH = 6 + 6 + msgLines.length * 5.36 + 18; // 12.75pt lineH â‰ˆ 5.36mm

        // Combined keep-together check: badge row + gap + card body
        ensureSpace(rowH + 2 + estH + 5);

        // Clock badge: drawn vertically centred inside the row
        drawClockBadge(
          msg.elapsedTime ?? "00:00",
          meta.textColor,
          meta.bgColor,
          meta.borderColor,
          yPosition + (rowH - /* badge height calc */ (9 * 0.42 + 1.8 * 2)) / 2,
        );

        // Avatar circle â€” soft speaker fill + matching border (matches UI w-12 h-12 rounded-full)
        const avatarCX = PAGE_W - MARGIN_R - avatarR;
        const avatarCY = yPosition + avatarR + 1; // +1 for top gap
        setFill(meta.bgColor);
        setDraw(meta.borderColor);
        pdf.setLineWidth(0.5);
        pdf.circle(avatarCX, avatarCY, avatarR, "FD");
        // Speaker icon centred inside the circle
        drawSpeakerIcon(
          meta.iconType,
          avatarCX,
          avatarCY,
          avatarR * 1.1,
          meta.textColor,
        );

        yPosition += rowH + 2; // 2mm gap between Row 1 and card
        const msgEndMs = msg.timestampValue ?? null;
        const msgStartMs =
          msgEndMs && msg.duration ? msgEndMs - msg.duration * 1000 : msgEndMs;
        const tsStart = fmtWallClock(msgStartMs);
        const tsEnd = fmtWallClock(msgEndMs);
        const tsText = [
          tsStart ? `Started: ${tsStart}` : "",
          tsEnd ? `Ended: ${tsEnd}` : "",
          msg.duration ? `Duration: ${formatDurationLabel(msg.duration)}` : "",
        ]
          .filter(Boolean)
          .join(" | ");

        drawBubbleCard(
          meta.bubbleBg,
          meta.borderColor,
          (ix, iw) => {
            // Badge pill (with speaker icon) + timestamps
            const pill = drawPill(
              meta.label,
              ix,
              yPosition,
              meta.textColor,
              meta.bgColor,
              meta.borderColor,
              { iconType: meta.iconType },
            );
            if (tsText) {
              pdf.setFont("helvetica", "normal");
              pdf.setFontSize(8);
              setText(C_TEXT_PRIMARY);
              // Vertically centred with pill on the same row
              const tsBaseY =
                yPosition + pill.height / 2 + (8 * 0.42) / 2 - 0.3;
              const maxTsW = iw - pill.width - 4;
              const tsClipped = (
                pdf.splitTextToSize(sanitizePdfText(tsText), maxTsW) as string[]
              )[0];
              pdf.text(tsClipped, ix + pill.width + 3, tsBaseY);
            }
            yPosition += pill.height + 3;

            // Message text â€” matches text-[17px] (12.75pt) in web UI
            pdf.setFont("helvetica", "normal");
            pdf.setFontSize(12.75); // 17px = 12.75pt
            setText(C_TEXT_PRIMARY);
            const lines = pdf.splitTextToSize(
              sanitizePdfText(msg.message),
              iw,
            ) as string[];
            const lineH = 5.36; // 12.75pt * 0.42 â‰ˆ 5.36mm
            if (meta.rightAlign) {
              // Right-align: each line flushed right inside the card
              lines.forEach((line: string) => {
                const lw2 = pdf.getTextWidth(line);
                pdf.text(line, ix + iw - lw2, yPosition + 3);
                yPosition += lineH;
              });
            } else {
              pdf.text(lines, ix, yPosition + 3);
              yPosition += lines.length * lineH;
            }
            yPosition += 2;
          },
          estH,
        );

        // â”€â”€ Common action item
      } else if (item.type === "commonAction") {
        const action = item.data;
        const ca = getCommonActionMeta(action.type);

        // â”€â”€ Compute card estimate BEFORE drawing the badge so we can do a
        //    combined keep-together space check (badge + card on same page).
        const CLOCK_BADGE_H = 9 * 0.42 + 1.8 * 2; // constant clock badge height â‰ˆ 7.4 mm
        const caEndMs = action.timestampMs ?? null;
        const caStartMs =
          caEndMs && action.duration
            ? caEndMs - action.duration * 1000
            : caEndMs;
        const caStart = fmtWallClock(caStartMs);
        const caEnd = fmtWallClock(caEndMs);
        const tsText = [
          caStart ? `Started: ${caStart}` : "",
          caEnd ? `Ended: ${caEnd}` : "",
        ]
          .filter(Boolean)
          .join(" | ");

        const estH = (() => {
          const iw = CONTENT_W - 12;
          let h = 6 + 5 + 6; // pill + ts + base
          pdf.setFont("helvetica", "bold");
          pdf.setFontSize(11);
          const tLines = (
            pdf.splitTextToSize(sanitizePdfText(action.label), iw) as string[]
          ).length;
          h += tLines * 6.0 + 4; // 14.25pt * 0.42 â‰ˆ 5.99mm
          if (action.type) {
            h += 5;
          }
          if (action.question) {
            const qLines = (
              pdf.splitTextToSize(
                sanitizePdfText(action.question),
                iw,
              ) as string[]
            ).length;
            h += qLines * 4.4 + 12;
          }
          if (action.answer) {
            const aStr = Array.isArray(action.answer)
              ? (action.answer as string[]).join(", ")
              : String(action.answer);
            const aLines = (
              pdf.splitTextToSize(sanitizePdfText(aStr), iw) as string[]
            ).length;
            h += aLines * 4.4 + 12;
          }
          if (action.notes ?? action.observations) {
            h += 15;
          }
          if (action.correct !== undefined) {
            h += 10;
          }
          return h + 18; // +8mm safety ensures bg always taller than content
        })();

        // Combined keep-together check: badge + gap + card body
        ensureSpace(CLOCK_BADGE_H + 3 + estH + 5);

        // Now draw badge (space is guaranteed)
        const badgeH = drawClockBadge(
          action.elapsedTime ?? "00:00",
          ca.textColor,
          ca.bgColor,
          ca.borderColor,
        );
        yPosition += badgeH + 3;

        drawBubbleCard(
          ca.bgColor,
          ca.borderColor,
          (ix, iw) => {
            // "Common Actions" badge + timestamps
            const pill = drawPill(
              "Common Actions",
              ix,
              yPosition,
              ca.textColor,
              ca.bgColor,
              ca.borderColor,
            );
            if (tsText) {
              pdf.setFont("helvetica", "normal");
              pdf.setFontSize(8);
              setText(C_TEXT_PRIMARY);
              // Vertically centred with pill on the same row
              const tsBaseY =
                yPosition + pill.height / 2 + (8 * 0.42) / 2 - 0.3;
              const maxTsW = iw - pill.width - 4;
              const tsClipped = (
                pdf.splitTextToSize(sanitizePdfText(tsText), maxTsW) as string[]
              )[0];
              pdf.text(tsClipped, ix + pill.width + 3, tsBaseY);
            }
            yPosition += pill.height + 3;

            // Title (bold, large â€” matches text-[19px] = 14.25pt font-bold)
            pdf.setFont("helvetica", "bold");
            pdf.setFontSize(14.25); // 19px = 14.25pt
            setText(C_GRAY900);
            const titleLines = pdf.splitTextToSize(
              sanitizePdfText(action.label),
              iw,
            ) as string[];
            pdf.text(titleLines, ix, yPosition + 4);
            yPosition += titleLines.length * 6.0 + 4; // 14.25pt

            // Type label (uppercase gray â€” matches text-[11px] font-bold text-gray-500 uppercase)
            if (action.type) {
              pdf.setFont("helvetica", "bold");
              pdf.setFontSize(7.5);
              setText(C_GRAY400);
              pdf.text(
                sanitizePdfText(formatActionType(action.type).toUpperCase()),
                ix,
                yPosition,
              );
              yPosition += 5;
            }

            // Clinical Prompt sub-box
            if (action.question) {
              drawSubBox(
                "Clinical Prompt",
                action.question,
                [234, 88, 12] as RGB,
                [255, 247, 237] as RGB,
                [254, 215, 170] as RGB,
                ix,
                iw,
              );
            }
            // Student Response sub-box
            if (action.answer) {
              const ansStr = Array.isArray(action.answer)
                ? (action.answer as string[]).join(", ")
                : String(action.answer);
              drawSubBox(
                "Student Response",
                ansStr,
                [5, 150, 105] as RGB, // emerald-600
                [236, 253, 245] as RGB,
                [167, 243, 208] as RGB,
                ix,
                iw,
              );
            }
            // Notes sub-box
            if (action.notes ?? action.observations) {
              drawSubBox(
                "Observations / Notes",
                String(action.notes ?? action.observations ?? ""),
                [37, 99, 235] as RGB,
                [239, 246, 255] as RGB,
                [191, 219, 254] as RGB,
                ix,
                iw,
              );
            }
            // Correct / Incorrect badge
            if (action.correct !== undefined) {
              yPosition += 2;
              if (action.correct) {
                drawPill("âœ“ Correct", ix, yPosition, C_SUCCESS, C_SUCCESS_BG, [
                  167, 243, 208,
                ] as RGB);
              } else {
                drawPill("âœ— Incorrect", ix, yPosition, C_DANGER, C_DANGER_BG, [
                  252, 165, 165,
                ] as RGB);
              }
              yPosition += 7;
            }
            yPosition += 1;
          },
          estH,
        );

        // â”€â”€ Summary / action entry
      } else {
        const entry = item.data;

        // Skip if no meaningful content
         
        const hasContent = !!(
          entry.sbarQualitativeResult ||
          (entry.details && entry.details.trim().length > 0) ||
          (entry.question && entry.question.trim().length > 0) ||
          entry.answer ||
          (entry.notes && entry.notes.trim().length > 0) ||
          (entry.observations && entry.observations.trim().length > 0)
        );
         
        if (!entry.title || !hasContent) {
          return;
        }

        const cat = getCategoryMetaPdf(entry.category, entry.title);
        const isVital = (entry.category ?? "").toLowerCase() === "vitals";
        const isMedication =
          (entry.category ?? "").toLowerCase() === "medications";
        const isDemoOrHist = ["demographics", "history"].includes(
          (entry.category ?? "").toLowerCase(),
        );

        // â”€â”€ Compute timestamps and card estimate BEFORE drawing the badge so we
        //    can do a combined keep-together space check (badge + card on same page).
        const CLOCK_BADGE_H_S = 9 * 0.42 + 1.8 * 2; // constant clock badge height â‰ˆ 7.4 mm

        // Timestamps â€” prefer explicit startTimestampValue (real wall-clock),
        // fall back to duration-based math, then to entryEndMs.
        const entryEndMs = entry.timestampValue ?? null;
        const entryStartMs =
          entry.startTimestampValue ??
          (entryEndMs && entry.duration
            ? entryEndMs - entry.duration * 1000
            : entryEndMs);
        const tsStart = entry.sbarQualitativeResult
          ? fmtWallClock(entry.sbarStartMs)
          : fmtWallClock(entryStartMs);
        const tsEnd = entry.sbarQualitativeResult
          ? fmtWallClock(entry.sbarSubmitMs)
          : fmtWallClock(entryEndMs);
        let tsDur = "";
        if (
          entry.sbarQualitativeResult &&
          entry.sbarStartMs &&
          entry.sbarSubmitMs
        ) {
          tsDur = `Duration: ${formatDurationLabel((entry.sbarSubmitMs - entry.sbarStartMs) / 1000)}`;
        } else if (entry.duration) {
          tsDur = `Duration: ${formatDurationLabel(entry.duration)}`;
        }
        const tsText = [
          tsStart ? `Started: ${tsStart}` : "",
          tsEnd ? `Ended: ${tsEnd}` : "",
          tsDur,
        ]
          .filter(Boolean)
          .join(" | ");

        const estH = (() => {
          // Accurately estimate card height to avoid page-break mid-card
          const iw = CONTENT_W - 12;
          let h = 6 + 5 + 6; // pill row + timestamps row + padding base
          // Title lines â€” 15pt matches text-[20px]
          pdf.setFont("helvetica", "bold");
          pdf.setFontSize(15);
          const tLines = (
            pdf.splitTextToSize(sanitizePdfText(entry.title), iw) as string[]
          ).length;
          h += tLines * (15 * 0.42 + 1.2) + 1; // titleLineH + gap + 1mm for type label gap
          if (entry.type) {
            h += 6;
          } // type label + gap before sub-boxes
          if (entry.sbarQualitativeResult) {
            const promptLines = (
              pdf.splitTextToSize(
                sanitizePdfText(entry.sbarPrompt ?? ""),
                iw,
              ) as string[]
            ).length;
            const subLines = (
              pdf.splitTextToSize(
                sanitizePdfText(entry.sbarSubmission ?? ""),
                iw,
              ) as string[]
            ).length;
            h += promptLines * 4.4 + subLines * 4.4 + 30; // 3 sub-boxes
          } else if (entry.question) {
            const qLines = (
              pdf.splitTextToSize(
                sanitizePdfText(entry.question),
                iw,
              ) as string[]
            ).length;
            h += qLines * 4.4 + 12;
            if (entry.answer) {
              // For ordering type, count the actual pipe-delimited items for accurate height
              if (entry.type === "ordering") {
                let rawItems: string[] = [];
                if (entry.details?.includes(" ||| ")) {
                  const m = entry.details.match(
                    /Submitted:\s*(.*?)(?=\n|$|\|\s*Started:)/i,
                  );
                  const raw =
                    m?.[1] ?? entry.details.split(/\|\s*Started:/i)[0].trim();
                  rawItems = raw
                    .split(" ||| ")
                    .map((s: string) => s.trim())
                    .filter(Boolean);
                } else {
                  const aRaw = Array.isArray(entry.answer)
                    ? (entry.answer as string[]).join(", ")
                    : String(entry.answer ?? "");
                  rawItems = (
                    aRaw.includes(" ||| ")
                      ? aRaw.split(" ||| ")
                      : aRaw.split(",")
                  )
                    .map((s: string) => s.trim())
                    .filter(Boolean);
                }
                const numW2 = 7;
                const textW2 = iw - 6 - numW2;
                let totalItemLines = 0;
                rawItems.forEach((item) => {
                  totalItemLines += (
                    pdf.splitTextToSize(
                      sanitizePdfText(item.trim()),
                      textW2,
                    ) as string[]
                  ).length;
                });
                h +=
                  5 +
                  totalItemLines * 4.4 +
                  (rawItems.length - 1) * 1.5 +
                  6 +
                  12;
              } else {
                const aStr = Array.isArray(entry.answer)
                  ? (entry.answer as string[]).join(", ")
                  : String(entry.answer ?? "");
                const aLines = (
                  pdf.splitTextToSize(sanitizePdfText(aStr), iw) as string[]
                ).length;
                h += aLines * 4.4 + 12;
              }
            }
          } else if (isMedication) {
            h += 320; // Rich medication card: sub-header + chips + info grid + all sections
          } else if (entry.details && !isVital && !isDemoOrHist) {
            const rawD = entry.details.split(/\|\s*Started:/i)[0].trim();
            const dLines = (
              pdf.splitTextToSize(sanitizePdfText(rawD), iw) as string[]
            ).length;
            h += dLines * 4.4 + 12;
          } else if (entry.details) {
            h += 10;
          }
          if (entry.notes ?? entry.observations) {
            const nLines = (
              pdf.splitTextToSize(
                sanitizePdfText(
                  String(entry.notes ?? entry.observations ?? ""),
                ),
                iw,
              ) as string[]
            ).length;
            h += nLines * 4.4 + 12;
          }
          if ((entry as SummaryEntry & { satisfactory?: unknown }).satisfactory !== undefined) {
            h += 10;
          }
          // Vitals box â€” matches hasVitalsDataPdf render condition:
          // always shown when entry.vitals exists (even empty), regardless of isVital.
          if (!isDemoOrHist) {
            const entryVitalsRaw = (
              entry as SummaryEntry & { vitals?: unknown }
            ).vitals;
            const hasVitalsDataEst =
              entryVitalsRaw !== null &&
              typeof entryVitalsRaw === "object" &&
              !Array.isArray(entryVitalsRaw);
            const isVitalSignsEntry =
              entry.type === "vital-signs" || entry.type === "vital";
            let numVRows = 0;
            if (hasVitalsDataEst) {
              numVRows = Object.values(
                entryVitalsRaw as Record<string, unknown[]>,
              ).filter((v) => Array.isArray(v) && v.length > 0).length;
            }
            if (numVRows === 0 && isVitalSignsEntry && data.vitalsMapState) {
              numVRows = Object.values(data.vitalsMapState).filter(
                (v) => Array.isArray(v) && v.length > 0,
              ).length;
            }
            if (hasVitalsDataEst) {
              // Always reserve height for the box (min = header-only = 5+6+3 = 14mm)
              h += 4 + 5 + 6 + numVRows * 6 + 3 + 2;  
            }
          }
          return h + 18; // +8mm safety ensures bg always taller than content
        })();

        // Combined keep-together check: badge + gap + card body
        ensureSpace(CLOCK_BADGE_H_S + 3 + estH + 5);

        // Defensive white strip: erase any background bleed from a previous card
        // that may extend into this entry's area. Drawn after ensureSpace so we
        // are on the correct page. Width exceeds card width slightly to cover
        // rounded-corner artifacts.
        setFill([255, 255, 255]);
        pdf.rect(
          MARGIN_L - 2,
          yPosition,
          CONTENT_W + 4,
          CLOCK_BADGE_H_S + 3 + estH + 10,
          "F",
        );

        // Now draw badge (space is guaranteed)
        const badgeH = drawClockBadge(
          entry.elapsedTime ?? "00:00",
          cat.textColor,
          cat.bgColor,
          cat.borderColor,
        );
        yPosition += badgeH + 3;

        drawBubbleCard(
          cat.bgColor,
          cat.borderColor,
          (ix, iw) => {
            // Category badge + timestamps (NO satisfactory pill here â€” goes at bottom)
            const catLabel = entry.category
              ? `[${entry.category}]`
              : "[summary]";
            const pill = drawPill(
              catLabel,
              ix,
              yPosition,
              cat.textColor,
              cat.bgColor,
              cat.borderColor,
            );
            // Medication status pill (inline next to category badge, matches getStatusBadge in UI)
            let pillCursor = ix + pill.width + 3;
            if (isMedication && entry.details) {
              const st = getMedStatus(entry.details);
              if (st) {
                const sp = drawStatusPill(
                  st.label,
                  pillCursor,
                  yPosition,
                  st.tc,
                  st.bg,
                  st.bc,
                );
                pillCursor += sp.width + 3;
              }
            }
            if (tsText) {
              pdf.setFont("helvetica", "normal");
              pdf.setFontSize(8);
              setText(C_TEXT_PRIMARY);
              // Vertically centred with pill on the same row
              const tsBaseY =
                yPosition + pill.height / 2 + (8 * 0.42) / 2 - 0.3;
              const maxTsW = iw - pillCursor + ix - 2;
              const tsClipped = (
                pdf.splitTextToSize(sanitizePdfText(tsText), maxTsW) as string[]
              )[0];
              pdf.text(tsClipped, pillCursor, tsBaseY);
            }
            yPosition += pill.height + 3;

            // SBAR / Team Communication card
            if (entry.sbarQualitativeResult) {
              // Title
              pdf.setFont("helvetica", "bold");
              pdf.setFontSize(12);
              setText(cat.textColor);
              const titleLines = pdf.splitTextToSize(
                sanitizePdfText(entry.title),
                iw,
              ) as string[];
              pdf.text(titleLines, ix, yPosition + 4);
              yPosition += titleLines.length * 5.5 + 4;
              // Prompt box
              if (entry.sbarPrompt) {
                drawSubBox(
                  "Prompt:",
                  entry.sbarPrompt,
                  C_TEXT_SECONDARY,
                  [255, 255, 255] as RGB,
                  [254, 215, 170] as RGB,
                  ix,
                  iw,
                );
              }
              // Submission box
              if (entry.sbarSubmission) {
                drawSubBox(
                  "Student SBAR Submission:",
                  entry.sbarSubmission,
                  C_TEXT_SECONDARY,
                  [255, 255, 255] as RGB,
                  [254, 215, 170] as RGB,
                  ix,
                  iw,
                );
              }
              // Result pill â€” "RESULT:" label + pill on same baseline row
              if (entry.sbarQualitativeResult) {
                yPosition += 4;
                const isSat =
                  entry.sbarQualitativeResult.toLowerCase() === "satisfactory";
                const pillTC = isSat ? C_SUCCESS : ([180, 83, 9] as RGB);
                const pillBG = isSat ? C_SUCCESS_BG : ([255, 251, 235] as RGB);
                const pillBC = isSat
                  ? ([167, 243, 208] as RGB)
                  : ([253, 230, 138] as RGB);
                // Measure pill height so we can centre the label text with it
                pdf.setFont("helvetica", "bold");
                pdf.setFontSize(8.5);
                const pillH = 8.5 * 0.42 + 1.3 * 2; // same as drawPill bh formula
                const pillBaseline = yPosition + pillH - 1.3 - 0.3;
                // "RESULT:" label â€” bold, gray, vertically centred
                setText(C_TEXT_SECONDARY);
                pdf.text(sanitizePdfText("RESULT:"), ix, pillBaseline);
                const labelW = pdf.getTextWidth("RESULT:") + 3;
                // Satisfactory / Unsatisfactory pill
                drawPill(
                  entry.sbarQualitativeResult,
                  ix + labelW,
                  yPosition,
                  pillTC,
                  pillBG,
                  pillBC,
                  { fontSize: 8.5, bold: true },
                );
                yPosition += pillH + 4;
              }
            } else {
              // Standard entry title â€” matches text-[20px] font-bold
              pdf.setFont("helvetica", "bold");
              pdf.setFontSize(15); // 20px = 15pt matches text-[20px]
              setText(cat.textColor);
              const titleLines = pdf.splitTextToSize(
                sanitizePdfText(entry.title),
                iw,
              ) as string[];
              // Baseline offset = line height so text cap sits at yPosition
              const titleLineH = 15 * 0.42;
              pdf.text(titleLines, ix, yPosition + titleLineH);
              yPosition += titleLines.length * (titleLineH + 1.2);

              // Type label â€” matches text-[11px] font-bold text-gray-500 uppercase tracking-wider
              // gap-1 (~1mm) below title, plain text (no box)
              if (entry.type) {
                yPosition += 1; // gap-1
                pdf.setFont("helvetica", "bold");
                pdf.setFontSize(7.5);
                setText(C_GRAY400);
                pdf.text(
                  sanitizePdfText(formatActionType(entry.type).toUpperCase()),
                  ix,
                  yPosition + 3,
                );
                yPosition += 5;
              }

              yPosition += 3; // gap before sub-boxes

              // Vital value display
              if (isVital && entry.details) {
                const rawDetails = entry.details.trim();
                const cleanedVital = rawDetails
                  .split(/\|\s*Started:/i)[0]
                  .replace(/\s*Duration:\s*[\d\w\s]+/i, "")
                  .trim();
                if (cleanedVital) {
                  pdf.setFont("helvetica", "bold");
                  pdf.setFontSize(12);
                  setText(cat.textColor);
                  pdf.text(sanitizePdfText(cleanedVital), ix, yPosition + 4);
                  yPosition += 8;
                }
              } else if (isDemoOrHist && entry.details) {
                // Demographics / History â€” italic styled details
                const cleanedD = entry.details
                  .split(/\|\s*Started:/i)[0]
                  .trim();
                if (cleanedD) {
                  pdf.setFont("helvetica", "italic");
                  pdf.setFontSize(9.5);
                  setText(cat.textColor);
                  const dLines = pdf.splitTextToSize(
                    sanitizePdfText(cleanedD),
                    iw,
                  ) as string[];
                  pdf.text(dLines, ix, yPosition + 3);
                  yPosition += dLines.length * 5 + 3;
                }
              } else if (isMedication && entry.details) {
                // â”€â”€ Medication Administration card â€” mirrors MedicationTranscriptCard.tsx
                const medParts = entry.details
                  .split(" | ")
                  .map((s: string) => s.trim())
                  .filter(Boolean);
                const findMedPart = (prefix: string): string | undefined =>
                  medParts.find((p: string) => p.startsWith(prefix));
                const stripMed = (
                  raw: string | undefined,
                  prefix: string,
                ): string => {
                  if (!raw) {
                    return "";
                  }
                  return raw.replace(new RegExp(`^${prefix}\\s*`), "").trim();
                };
                const hasMedVal = (v: string | undefined): boolean => {
                  if (!v) {
                    return false;
                  }
                  const t = v.trim();
                  return (
                    t.length > 0 && !/^-+$/.test(t) && t.toLowerCase() !== "n/a"
                  );
                };
                // Parse pipe-separated fields
                const medDueTimeVal = stripMed(
                  findMedPart("Due Time:"),
                  "Due Time:",
                );
                const medDoseVal = stripMed(
                  findMedPart("Ordered Dose:"),
                  "Ordered Dose:",
                );
                const medRouteVal = stripMed(findMedPart("Route:"), "Route:");
                const medFreqVal = stripMed(
                  findMedPart("Frequency:"),
                  "Frequency:",
                );
                const medDrugOnHand = stripMed(
                  findMedPart("Drug On Hand:"),
                  "Drug On Hand:",
                );
                const medExpiration = stripMed(
                  findMedPart("Expiration:"),
                  "Expiration:",
                );
                const medIndication = stripMed(
                  findMedPart("Indication:"),
                  "Indication:",
                );
                const medAdminDose = stripMed(
                  findMedPart("Administered Dose:"),
                  "Administered Dose:",
                );
                const medQty = stripMed(findMedPart("Quantity:"), "Quantity:");
                const medExpectedQty = stripMed(
                  findMedPart("Expected Quantity:"),
                  "Expected Quantity:",
                );
                const medSite = stripMed(findMedPart("Site:"), "Site:");
                const medTime = stripMed(findMedPart("Time:"), "Time:");
                const medRate = stripMed(findMedPart("Rate:"), "Rate:");
                const medInfusionDuration = stripMed(
                  findMedPart("Infusion Duration:"),
                  "Infusion Duration:",
                );
                const medStatus = stripMed(findMedPart("Status:"), "Status:");
                const medClinDec = stripMed(
                  findMedPart("Clinical Decision:"),
                  "Clinical Decision:",
                );
                const atRegex =
                  /^(Administered At|Logged At|Missed At|Refused At|Inappropriate At|Held At):/i;
                const administeredAtPart = medParts.find((p: string) =>
                  atRegex.test(p),
                );
                const atLabelMatch = administeredAtPart?.match(atRegex);
                const atLabel = atLabelMatch ? atLabelMatch[1] : "";
                const atValueRaw = administeredAtPart
                  ? administeredAtPart.replace(atRegex, "").trim()
                  : "";
                const atValueMs = atValueRaw ? Date.parse(atValueRaw) : NaN;
                const atFormatted = atValueRaw
                  ? !Number.isNaN(atValueMs)
                    ? fmtAdminDate(atValueMs) || atValueRaw
                    : atValueRaw
                  : "";
                const medAssessmentFindings = stripMed(
                  findMedPart("Assessment Findings:"),
                  "Assessment Findings:",
                );
                const medRefusalReason = stripMed(
                  findMedPart("Refusal Reason:"),
                  "Refusal Reason:",
                );
                const medReasonNotGiven = stripMed(
                  findMedPart("Reason for Not Given:"),
                  "Reason for Not Given:",
                );
                const medInappropriateReason = stripMed(
                  findMedPart("Inappropriate Reason:"),
                  "Inappropriate Reason:",
                );
                const medClinicalNote = stripMed(findMedPart("Note:"), "Note:");
                const medTherapeuticResponse = stripMed(
                  findMedPart("Therapeutic Response:"),
                  "Therapeutic Response:",
                );
                const medAdverseEffects = stripMed(
                  findMedPart("Adverse Effects:"),
                  "Adverse Effects:",
                );
                const medTimeElapsed = stripMed(
                  findMedPart("Time Elapsed:"),
                  "Time Elapsed:",
                );
                const medReassessmentNotes = stripMed(
                  findMedPart("Reassessment Notes:"),
                  "Reassessment Notes:",
                );
                const medReassessedAt = stripMed(
                  findMedPart("Reassessed At:"),
                  "Reassessed At:",
                );
                const medEducationNotes = stripMed(
                  findMedPart("Education Notes:"),
                  "Education Notes:",
                );
                const medAdminPat = stripMed(
                  findMedPart("Administered to Patient:"),
                  "Administered to Patient:",
                );
                const medDisposal = stripMed(
                  findMedPart("Proper Disposal:"),
                  "Proper Disposal:",
                );
                const medAdminNotes = stripMed(
                  findMedPart("Admin Notes:"),
                  "Admin Notes:",
                );
                const medOrderTypePt = findMedPart("Order Type:");
                let medOrderType = stripMed(medOrderTypePt, "Order Type:");
                if (!medOrderType && medFreqVal) {
                  const fLow = medFreqVal.toLowerCase();
                  if (/\bprn\b|as needed/.test(fLow)) {
                    medOrderType = "PRN";
                  } else if (/\bstat\b|\bonce\b/.test(fLow)) {
                    medOrderType = "STAT";
                  } else {
                    medOrderType = "Scheduled";
                  }
                }
                // Structured administration details + grading
                const adminDet = entry.administrationDetails;
                const gradRes = adminDet?.gradingResult;
                const structuredAtRaw =
                  typeof adminDet?.administeredAt === "string"
                    ? adminDet.administeredAt.trim()
                    : "";
                const structuredAtMs = structuredAtRaw
                  ? Date.parse(structuredAtRaw)
                  : NaN;
                const structuredAtFormatted = structuredAtRaw
                  ? !Number.isNaN(structuredAtMs)
                    ? fmtAdminDate(structuredAtMs) || structuredAtRaw
                    : structuredAtRaw
                  : "";
                const isReassessmentOnly = /^\[Reassessment\]/i.test(
                  (entry.details ?? "").trim(),
                );
                const getComp = (field: string) =>
                  gradRes?.comparisons?.find(
                    (c) => c.field.toLowerCase() === field.toLowerCase(),
                  );
                const compStr = (v: string | string[] | undefined): string =>
                  v === undefined || v === null
                    ? ""
                    : Array.isArray(v)
                      ? v.join(" or ")
                      : String(v);

                // â”€â”€ Helper: section separator + title
                const drawMedSep = (title: string) => {
                  setDraw(C_GRAY200);
                  pdf.setLineWidth(0.25);
                  pdf.line(ix, yPosition, ix + iw, yPosition);
                  yPosition += 3;
                  pdf.setFont("helvetica", "bold");
                  pdf.setFontSize(7.5);
                  setText(C_GRAY700);
                  pdf.text(
                    sanitizePdfText(title.toUpperCase()),
                    ix,
                    yPosition + 3,
                  );
                  yPosition += 7; // extra space so sep line and first row border are not flush
                };

                // â”€â”€ Helper: Expected | Documented comparison row
                const drawMedCompRow = (
                  label: string,
                  expected: string | undefined,
                  documented: string | undefined,
                  isCorrect: boolean | null,
                ) => {
                  const expStr = expected?.trim() ? expected : "â€”";
                  const docStr = documented?.trim() ? documented : "â€”";
                  const rowBG: RGB =
                    isCorrect === null
                      ? [249, 250, 251]
                      : isCorrect
                        ? [236, 253, 245]
                        : [255, 241, 242];
                  const rowBC: RGB =
                    isCorrect === null
                      ? [229, 231, 235]
                      : isCorrect
                        ? [209, 250, 229]
                        : [255, 228, 230];
                  const docTC: RGB =
                    isCorrect === null
                      ? C_TEXT_PRIMARY
                      : isCorrect
                        ? [4, 120, 87]
                        : [190, 24, 93];
                  // Symmetric 2-column layout â€” divider at exact horizontal center
                  const colPadC = 3;
                  const divXC = ix + iw / 2;
                  const lXC = ix + colPadC;
                  const rXC = divXC + colPadC;
                  const lColW = divXC - lXC - 2;
                  const rColW = ix + iw - rXC - colPadC;
                  pdf.setFont("helvetica", "normal");
                  pdf.setFontSize(8);
                  const expLines = pdf.splitTextToSize(
                    sanitizePdfText(expStr),
                    lColW,
                  ) as string[];
                  const docLines2 = pdf.splitTextToSize(
                    sanitizePdfText(docStr),
                    rColW,
                  ) as string[];
                  const maxL = Math.max(expLines.length, docLines2.length);
                  const boxH = 6 + 4.5 + maxL * 4 + 4;
                  // 4mm gap before every row so adjacent box borders don't appear as double lines
                  yPosition += 2;
                  if (yPosition + boxH > CONTENT_BOTTOM) {
                    drawFooter();
                    pdf.addPage();
                    pageNumber += 1;
                    drawPageHeader();
                  }
                  setFill(rowBG);
                  setDraw(rowBC);
                  pdf.setLineWidth(0.25);
                  pdf.roundedRect(ix, yPosition, iw, boxH, 1.5, 1.5, "FD");
                  // Vertical center divider
                  setDraw(rowBC);
                  pdf.setLineWidth(0.2);
                  pdf.line(divXC, yPosition + 1, divXC, yPosition + boxH - 1);
                  // Row label â€” spans full width above the two-column area (matches web UI card header)
                  pdf.setFont("helvetica", "bold");
                  pdf.setFontSize(8);
                  setText(C_GRAY700);
                  pdf.text(sanitizePdfText(label), lXC, yPosition + 4.5);
                  if (isCorrect !== null) {
                    const bLabel = isCorrect
                      ? "Satisfactory"
                      : "Unsatisfactory";
                    const bTC: RGB = isCorrect ? [4, 120, 87] : [190, 24, 93];
                    const bBG: RGB = isCorrect
                      ? [209, 250, 229]
                      : [254, 226, 226];
                    const bBC: RGB = isCorrect
                      ? [167, 243, 208]
                      : [254, 205, 211];
                    pdf.setFont("helvetica", "bold");
                    pdf.setFontSize(7);
                    const bW = pdf.getTextWidth(bLabel) + 5.6;
                    const bH2 = 7 * 0.42 + 1.3 * 2;
                    setFill(bBG);
                    setDraw(bBC);
                    pdf.setLineWidth(0.2);
                    pdf.roundedRect(
                      ix + iw - bW - colPadC,
                      yPosition + 1,
                      bW,
                      bH2,
                      bH2 / 2,
                      bH2 / 2,
                      "FD",
                    );
                    setText(bTC);
                    pdf.text(
                      bLabel,
                      ix + iw - bW - colPadC + 2.8,
                      yPosition + 1 + bH2 - 1.3 - 0.3,
                    );
                  }
                  // Column headers + underlines spanning full column width
                  const sY2 = yPosition + 7;
                  pdf.setFont("helvetica", "bold");
                  pdf.setFontSize(7);
                  setText(C_GRAY400);
                  pdf.text("EXPECTED", lXC, sY2);
                  pdf.text("DOCUMENTED", rXC, sY2);
                  setDraw(C_GRAY200);
                  pdf.setLineWidth(0.2);
                  pdf.line(lXC, sY2 + 1, divXC - colPadC, sY2 + 1);
                  pdf.line(rXC, sY2 + 1, ix + iw - colPadC, sY2 + 1);
                  // Column content
                  pdf.setFont("helvetica", "normal");
                  pdf.setFontSize(8);
                  setText(C_TEXT_SECONDARY);
                  pdf.text(expLines, lXC, sY2 + 4.5);
                  setText(docTC);
                  pdf.text(docLines2, rXC, sY2 + 4.5);
                  yPosition += boxH; // 2mm gap is added at the START of each row for consistency
                };

                // â”€â”€ Helper: 2-col checklist box (Expected | Documented)
                const drawMedChecklist = (
                  title: string,
                  expectedItems: string[],
                  documentedItems: string[],
                  isCorrect?: boolean | null,
                ) => {
                  const inferredChecklistStatus = (() => {
                    // When there are expected items, always recompute against
                    // the documented set so an upstream grading flag (e.g.
                    // `isCorrect: true` from an ungraded education result)
                    // cannot show a false "Satisfactory" badge when the
                    // student never reached this step. Matches the in-app
                    // ChecklistGradingDisplay logic.
                    if (expectedItems.length > 0) {
                      const expectedSet = new Set(
                        expectedItems.map((v) => v.toLowerCase().trim()),
                      );
                      const documentedSet = new Set(
                        documentedItems.map((v) => v.toLowerCase().trim()),
                      );
                      return Array.from(expectedSet).every((item) =>
                        documentedSet.has(item),
                      );
                    }
                    if (typeof isCorrect === "boolean") {
                      return isCorrect;
                    }
                    return null;
                  })();
                  const itemH = 4;
                  const maxItems = Math.max(
                    expectedItems.length === 0 ? 1 : expectedItems.length,
                    documentedItems.length === 0 ? 1 : documentedItems.length,
                  );
                  const boxH = 7 + 4.5 + maxItems * itemH + 3;
                  // 4mm gap before every checklist box so adjacent borders don't appear as double lines
                  yPosition += 4;
                  if (yPosition + boxH > CONTENT_BOTTOM) {
                    drawFooter();
                    pdf.addPage();
                    pageNumber += 1;
                    drawPageHeader();
                  }
                  // Symmetric 2-column layout â€” divider at exact horizontal center
                  const colPadCL = 3;
                  const divXCL = ix + iw / 2;
                  const lXCL = ix + colPadCL;
                  const rXCL = divXCL + colPadCL;
                  const rowBG: RGB =
                    inferredChecklistStatus === null
                      ? [249, 250, 251]
                      : inferredChecklistStatus
                        ? [236, 253, 245]
                        : [255, 241, 242];
                  const rowBC: RGB =
                    inferredChecklistStatus === null
                      ? [229, 231, 235]
                      : inferredChecklistStatus
                        ? [209, 250, 229]
                        : [255, 228, 230];
                  setFill(rowBG);
                  setDraw(rowBC);
                  pdf.setLineWidth(0.25);
                  pdf.roundedRect(ix, yPosition, iw, boxH, 1.5, 1.5, "FD");
                  // Vertical center divider
                  setDraw(rowBC);
                  pdf.setLineWidth(0.2);
                  pdf.line(divXCL, yPosition + 1, divXCL, yPosition + boxH - 1);
                  pdf.setFont("helvetica", "bold");
                  pdf.setFontSize(8);
                  setText(C_GRAY700);
                  pdf.text(sanitizePdfText(title), lXCL, yPosition + 4.5);
                  if (inferredChecklistStatus !== null) {
                    const bLabel = inferredChecklistStatus
                      ? "Satisfactory"
                      : "Unsatisfactory";
                    const bTC: RGB = inferredChecklistStatus
                      ? [4, 120, 87]
                      : [190, 24, 93];
                    const bBG: RGB = inferredChecklistStatus
                      ? [209, 250, 229]
                      : [255, 228, 230];
                    const bBC: RGB = inferredChecklistStatus
                      ? [167, 243, 208]
                      : [254, 205, 211];
                    pdf.setFont("helvetica", "bold");
                    pdf.setFontSize(7);
                    const bW = pdf.getTextWidth(bLabel) + 5.6;
                    const bH2 = 7 * 0.42 + 1.3 * 2;
                    setFill(bBG);
                    setDraw(bBC);
                    pdf.setLineWidth(0.2);
                    pdf.roundedRect(
                      ix + iw - bW - colPadCL,
                      yPosition + 1,
                      bW,
                      bH2,
                      bH2 / 2,
                      bH2 / 2,
                      "FD",
                    );
                    setText(bTC);
                    pdf.text(
                      bLabel,
                      ix + iw - bW - colPadCL + 2.8,
                      yPosition + 1 + bH2 - 1.3 - 0.3,
                    );
                  }
                  // Column headers + underlines spanning full column width
                  const sY3 = yPosition + 7;
                  pdf.setFont("helvetica", "bold");
                  pdf.setFontSize(7);
                  setText(C_GRAY400);
                  pdf.text("EXPECTED", lXCL, sY3);
                  pdf.text("DOCUMENTED", rXCL, sY3);
                  setDraw(rowBC);
                  pdf.setLineWidth(0.2);
                  pdf.line(lXCL, sY3 + 1, divXCL - colPadCL, sY3 + 1);
                  pdf.line(rXCL, sY3 + 1, ix + iw - colPadCL, sY3 + 1);
                  const listY = sY3 + 4.5;
                  pdf.setFont("helvetica", "normal");
                  pdf.setFontSize(7.5);
                  if (expectedItems.length === 0) {
                    setText(C_GRAY400);
                    pdf.text("â€”", lXCL, listY);
                  } else {
                    setText(C_TEXT_PRIMARY);
                    expectedItems.forEach((item, i) => {
                      pdf.text(
                        sanitizePdfText(`â€¢ ${item}`),
                        lXCL,
                        listY + i * itemH,
                      );
                    });
                  }
                  if (documentedItems.length === 0) {
                    setText(C_GRAY400);
                    pdf.text("â€”", rXCL, listY);
                  } else {
                    setText(C_TEXT_PRIMARY);
                    documentedItems.forEach((item, i) => {
                      pdf.text(
                        sanitizePdfText(`â€¢ ${item}`),
                        rXCL,
                        listY + i * itemH,
                      );
                    });
                  }
                  yPosition += boxH; // 2mm gap is added at the START for consistency
                };

                // â”€â”€ Helper: lightweight key/value info line used for free-text notes
                const drawMedInfoLine = (label: string, value: string) => {
                  const lineH = 4;
                  const labelX = ix;
                  const valueRightX = ix + iw;
                  const labelW = iw * 0.4;
                  const valueW = iw * 0.58;
                  const labelLines = pdf.splitTextToSize(
                    sanitizePdfText(label),
                    labelW,
                  ) as string[];
                  const valueLines = pdf.splitTextToSize(
                    sanitizePdfText(value),
                    valueW,
                  ) as string[];
                  const rowH =
                    Math.max(labelLines.length, valueLines.length) * lineH + 2;
                  yPosition += 1.5;
                  if (yPosition + rowH > CONTENT_BOTTOM) {
                    drawFooter();
                    pdf.addPage();
                    pageNumber += 1;
                    drawPageHeader();
                  }
                  pdf.setFont("helvetica", "normal");
                  pdf.setFontSize(8);
                  setText(C_TEXT_SECONDARY);
                  pdf.text(labelLines, labelX, yPosition + 3.5);
                  setText(C_TEXT_PRIMARY);
                  pdf.text(valueLines, valueRightX, yPosition + 3.5, {
                    align: "right",
                  });
                  yPosition += rowH;
                };

                // â”€â”€ Sub-section header: "MEDICATION ADMINISTRATION" + order type badge
                {
                  const subHdrH = 9;
                  setFill(C_GRAY50);
                  setDraw(C_GRAY100);
                  pdf.setLineWidth(0.25);
                  pdf.roundedRect(ix, yPosition, iw, subHdrH, 1.5, 1.5, "FD");
                  pdf.setFont("helvetica", "bold");
                  pdf.setFontSize(8.5);
                  setText(C_GRAY700);
                  pdf.text(
                    isReassessmentOnly
                      ? "REASSESSMENT"
                      : "MEDICATION ADMINISTRATION",
                    ix + 3,
                    yPosition + 6,
                  );
                  if (medOrderType) {
                    pdf.setFont("helvetica", "bold");
                    pdf.setFontSize(7);
                    const otW =
                      pdf.getTextWidth(medOrderType.toUpperCase()) + 5.6;
                    const otH = 7 * 0.42 + 1.3 * 2;
                    const reassessBadgeW = isReassessmentOnly
                      ? pdf.getTextWidth("REASSESSMENT") + 5.6
                      : 0;
                    setFill(C_GRAY200);
                    setDraw(C_GRAY200);
                    pdf.setLineWidth(0.2);
                    pdf.roundedRect(
                      ix +
                        iw -
                        otW -
                        2 -
                        (isReassessmentOnly ? reassessBadgeW + 2 : 0),
                      yPosition + 1.3,
                      otW,
                      otH,
                      otH / 2,
                      otH / 2,
                      "FD",
                    );
                    setText(C_GRAY700);
                    pdf.text(
                      medOrderType.toUpperCase(),
                      ix +
                        iw -
                        otW / 2 -
                        2 -
                        (isReassessmentOnly ? reassessBadgeW + 2 : 0),
                      yPosition + 1.3 + otH - 1.3 - 0.3,
                      { align: "center" },
                    );
                    if (isReassessmentOnly) {
                      setFill([224, 242, 254]);
                      setDraw([186, 230, 253]);
                      pdf.roundedRect(
                        ix + iw - reassessBadgeW - 2,
                        yPosition + 1.3,
                        reassessBadgeW,
                        otH,
                        otH / 2,
                        otH / 2,
                        "FD",
                      );
                      setText([3, 105, 161]);
                      pdf.text(
                        "REASSESSMENT",
                        ix + iw - reassessBadgeW / 2 - 2,
                        yPosition + 1.3 + otH - 1.3 - 0.3,
                        { align: "center" },
                      );
                    }
                  }
                  yPosition += subHdrH + 1;
                }
                // Started / Duration timing line
                 
                if (
                  !isReassessmentOnly &&
                  (entry.startTimestampValue || entry.duration)
                ) {
                   
                  pdf.setFont("helvetica", "normal");
                  pdf.setFontSize(7.5);
                  setText(C_TEXT_MUTED);
                  const timBits: string[] = [];
                  if (entry.startTimestampValue) {
                    timBits.push(
                      `Started: ${fmtAdminDate(entry.startTimestampValue)}`,
                    );
                  }
                  if (entry.duration) {
                    timBits.push(
                      `Duration: ${formatDurationLabel(entry.duration)}`,
                    );
                  }
                  pdf.text(
                    sanitizePdfText(timBits.join(" Â· ")),
                    ix,
                    yPosition + 3,
                  );
                  yPosition += 5;
                }
                // â”€â”€ Info chips row: Due / Dose / Route / Freq
                if (!isReassessmentOnly) {
                  const chips: string[] = [];
                  if (hasMedVal(medDueTimeVal)) {
                    chips.push(`Due: ${medDueTimeVal}`);
                  }
                  if (hasMedVal(medDoseVal)) {
                    chips.push(`Dose: ${medDoseVal}`);
                  }
                  if (hasMedVal(medRouteVal)) {
                    chips.push(`Route: ${medRouteVal}`);
                  }
                  if (hasMedVal(medFreqVal)) {
                    chips.push(`Freq: ${medFreqVal}`);
                  }
                  if (chips.length > 0) {
                    const chipTC: RGB = [109, 40, 217];
                    const chipBG: RGB = [245, 243, 255];
                    const chipBC: RGB = [221, 214, 254];
                    pdf.setFont("helvetica", "bold");
                    pdf.setFontSize(7.5);
                    const chipH = 7.5 * 0.42 + 1.3 * 2;
                    let chipX = ix;
                    chips.forEach((chip) => {
                      const chipW =
                        pdf.getTextWidth(sanitizePdfText(chip)) + 5.6;
                      if (chipX + chipW > ix + iw) {
                        chipX = ix;
                        yPosition += chipH + 2;
                      }
                      setFill(chipBG);
                      setDraw(chipBC);
                      pdf.setLineWidth(0.2);
                      pdf.roundedRect(
                        chipX,
                        yPosition,
                        chipW,
                        chipH,
                        chipH / 2,
                        chipH / 2,
                        "FD",
                      );
                      setText(chipTC);
                      pdf.text(
                        sanitizePdfText(chip),
                        chipX + 2.8,
                        yPosition + chipH - 1.3 - 0.3,
                      );
                      chipX += chipW + 2;
                    });
                    yPosition += chipH + 3;
                  }
                }
                // â”€â”€ Indication + Drug on hand + Drug Expiration (2-col grid â€” mirrors UI)
                if (
                  !isReassessmentOnly &&
                  (hasMedVal(medIndication) ||
                    hasMedVal(medDrugOnHand) ||
                    hasMedVal(medExpiration))
                ) {
                  const gridMid = ix + iw / 2; // center point â€” matches column dividers above
                  // Build slot list in UI order (Indication, Drug On Hand, Drug Expiration)
                  type GridSlot = {
                    kind: "text" | "pill";
                    label: string;
                    value: string;
                  };
                  const slots: GridSlot[] = [];
                  if (hasMedVal(medIndication)) {
                    slots.push({
                      kind: "text",
                      label: "INDICATION",
                      value: medIndication,
                    });
                  }
                  if (hasMedVal(medDrugOnHand)) {
                    slots.push({
                      kind: "text",
                      label: "DRUG ON HAND",
                      value: medDrugOnHand,
                    });
                  }
                  if (hasMedVal(medExpiration)) {
                    slots.push({
                      kind: "pill",
                      label: "DRUG EXPIRATION",
                      value: medExpiration,
                    });
                  }
                  const rowH = 14;
                  const drawSlot = (slot: GridSlot, sx: number, sy: number) => {
                    pdf.setFont("helvetica", "bold");
                    pdf.setFontSize(7);
                    setText(C_GRAY400);
                    pdf.text(slot.label, sx, sy + 3);
                    if (slot.kind === "text") {
                      pdf.setFont("helvetica", "bold");
                      pdf.setFontSize(10);
                      setText(C_GRAY900);
                      pdf.text(sanitizePdfText(slot.value), sx, sy + 9);
                    } else {
                      const isExpired = slot.value
                        .toLowerCase()
                        .startsWith("expired");
                      const expTC: RGB = isExpired
                        ? [185, 28, 28]
                        : [21, 128, 61];
                      const expBG: RGB = isExpired
                        ? [254, 242, 242]
                        : [240, 253, 244];
                      const expBC: RGB = isExpired
                        ? [252, 165, 165]
                        : [187, 247, 208];
                      drawPill(
                        isExpired ? "Expired" : "Not Expired",
                        sx,
                        sy + 4.5,
                        expTC,
                        expBG,
                        expBC,
                        { fontSize: 7.5 },
                      );
                    }
                  };
                  for (let i = 0; i < slots.length; i += 2) {
                    const left = slots[i];
                    const right = slots[i + 1];
                    drawSlot(left, ix, yPosition);
                    if (right) {
                      drawSlot(right, gridMid, yPosition);
                    }
                    yPosition += rowH;
                  }
                }

                // â”€â”€ VERIFICATION CHECKLIST
                if (!isReassessmentOnly) {
                  drawMedSep("Verification Checklist");
                  const verifRes = gradRes?.verificationResult;
                  const verifExp = verifRes?.expected ?? [];
                  const verifDoc = ((): string[] => {
                    if ((verifRes?.actual?.length ?? 0) > 0) {
                      return verifRes?.actual ?? [];
                    }
                    const items: string[] = [];
                    const pv = adminDet?.patientVerification as Record<string, unknown> | undefined;
                    const mv = adminDet?.medicationVerification as Record<string, unknown> | undefined;
                    if (pv?.nameChecked) {
                      items.push("Asked patient to state their full name");
                    }
                    if (pv?.dobChecked) {
                      items.push("Asked patient to state their date of birth");
                    }
                    if (pv?.wristbandChecked) {
                      items.push("Scanned/checked patient wristband");
                    }
                    if (mv?.nameVerified) {
                      items.push("Verified medication name");
                    }
                    if (mv?.expiryChecked) {
                      items.push("Verified medication is not expired");
                    }
                    if (mv?.allergiesVerified) {
                      items.push(
                        "Verified absence of allergies or contraindications",
                      );
                    }
                    if (mv?.indicationConfirmed) {
                      items.push("Verified medication strength/concentration");
                    }
                    return items;
                  })();
                  drawMedChecklist(
                    "Medication Verification",
                    normalizeChecklistList(
                      verifExp,
                      VERIFICATION_LABEL_MAP,
                      VERIFICATION_ORDER,
                    ),
                    normalizeChecklistList(
                      verifDoc,
                      VERIFICATION_LABEL_MAP,
                      VERIFICATION_ORDER,
                    ),
                    verifRes?.isCorrect ?? null,
                  );
                }

                // â”€â”€ CLINICAL DECISION
                if (!isReassessmentOnly) {
                  drawMedSep("Clinical Decision");
                  const cdComp = getComp("Clinical Decision");
                  const fallbackRaw = hasMedVal(medClinDec)
                    ? medClinDec
                    : hasMedVal(medStatus)
                      ? medStatus
                      : "";
                  const fallbackNorm = fallbackRaw.toLowerCase().trim();
                  const fallbackDoc =
                    fallbackNorm === "hold"
                      ? "Held"
                      : fallbackNorm === "refuse"
                        ? "Refused"
                        : fallbackRaw || undefined;
                  const cdExp = cdComp ? compStr(cdComp.expected) : undefined;
                  const cdActualFromComp = cdComp ? compStr(cdComp.actual) : "";
                  const cdDoc = hasMedVal(cdActualFromComp)
                    ? cdActualFromComp
                    : fallbackDoc;
                  drawMedCompRow(
                    "Clinical Decision",
                    cdExp,
                    cdDoc,
                    cdComp ? cdComp.isCorrect : null,
                  );
                  if (hasMedVal(medAssessmentFindings)) {
                    drawMedInfoLine(
                      "Applicable Assessment Findings",
                      medAssessmentFindings,
                    );
                  }
                  if (hasMedVal(medReasonNotGiven)) {
                    drawMedInfoLine("Reason", medReasonNotGiven);
                  }
                  if (hasMedVal(medRefusalReason)) {
                    drawMedInfoLine("Refusal reason", medRefusalReason);
                  }
                  if (hasMedVal(medInappropriateReason)) {
                    drawMedInfoLine(
                      "Inappropriate reason",
                      medInappropriateReason,
                    );
                  }
                  if (hasMedVal(medClinicalNote)) {
                    drawMedInfoLine("Note", medClinicalNote);
                  }
                }

                // â”€â”€ ADMINISTRATION DETAILS
                if (!isReassessmentOnly) {
                  const doseComp2 = getComp("Dose");
                  const qtyComp2 = getComp("Quantity");
                  const rsComp = getComp("Route vs Site") ?? getComp("Route");
                  const timeComp2 = getComp("Administration Time");
                  type MedRow = {
                    label: string;
                    exp: string | undefined;
                    doc: string | undefined;
                    ok: boolean | null;
                  };
                  const adminRows: MedRow[] = [];
                  const dExp = doseComp2
                    ? compStr(doseComp2.expected)
                    : undefined;
                  const dDoc = doseComp2
                    ? compStr(doseComp2.actual)
                    : hasMedVal(medAdminDose)
                      ? medAdminDose
                      : undefined;
                   
                  if (dExp || hasMedVal(dDoc)) {
                    adminRows.push({
                      label: "Dose",
                      exp: dExp,
                      doc: dDoc,
                      ok: doseComp2 ? doseComp2.isCorrect : null,
                    });
                  }
                  const qExp = qtyComp2
                    ? compStr(qtyComp2.expected)
                    : hasMedVal(medExpectedQty)
                      ? medExpectedQty
                      : undefined;
                  const qDoc = qtyComp2
                    ? compStr(qtyComp2.actual)
                    : hasMedVal(medQty)
                      ? medQty
                      : undefined;
                  if (qExp || hasMedVal(qDoc)) {
                    adminRows.push({
                      label: "Amount",
                      exp: qExp,
                      doc: qDoc,
                      ok: qtyComp2 ? qtyComp2.isCorrect : null,
                    });
                  }
                  const rsExp = rsComp ? compStr(rsComp.expected) : undefined;
                  const rsDoc = rsComp
                    ? compStr(rsComp.actual)
                    : [medRouteVal, medSite]
                        .filter((v) => hasMedVal(v))
                        .join(" (") + (hasMedVal(medSite) ? ")" : "") ||
                      undefined;
                  if (rsExp || hasMedVal(rsDoc)) {
                    adminRows.push({
                      label: "Route vs Site",
                      exp: rsExp,
                      doc: rsDoc,
                      ok: rsComp ? rsComp.isCorrect : null,
                    });
                  }
                   
                  const tExp = timeComp2
                    ? compStr(timeComp2.expected)
                    : undefined;
                  const tDoc = timeComp2
                    ? compStr(timeComp2.actual)
                    : hasMedVal(medTime)
                      ? medTime
                      : undefined;
                  // tExp/tDoc use || intentionally (truthiness check, not nullish guard)
                   
                  if (tExp || hasMedVal(tDoc)) {
                    adminRows.push({
                      label: "Administration Time",
                      exp: tExp,
                      doc: tDoc,
                      ok: timeComp2 ? timeComp2.isCorrect : null,
                    });
                  }
                  // Rate
                  const rateComp2 = getComp("Infusion Rate") ?? getComp("Rate");
                  const rExp = rateComp2
                    ? compStr(rateComp2.expected)
                    : undefined;
                  const rDoc = rateComp2
                    ? compStr(rateComp2.actual)
                    : hasMedVal(medRate)
                      ? medRate
                      : undefined;
                   
                  if (rExp || hasMedVal(rDoc)) {
                    adminRows.push({
                      label: "Rate",
                      exp: rExp,
                      doc: rDoc,
                      ok: rateComp2 ? rateComp2.isCorrect : null,
                    });
                  }
                  // Duration
                  const durComp2 =
                    getComp("Duration") ?? getComp("Infusion Duration");
                  const durExp = durComp2
                    ? compStr(durComp2.expected)
                    : undefined;
                  const durDoc = durComp2
                    ? compStr(durComp2.actual)
                    : hasMedVal(medInfusionDuration)
                      ? medInfusionDuration
                      : undefined;
                  if (hasMedVal(durDoc)) {
                    adminRows.push({
                      label: "Duration",
                      exp: durExp,
                      doc: durDoc,
                      ok: durComp2 ? durComp2.isCorrect : null,
                    });
                  }
                  if (adminRows.length > 0) {
                    // Mirror the in-app card logic: when the medication was not
                    // administered AND the clinical decision was graded correct,
                    // suppress Satisfactory/Unsatisfactory badges on every admin
                    // detail row (pass null so they render neutral/gray).
                    const nonAdminStatuses = [
                      "held",
                      "refused",
                      "inappropriate",
                      "missed",
                    ];
                    const isNonAdministered = nonAdminStatuses.includes(
                      (medStatus || medClinDec || "").toLowerCase().trim(),
                    );
                    const cdCompForNeutral = getComp("Clinical Decision");
                    const clinicalDecisionCorrect =
                      cdCompForNeutral?.isCorrect === true;
                    const forceNeutralAdminRows =
                      isNonAdministered && clinicalDecisionCorrect;

                    drawMedSep("Administration Details");
                    adminRows.forEach((r) =>
                      drawMedCompRow(
                        r.label,
                        r.exp,
                        r.doc,
                        forceNeutralAdminRows ? null : r.ok,
                      ),
                    );
                  }
                }

                // â”€â”€ PATIENT EDUCATION
                if (!isReassessmentOnly) {
                  drawMedSep("Patient Education");
                  const eduRes = gradRes?.educationResult;
                  const eduExp = eduRes?.expected ?? [];
                  const eduNotesVal = hasMedVal(medEducationNotes)
                    ? medEducationNotes
                    : ((adminDet?.patientEducation as Record<string, unknown> | undefined)?.educationNotes as string ?? "");
                  const eduDoc = ((): string[] => {
                    if ((eduRes?.actual?.length ?? 0) > 0) {
                      return eduRes?.actual ?? [];
                    }
                    const pe = adminDet?.patientEducation as Record<string, unknown> | undefined;
                    if (!pe) {
                      return [];
                    }
                    const items: string[] = [];
                    if (pe.discussedPurpose) {
                      items.push("Purpose Discussed");
                    }
                    if (pe.reviewedSideEffects) {
                      items.push("Side Effects Reviewed");
                    }
                    if (pe.providedInstructions) {
                      items.push("Instructions Provided");
                    }
                    if (pe.answeredQuestions) {
                      items.push("Questions Answered");
                    }
                    if (pe.patientUnderstanding) {
                      items.push("Patient Understanding");
                    }
                    return items;
                  })();
                  drawMedChecklist(
                    "Patient Education",
                    normalizeChecklistList(
                      eduExp,
                      EDUCATION_LABEL_MAP,
                      EDUCATION_ORDER,
                    ),
                    normalizeChecklistList(
                      eduDoc,
                      EDUCATION_LABEL_MAP,
                      EDUCATION_ORDER,
                    ),
                    eduRes?.isCorrect ?? null,
                  );
                  if (hasMedVal(eduNotesVal)) {
                    drawMedInfoLine("Educational notes", eduNotesVal);
                  }
                }

                // â”€â”€ REASSESSMENT FINDINGS
                if (isReassessmentOnly) {
                  drawMedSep("Reassessment Findings");
                  const reassessedAtVal = hasMedVal(medReassessedAt)
                    ? medReassessedAt
                    : typeof adminDet?.reassessedAt === "string"
                      ? adminDet.reassessedAt
                      : "";
                  const reassessedAtMs = reassessedAtVal
                    ? Date.parse(reassessedAtVal)
                    : NaN;
                  const reassessedAtLabel =
                    reassessedAtVal && !Number.isNaN(reassessedAtMs)
                      ? fmtAdminDate(reassessedAtMs)
                      : reassessedAtVal;
                  if (hasMedVal(reassessedAtLabel)) {
                    drawMedInfoLine("Reassessed at", reassessedAtLabel);
                  }
                  if (hasMedVal(medTimeElapsed)) {
                    drawMedInfoLine("Time Elapsed", medTimeElapsed);
                  }
                  drawMedInfoLine(
                    "Therapeutic response",
                    hasMedVal(medTherapeuticResponse)
                      ? medTherapeuticResponse
                      : "Not documented",
                  );
                  drawMedInfoLine(
                    "Adverse effects",
                    hasMedVal(medAdverseEffects)
                      ? medAdverseEffects
                      : "Not documented",
                  );
                  if (hasMedVal(medReassessmentNotes)) {
                    drawMedInfoLine("Notes", medReassessmentNotes);
                  }
                }

                // â”€â”€ ADMINISTRATION CONFIRMATION
                if (
                  !isReassessmentOnly &&
                  (hasMedVal(medAdminPat) ||
                    hasMedVal(medDisposal) ||
                    hasMedVal(medAdminNotes))
                ) {
                  drawMedSep("Administration Confirmation");
                  const confirmItems: { label: string; yes: boolean }[] = [];
                  if (hasMedVal(medAdminPat)) {
                    confirmItems.push({
                      label: "Administered to patient",
                      yes: /^yes$/i.test(medAdminPat),
                    });
                  }
                  if (hasMedVal(medDisposal)) {
                    confirmItems.push({
                      label: "Proper disposal confirmed",
                      yes: /^yes$/i.test(medDisposal),
                    });
                  }
                  confirmItems.forEach((ci) => {
                    if (yPosition + 6 > CONTENT_BOTTOM) {
                      drawFooter();
                      pdf.addPage();
                      pageNumber += 1;
                      drawPageHeader();
                    }
                    const dotC: RGB = ci.yes ? [6, 95, 70] : [156, 163, 175];
                    // Draw circle background
                    setFill(
                      ci.yes
                        ? ([209, 250, 229] as RGB)
                        : ([243, 244, 246] as RGB),
                    );
                    setDraw(dotC);
                    pdf.setLineWidth(0.2);
                    const circX = ix + 2.5;
                    const circY = yPosition + 2.5;
                    const circR = 2.2;
                    pdf.circle(circX, circY, circR, "FD");
                    // Draw checkmark inside circle using two lines (L-shape rotated)
                    if (ci.yes) {
                      pdf.setLineWidth(0.5);
                      setDraw([6, 95, 70]);
                      // Tick: short stroke down-right then longer stroke up-right
                      pdf.lines(
                        [
                          [0.8, 0.9],
                          [1.4, -1.4],
                        ],
                        circX - 1.2,
                        circY + 0.2,
                        [1, 1],
                        "S",
                      );
                      pdf.setLineWidth(0.2);
                    } else {
                      // X mark for no
                      pdf.setLineWidth(0.45);
                      setDraw([156, 163, 175]);
                      pdf.lines(
                        [[1.4, 1.4]],
                        circX - 0.7,
                        circY - 0.7,
                        [1, 1],
                        "S",
                      );
                      pdf.lines(
                        [[1.4, -1.4]],
                        circX - 0.7,
                        circY + 0.7,
                        [1, 1],
                        "S",
                      );
                      pdf.setLineWidth(0.2);
                    }
                    pdf.setFont("helvetica", ci.yes ? "bold" : "normal");
                    pdf.setFontSize(8.5);
                    setText(ci.yes ? ([6, 95, 70] as RGB) : C_TEXT_SECONDARY);
                    pdf.text(
                      sanitizePdfText(ci.label),
                      ix + 7,
                      yPosition + 3.5,
                    );
                    yPosition += 6;
                  });
                  if (hasMedVal(medAdminNotes)) {
                    drawMedInfoLine("Notes", medAdminNotes);
                  }
                  yPosition += 2;
                }

                // â”€â”€ ADMINISTRATION TIMING
                {
                  const hasTimingData =
                    !isReassessmentOnly &&
                    Boolean(
                       
                      entry.startTimestampValue ||
                      hasMedVal(atFormatted) ||
                      hasMedVal(structuredAtFormatted) ||
                      entry.timestampValue ||
                      hasMedVal(medTime) ||
                      entry.duration,
                    );
                  if (hasTimingData) {
                    drawMedSep("Administration Timing");
                    const timRows: { label: string; value: string }[] = [];
                    if (entry.startTimestampValue) {
                      timRows.push({
                        label: "Started",
                        value: fmtAdminDate(entry.startTimestampValue),
                      });
                    }
                    if (hasMedVal(atFormatted)) {
                      timRows.push({
                        label: atLabel || "Administered At",
                        value: atFormatted,
                      });
                    } else if (hasMedVal(structuredAtFormatted)) {
                      timRows.push({
                        label:
                          medStatus && medStatus !== "Administered"
                            ? `${medStatus} At`
                            : "Administered At",
                        value: structuredAtFormatted,
                      });
                    } else if (entry.timestampValue) {
                      const atLbl =
                        medStatus && medStatus !== "Administered"
                          ? `${medStatus} at`
                          : "Administered at";
                      timRows.push({
                        label: atLbl,
                        value: fmtAdminDate(entry.timestampValue),
                      });
                    }
                    if (hasMedVal(medTime)) {
                      timRows.push({
                        label: "Documented at (Sim Time)",
                        value: medTime,
                      });
                    }
                    if (entry.duration) {
                      timRows.push({
                        label: "Duration",
                        value: formatDurationLabel(entry.duration),
                      });
                    }
                    timRows.forEach((r) => {
                      if (yPosition + 5 > CONTENT_BOTTOM) {
                        drawFooter();
                        pdf.addPage();
                        pageNumber += 1;
                        drawPageHeader();
                      }
                      pdf.setFont("helvetica", "normal");
                      pdf.setFontSize(8.5);
                      setText(C_TEXT_SECONDARY);
                      pdf.text(sanitizePdfText(r.label), ix, yPosition + 3);
                      pdf.setFont("helvetica", "bold");
                      pdf.setFontSize(8.5);
                      setText(C_TEXT_PRIMARY);
                      const vW = pdf.getTextWidth(sanitizePdfText(r.value));
                      pdf.text(
                        sanitizePdfText(r.value),
                        ix + iw - vW,
                        yPosition + 3,
                      );
                      yPosition += 5;
                    });
                    yPosition += 2;
                  }
                }

                // â”€â”€ FINAL MEDICATION STATUS
                if (!isReassessmentOnly) {
                  drawMedSep("Final Medication Status");
                  const finalComp = getComp("Final Status");
                  const finalExp = finalComp
                    ? compStr(finalComp.expected)
                    : undefined;
                  const finalDoc = finalComp
                    ? compStr(finalComp.actual)
                    : medStatus || undefined;
                  drawMedCompRow(
                    "Final Status",
                    finalExp,
                    finalDoc,
                    finalComp ? finalComp.isCorrect : null,
                  );
                }
              } else {
                // Clinical Prompt sub-box
                if (entry.question) {
                  drawSubBox(
                    "Clinical Prompt",
                    entry.question,
                    [234, 88, 12] as RGB,
                    [255, 247, 237] as RGB,
                    [254, 215, 170] as RGB,
                    ix,
                    iw,
                  );
                }
                // Student Response sub-box
                if (entry.answer) {
                  let ansItems: string[] | undefined;
                  let ansStr = "";
                  if (entry.type === "ordering") {
                    // Extract ordered items to render as a numbered list (matches web UI <ol>)
                    if (entry.details?.includes(" ||| ")) {
                      const match = entry.details.match(
                        /Submitted:\s*(.*?)(?=\n|$|\|\s*Started:)/i,
                      );
                      const raw =
                        match?.[1] ??
                        entry.details.split(/\|\s*Started:/i)[0].trim();
                      ansItems = raw
                        .split(" ||| ")
                        .map((s: string) => s.trim())
                        .filter(Boolean);
                    } else {
                      if (Array.isArray(entry.answer)) {
                        // Answer is already an array â€” use directly to avoid
                        // incorrectly splitting item titles that contain commas.
                        ansItems = (entry.answer as string[])
                          .map((s: string) => s.trim())
                          .filter(Boolean);
                      } else {
                        const answerStr = String(entry.answer ?? "");
                        const rawItems = answerStr.includes(" ||| ")
                          ? answerStr.split(" ||| ")
                          : [answerStr];
                        ansItems = rawItems
                          .map((s: string) => s.trim())
                          .filter(Boolean);
                      }
                    }
                    ansStr = ansItems?.join(", ") ?? "";
                  } else {
                    ansStr = Array.isArray(entry.answer)
                      ? (entry.answer as string[]).join(", ")
                      : String(entry.answer ?? "");
                  }
                   
                  if ((ansItems && ansItems.length > 0) || ansStr.trim()) {
                    drawSubBox(
                      "Student Response",
                      ansStr,
                      [5, 150, 105] as RGB, // emerald-600
                      [236, 253, 245] as RGB,
                      [167, 243, 208] as RGB,
                      ix,
                      iw,
                      ansItems,
                    );
                  }
                }
                // Notes / Observations sub-box
                if (entry.notes ?? entry.observations) {
                  drawSubBox(
                    "Clinical Observations",
                    String(entry.notes ?? entry.observations ?? ""),
                    [37, 99, 235] as RGB,
                    [239, 246, 255] as RGB,
                    [191, 219, 254] as RGB,
                    ix,
                    iw,
                  );
                }
                // Satisfactory / Unsatisfactory badge at BOTTOM of card (matches UI)
                if ((entry as SummaryEntry & { satisfactory?: unknown }).satisfactory !== undefined) {
                  yPosition += 3;
                  const ok = !!(entry as SummaryEntry & { satisfactory?: unknown }).satisfactory;
                  drawStatusPill(
                    ok ? "Satisfactory" : "Unsatisfactory",
                    ix,
                    yPosition,
                    ok ? C_SUCCESS : C_DANGER,
                    ok ? C_SUCCESS_BG : C_DANGER_BG,
                    ok ? ([167, 243, 208] as RGB) : ([252, 165, 165] as RGB),
                  );
                  yPosition += 7;
                }
                // Vitals Data section â€” mirrors "Vital Signs Obtained" box in web UI.
                // Web UI shows this box whenever hasVitalsData = entry.vitals exists (even if empty).
                // Fallback to data.vitalsMapState ONLY for type=vital-signs entries.
                const hasVitalsDataPdf =
                  (entry as SummaryEntry & { vitals?: unknown }).vitals !==
                    null &&
                  typeof (entry as SummaryEntry & { vitals?: unknown })
                    .vitals === "object";
                if (!isDemoOrHist && hasVitalsDataPdf) {
                  const vitalDisplayMap: Record<string, string> = {
                    hr: "HR",
                    bp: "BP",
                    rr: "RR",
                    spo2: "SpO2",
                    temp: "Temp",
                  };

                  type VRow = { name: string; count: number; values: string[] };
                  const buildRows = (
                    src:
                      | Record<
                          string,
                          Array<{ title?: string; details?: string }>
                        >
                      | null
                      | undefined,
                  ): VRow[] => {
                    if (!src || typeof src !== "object") {
                      return [];
                    }
                    const rows: VRow[] = [];
                    Object.entries(src).forEach(([vid, readings]) => {
                      if (!Array.isArray(readings) || readings.length === 0) {
                        return;
                      }
                      const nm =
                        vitalDisplayMap[vid.toLowerCase()] ?? vid.toUpperCase();
                      const vals = readings.map((r) => {
                        if (typeof r === "string") {
                          return r;
                        }
                        return (
                          r.details?.replace(/^Value:\s*/i, "").trim() ?? "N/A"
                        );
                      });
                      rows.push({
                        name: nm,
                        count: readings.length,
                        values: vals,
                      });
                    });
                    return rows;
                  };

                  // 1. Primary: entry.vitals (mirrors web UI hasVitalsData check)
                  const ev = (entry as SummaryEntry & { vitals?: unknown })
                    .vitals;
                  let vRows: VRow[] = [];
                  if (ev && typeof ev === "object" && !Array.isArray(ev)) {
                    vRows = buildRows(
                      ev as Record<
                        string,
                        Array<{ title?: string; details?: string }>
                      >,
                    );
                  }

                  // 2. Fallback: data.vitalsMapState, but ONLY for vital-signs type entries
                  const isVitalSignsEntry =
                    entry.type === "vital-signs" || entry.type === "vital";
                  if (vRows.length === 0 && isVitalSignsEntry) {
                    vRows = buildRows(data.vitalsMapState ?? undefined);
                  }

                  // Always render the box when entry.vitals exists (matches web UI hasVitalsData),
                  // even when vRows is empty â€” web UI shows the header with no rows in that case.
                  {
                    yPosition += 4;
                    const vRowH = 6;
                    const vBoxH = 5 + 6 + vRows.length * vRowH + 3;
                    if (yPosition + vBoxH > CONTENT_BOTTOM) {
                      drawFooter();
                      pdf.addPage();
                      pageNumber += 1;
                      drawPageHeader();
                    }
                    setFill([255, 255, 255]);
                    setDraw(C_GRAY200);
                    pdf.setLineWidth(0.4);
                    pdf.roundedRect(
                      ix - 2,
                      yPosition,
                      iw + 4,
                      vBoxH,
                      2,
                      2,
                      "FD",
                    );
                    yPosition += 4;
                    pdf.setFont("helvetica", "bold");
                    pdf.setFontSize(7.5);
                    setText(C_GRAY400);
                    pdf.text("VITAL SIGNS OBTAINED:", ix, yPosition + 3);
                    yPosition += 7;
                    vRows.forEach((vr) => {
                      const nameStr = `${vr.name} x${vr.count}`;
                      const valueStr = `(${vr.values.join("; ")})`;
                      pdf.setFont("helvetica", "bold");
                      pdf.setFontSize(9);
                      setText(C_GRAY900);
                      pdf.text(sanitizePdfText(nameStr), ix, yPosition + 3);
                      const nameW = pdf.getTextWidth(nameStr) + 4;
                      pdf.setFont("helvetica", "bold");
                      pdf.setFontSize(9);
                      setText(cat.textColor);
                      pdf.text(
                        sanitizePdfText(valueStr),
                        ix + nameW,
                        yPosition + 3,
                      );
                      yPosition += vRowH;
                    });
                    yPosition += 2;
                  }
                }
                // General details (not already shown via question/answer)
                // Orders entries also show details in the UI's general details block
                if (
                  !entry.question &&
                  !entry.answer &&
                  !entry.notes &&
                  !entry.observations &&
                  entry.details
                ) {
                  const rawD = entry.details
                    .trim()
                    .split(/\|\s*Started:/i)[0]
                    .replace(/\s*Duration:\s*[\d\w\s]+/i, "")
                    .replace(/\s*Score:\s*\d+%\s*/i, "")
                    .trim();
                  if (rawD && !rawD.toLowerCase().startsWith("started:")) {
                    const isSubmittedList = rawD.startsWith("Submitted: ");
                    if (isSubmittedList) {
                      const listContent = rawD.substring("Submitted: ".length);
                      const items = listContent.includes(" ||| ")
                        ? listContent.split(" ||| ")
                        : listContent.split(",");
                      const listStr = items
                        .map((s: string, i: number) => `${i + 1}. ${s.trim()}`)
                        .join("\n");
                      drawSubBox(
                        "Submitted",
                        listStr,
                        C_TEXT_SECONDARY,
                        [249, 250, 251] as RGB,
                        C_GRAY200,
                        ix,
                        iw,
                      );
                    } else {
                      // Render general details as plain text (no "DETAILS" label),
                      // mirroring the web UI which shows the text inline in a
                      // light box without a heading.
                      pdf.setFont("helvetica", "normal");
                      pdf.setFontSize(11.25); // 15px
                      setText(C_TEXT_SECONDARY);
                      const dLines = pdf.splitTextToSize(
                        sanitizePdfText(rawD),
                        iw - 6,
                      ) as string[];
                      const dRowH = 5;
                      const dBoxH = dLines.length * dRowH + 5;
                      if (yPosition + dBoxH > CONTENT_BOTTOM) {
                        drawFooter();
                        pdf.addPage();
                        pageNumber += 1;
                        drawPageHeader();
                      }
                      setFill([249, 250, 251] as RGB);
                      setDraw(C_GRAY200);
                      pdf.setLineWidth(0.25);
                      pdf.roundedRect(ix, yPosition, iw, dBoxH, 1.5, 1.5, "FD");
                      pdf.text(dLines, ix + 3, yPosition + 4);
                      yPosition += dBoxH + 2;
                    }
                  }
                }
              }
            }
            yPosition += 1;
          },
          estH,
        );
      }

      yPosition += 2;
    });

    drawFooter();

    if (!opts?.returnDoc) {
      pdf.save(`transcript-${data.reportId}.pdf`);
    }
    return pdf;
}
