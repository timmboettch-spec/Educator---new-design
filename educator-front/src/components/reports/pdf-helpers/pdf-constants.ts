/**
 * PDF colour palette + speaker / category / common-action metadata.
 *
 * RGB tuples ported from the Student transcript PDF
 * (`HS-online-AI-app/frontend/app/reports/[id]/transcript/page.tsx`
 * `handleDownloadTranscript`) and the on-page constants in
 * `frontend/app/reports/[id]/transcript/constants.tsx` — so the Educator PDF
 * uses the exact same colour values as the Student PDF and the on-screen
 * transcript view.
 *
 * Phase 1 of Student → Educator transcript PDF parity port.
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export type RGB = [number, number, number];

export type SpeakerIconType =
  'user' | 'activity' | 'message' | 'clipboard' | 'filetext' | 'info';

export interface SpeakerMeta {
  label: string;
  textColor: RGB;
  bgColor: RGB;
  borderColor: RGB;
  bubbleBg: RGB;
  /** Student speakers are right-aligned in the web UI. */
  rightAlign: boolean;
  iconType: SpeakerIconType;
}

export interface CategoryMeta {
  label: string;
  textColor: RGB;
  bgColor: RGB;
  borderColor: RGB;
}

export interface CommonActionMeta {
  textColor: RGB;
  bgColor: RGB;
  borderColor: RGB;
}

// ─── Base neutrals ───────────────────────────────────────────────────────────

export const C_BRAND: RGB = [232, 84, 26]; // #E8541A brand orange
export const C_WHITE: RGB = [255, 255, 255];
export const C_GRAY50: RGB = [249, 250, 251];
export const C_GRAY100: RGB = [243, 244, 246];
export const C_GRAY200: RGB = [229, 231, 235];
export const C_GRAY400: RGB = [156, 163, 175];
export const C_GRAY500: RGB = [107, 114, 128];
export const C_GRAY600: RGB = [75, 85, 99];
export const C_GRAY700: RGB = [55, 65, 81];
export const C_GRAY900: RGB = [17, 24, 39];
export const C_TEXT_PRIMARY: RGB = C_GRAY900;
export const C_TEXT_SECONDARY: RGB = C_GRAY600;
export const C_TEXT_MUTED: RGB = C_GRAY500;

// ─── Speaker palettes ────────────────────────────────────────────────────────

// Student / student_team_comm → orange (#FB6033)
export const C_STUDENT_TEXT: RGB = [251, 96, 51];
export const C_STUDENT_BG: RGB = [255, 240, 235]; // #FFF0EB
export const C_STUDENT_BORDER: RGB = [255, 231, 224]; // #FFE7E0
export const C_STUDENT_BUBBLE: RGB = [254, 242, 242]; // #fef2f2

// Patient (assistant) → teal
export const C_PATIENT_TEXT: RGB = [13, 148, 136]; // teal-600
export const C_PATIENT_BG: RGB = [240, 253, 250]; // teal-50
export const C_PATIENT_BORDER: RGB = [153, 246, 228]; // teal-200
export const C_PATIENT_BUBBLE: RGB = [240, 253, 244]; // #f0fdf4

// Provider → blue
export const C_PROVIDER_TEXT: RGB = [37, 99, 235]; // blue-600
export const C_PROVIDER_BG: RGB = [239, 246, 255]; // blue-50
export const C_PROVIDER_BORDER: RGB = [219, 234, 254]; // blue-100
export const C_PROVIDER_BUBBLE: RGB = [246, 249, 255];

// Orders (as a speaker) → pink
export const C_ORDER_TEXT: RGB = [219, 39, 119]; // pink-600
export const C_ORDER_BG: RGB = [253, 242, 248]; // pink-50
export const C_ORDER_BORDER: RGB = [252, 231, 243]; // pink-100

// SBAR (Team Communication as a speaker) → orange-600
export const C_SBAR_TEXT: RGB = [234, 88, 12]; // orange-600
export const C_SBAR_BG: RGB = [255, 247, 237]; // orange-50
export const C_SBAR_BORDER: RGB = [255, 237, 213]; // orange-100

// System → gray
export const C_SYSTEM_TEXT: RGB = C_GRAY500;
export const C_SYSTEM_BG: RGB = C_GRAY50;
export const C_SYSTEM_BORDER: RGB = C_GRAY100;

// ─── Category palettes ───────────────────────────────────────────────────────

// Vitals → green
export const C_VITAL_TEXT: RGB = [21, 128, 61]; // green-700
export const C_VITAL_BG: RGB = [240, 253, 244]; // #F0FDF4
export const C_VITAL_BORDER: RGB = [187, 247, 208]; // #BBF7D0

// Demographics → orange-700
export const C_DEMO_TEXT: RGB = [194, 65, 12]; // orange-700
export const C_DEMO_BG: RGB = C_GRAY50;
export const C_DEMO_BORDER: RGB = C_GRAY100;

// History → blue-700
export const C_HIST_TEXT: RGB = [29, 78, 216]; // blue-700
export const C_HIST_BG: RGB = [240, 247, 255]; // #F0F7FF
export const C_HIST_BORDER: RGB = [191, 219, 254]; // #BFDBFE

// Actions / clinical → blue
export const C_ACTION_TEXT: RGB = [29, 78, 216]; // blue-700
export const C_ACTION_BG: RGB = [239, 246, 255]; // #eff6ff
export const C_ACTION_BORDER: RGB = [191, 219, 254]; // blue-200

// Orders (as a category) → pink
export const C_ORDERS_TEXT: RGB = [219, 39, 119];
export const C_ORDERS_BG: RGB = [253, 242, 248];
export const C_ORDERS_BORDER: RGB = [252, 231, 243];

// Medications → violet-700
export const C_MED_TEXT: RGB = [109, 40, 217]; // violet-700
export const C_MED_BG: RGB = [245, 243, 255]; // #F5F3FF
export const C_MED_BORDER: RGB = [221, 214, 254]; // #DDD6FE

// Team Communication (as a category) → blue-700
export const C_TC_TEXT: RGB = [29, 78, 216];
export const C_TC_BG: RGB = [239, 246, 255];
export const C_TC_BORDER: RGB = [219, 234, 254];

// ─── Common action palettes ──────────────────────────────────────────────────

export const C_INFECTION_TEXT: RGB = [234, 88, 12]; // #EA580C
export const C_INFECTION_BG: RGB = [255, 240, 230]; // #fff0e6
export const C_INFECTION_BORDER: RGB = [254, 215, 170]; // #FED7AA
export const C_PRIVACY_TEXT: RGB = [13, 148, 136]; // #0D9488
export const C_PRIVACY_BG: RGB = [230, 250, 247]; // #e6faf7
export const C_PRIVACY_BORDER: RGB = [153, 246, 228]; // #99F6E4
export const C_ENV_TEXT: RGB = [37, 99, 235]; // #2563EB
export const C_ENV_BG: RGB = [239, 246, 255]; // #EFF6FF
export const C_ENV_BORDER: RGB = [191, 219, 254]; // #BFDBFE

// ─── Status / result palettes ────────────────────────────────────────────────

export const C_SUCCESS: RGB = [21, 128, 61]; // emerald-700
export const C_SUCCESS_BG: RGB = [209, 250, 229];
export const C_DANGER: RGB = [220, 38, 38]; // red-600
export const C_DANGER_BG: RGB = [254, 226, 226];

// ─── Date/time badge palettes (Real vs SIM) ──────────────────────────────────

export const C_REAL_TEXT: RGB = [21, 128, 61]; // green-700
export const C_REAL_BG: RGB = [240, 253, 244]; // green-50
export const C_REAL_BORDER: RGB = [34, 197, 94]; // green-500

export const C_SIM_TEXT: RGB = [29, 78, 216]; // blue-700
export const C_SIM_BG: RGB = [239, 246, 255]; // blue-50
export const C_SIM_BORDER: RGB = [59, 130, 246]; // blue-500

// ─── Speaker metadata lookup ─────────────────────────────────────────────────

/**
 * Return label, colour palette, alignment and icon type for a message
 * speaker. Mirrors `getSpeakerStyles()` in the Student constants.
 */
export function getSpeakerMeta(speaker: string): SpeakerMeta {
  switch (speaker) {
    case 'user':
      return {
        label: 'Student Response',
        textColor: C_STUDENT_TEXT,
        bgColor: C_STUDENT_BG,
        borderColor: C_STUDENT_BORDER,
        bubbleBg: C_STUDENT_BUBBLE,
        rightAlign: true,
        iconType: 'user',
      };
    case 'student_team_comm':
      return {
        label: 'Student Response - Team Communication',
        textColor: C_STUDENT_TEXT,
        bgColor: C_STUDENT_BG,
        borderColor: C_STUDENT_BORDER,
        bubbleBg: C_STUDENT_BUBBLE,
        rightAlign: true,
        iconType: 'user',
      };
    case 'provider':
      return {
        label: 'Provider',
        textColor: C_PROVIDER_TEXT,
        bgColor: C_PROVIDER_BG,
        borderColor: C_PROVIDER_BORDER,
        bubbleBg: C_PROVIDER_BUBBLE,
        rightAlign: false,
        iconType: 'message',
      };
    case 'sbar_report':
      return {
        label: 'Team Communication',
        textColor: C_SBAR_TEXT,
        bgColor: C_SBAR_BG,
        borderColor: C_SBAR_BORDER,
        bubbleBg: C_SBAR_BG,
        rightAlign: false,
        iconType: 'filetext',
      };
    case 'order':
      return {
        label: 'Orders',
        textColor: C_ORDER_TEXT,
        bgColor: C_ORDER_BG,
        borderColor: C_ORDER_BORDER,
        bubbleBg: C_ORDER_BG,
        rightAlign: false,
        iconType: 'clipboard',
      };
    case 'system':
      return {
        label: 'System',
        textColor: C_SYSTEM_TEXT,
        bgColor: C_SYSTEM_BG,
        borderColor: C_SYSTEM_BORDER,
        bubbleBg: C_SYSTEM_BG,
        rightAlign: false,
        iconType: 'info',
      };
    default: // assistant → Patient
      return {
        label: 'Patient Response',
        textColor: C_PATIENT_TEXT,
        bgColor: C_PATIENT_BG,
        borderColor: C_PATIENT_BORDER,
        bubbleBg: C_PATIENT_BUBBLE,
        rightAlign: false,
        iconType: 'activity',
      };
  }
}

// ─── Category metadata lookup ────────────────────────────────────────────────

/**
 * Return label + colour palette for a summary-entry category. Mirrors
 * `getCategoryMeta()` + `getDefaultCategoryStyle()` in the Student constants.
 * `title` short-circuits Team-Communication rows regardless of category.
 */
export function getCategoryMetaPdf(
  category?: string,
  title?: string
): CategoryMeta {
  if (title === 'Team Communication') {
    return {
      label: 'Team Communication',
      textColor: C_TC_TEXT,
      bgColor: C_TC_BG,
      borderColor: C_TC_BORDER,
    };
  }
  const c = (category ?? '').toLowerCase();
  if (c === 'vitals') {
    return {
      label: 'Vitals',
      textColor: C_VITAL_TEXT,
      bgColor: C_VITAL_BG,
      borderColor: C_VITAL_BORDER,
    };
  }
  if (c === 'demographics') {
    return {
      label: 'Demographics',
      textColor: C_DEMO_TEXT,
      bgColor: C_DEMO_BG,
      borderColor: C_DEMO_BORDER,
    };
  }
  if (c === 'history') {
    return {
      label: 'History',
      textColor: C_HIST_TEXT,
      bgColor: C_HIST_BG,
      borderColor: C_HIST_BORDER,
    };
  }
  if (c === 'actions' || c === 'action' || c === 'clinical') {
    return {
      label: 'Clinical Action',
      textColor: C_ACTION_TEXT,
      bgColor: C_ACTION_BG,
      borderColor: C_ACTION_BORDER,
    };
  }
  if (c === 'orders') {
    return {
      label: 'Orders',
      textColor: C_ORDERS_TEXT,
      bgColor: C_ORDERS_BG,
      borderColor: C_ORDERS_BORDER,
    };
  }
  if (c === 'medications') {
    return {
      label: 'Medications',
      textColor: C_MED_TEXT,
      bgColor: C_MED_BG,
      borderColor: C_MED_BORDER,
    };
  }
  if (c === 'team_communication') {
    return {
      label: 'Team Communication',
      textColor: C_TC_TEXT,
      bgColor: C_TC_BG,
      borderColor: C_TC_BORDER,
    };
  }
  if (c === 'ppe' || c === 'safety') {
    return {
      label: 'Common Actions',
      textColor: C_INFECTION_TEXT,
      bgColor: C_INFECTION_BG,
      borderColor: C_INFECTION_BORDER,
    };
  }
  return {
    label: category ?? 'Action',
    textColor: C_GRAY700,
    bgColor: C_GRAY50,
    borderColor: C_GRAY100,
  };
}

// ─── Common-action metadata lookup ───────────────────────────────────────────

/**
 * Return colour palette for a common-action type. Mirrors `TYPE_COLOR_MAP`
 * in the Student constants.
 */
export function getCommonActionMeta(type: string): CommonActionMeta {
  if (type === 'privacy') {
    return {
      textColor: C_PRIVACY_TEXT,
      bgColor: C_PRIVACY_BG,
      borderColor: C_PRIVACY_BORDER,
    };
  }
  if (type === 'environmental') {
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
  };
}
