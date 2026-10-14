import { CommonStatus } from '../enums/status.enum';

export const ClassConstants = {
  VALIDATION: {
    NAME_MAX_LENGTH: 150,
  },
  TRANSFER: {
    ROUTES: {
      BULK: 'bulk',
      EDUCATOR_CLASSES: 'educators/:educatorId/classes',
      TARGET_EDUCATORS: 'educators/:educatorId/target-educators',
    },
    /** Provisional cap on classes per bulk call — revisit once the PO confirms and timing allows. */
    BULK_MAX_CLASSES: 50,
    /**
     * Share of the request timeout (`app.apiTimeoutMs`) a bulk transfer may spend moving classes;
     * the rest is headroom to record failures and respond before the timeout fires.
     */
    BULK_TIME_BUDGET_RATIO: 0.8,
    /**
     * Class statuses that can't be transferred (both spellings exist in the enum). Every other
     * status — including INACTIVE and DRAFT — is transferable.
     */
    BLOCKED_STATUSES: [CommonStatus.ARCHIVED, CommonStatus.ARCHIEVED],
  },
};

/**
 * Why one class in a bulk Class Transfer was not moved. Stable wire values — the frontend
 * switches on them, so never rename a member; add a new one instead.
 */
export enum ClassTransferFailureReason {
  CLASS_NOT_FOUND = 'CLASS_NOT_FOUND',
  CLASS_INACTIVE = 'CLASS_INACTIVE',
  /** The class is archived (status ARCHIVED / ARCHIEVED). */
  CLASS_ARCHIVED = 'CLASS_ARCHIVED',
  CLASS_NOT_OWNED_BY_SOURCE = 'CLASS_NOT_OWNED_BY_SOURCE',
  TARGET_NOT_IN_CLASS_SCHOOL = 'TARGET_NOT_IN_CLASS_SCHOOL',
  TARGET_NO_GOOGLE_CONNECTION = 'TARGET_NO_GOOGLE_CONNECTION',
  TRANSFER_FAILED = 'TRANSFER_FAILED',
  /** The request ran out of time before reaching this class; it was not attempted. */
  NOT_PROCESSED = 'NOT_PROCESSED',
}

/** Sort columns for the Class Transfer class list (`GET /class-transfers/educators/:id/classes`). */
export enum ClassTransferListSortField {
  CLASS_NAME = 'class_name',
  STUDENTS = 'students',
  STATUS = 'status',
  START_DATE = 'start_date',
  END_DATE = 'end_date',
}

/**
 * Sort columns for the Class Transfer receiving-educator list
 * (`GET /class-transfers/educators/:id/target-educators`).
 */
export enum ClassTransferTargetSortField {
  NAME = 'name',
  EMAIL = 'email',
}

/** Values the shared live-class scope SQL (`liveClassScopeSql`) compares against. */
export const ClassScopeConstants = {
  GOOGLE_CLASSROOM_ORIGIN: 'google_classroom',
};

/** File formats offered by `GET /classes/:id/export-student-codes?format=`. */
export enum StudentCodesExportFormat {
  CSV = 'csv',
  PDF = 'pdf',
}

/** Per-class student-codes export (`GET /classes/:id/export-student-codes`). */
export const ClassStudentCodesExportConstants = {
  DEFAULT_FORMAT: StudentCodesExportFormat.CSV,
  FILENAME_PREFIX: 'student-codes',
  FILENAME_FALLBACK: 'class',
  /** Same set `lookupByCode`/login treat as unable to sign in — exported codes must be usable. */
  EXCLUDED_STATUSES: [CommonStatus.INACTIVE, CommonStatus.ARCHIVED, CommonStatus.ARCHIEVED],
  FORMATS: {
    /** Rows fetched per keyset page while streaming — bounds memory regardless of class size. */
    CSV: { CONTENT_TYPE: 'text/csv; charset=utf-8', EXTENSION: 'csv', BATCH_SIZE: 1000 },
    /** Smaller batches keep each synchronous pdfkit drawing step short on the event loop. */
    PDF: { CONTENT_TYPE: 'application/pdf', EXTENSION: 'pdf', BATCH_SIZE: 250 },
  },
  CSV: {
    /** Lets Excel detect UTF-8 so non-ASCII names render correctly. */
    BOM: '﻿',
    /** RFC 4180 line terminator. */
    LINE_BREAK: '\r\n',
    LABELS: {
      CLASS_NAME: 'Class Name',
      SCHOOL: 'School',
      START_DATE: 'Start Date',
      END_DATE: 'End Date',
      STUDENT_CODE: 'Student Code',
      STUDENT_NAME: 'Student Name',
    },
  },
};

/** Layout of the student-codes PDF. Colours match the transactional mail templates. */
export const ClassStudentCodesPdfConstants = {
  PAGE_SIZE: 'LETTER',
  MARGIN: 40,
  COMPRESS: true,
  /** Relative to `src|dist/common/utils`; `nest-cli.json` copies `assets/**` into `dist`. */
  ASSETS_DIR: '../../assets',
  /** 600px-wide copy of the brand logo — sharp at print size, cheap to decode per document. */
  LOGO_FILE: 'realityworks-ai-logo-pdf.png',
  FONT_FILES: {
    REGULAR: 'fonts/NotoSans-Regular.ttf',
    BOLD: 'fonts/NotoSans-Bold.ttf',
    /** Loaded only when a value contains CJK characters (16 MB; only used glyphs are embedded). */
    CJK: 'fonts/NotoSansCJKsc-Regular.otf',
  },
  FONT_NAMES: { REGULAR: 'NotoSans', BOLD: 'NotoSans-Bold', CJK: 'NotoSansCJK' },
  CJK_PATTERN: /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u,
  COLORS: {
    TEXT: '#111827',
    HEADING: '#1f2a37',
    MUTED: '#6b7280',
    ACCENT: '#ff6b00',
    BORDER: '#e9edf2',
    HEADER_BG: '#faf6f1',
    ZEBRA_BG: '#fcfbf9',
  },
  FONT_SIZES: {
    TITLE: 18,
    SUBTITLE: 15,
    META: 9.5,
    CONTINUATION: 10,
    TABLE_HEADER: 8.5,
    CELL: 10.5,
    PAGE_CHROME: 8,
  },
  LOGO_HEIGHT: 20,
  /** Space from the top margin to the first-page divider under the logo row. */
  TOP_BAR_HEIGHT: 32,
  ROW_HEIGHT: 24,
  HEADER_ROW_HEIGHT: 26,
  CELL_PADDING_X: 12,
  BORDER_WIDTH: 0.75,
  NAME_COLUMN_RATIO: 0.6,
  /** Distance of the footer baseline area from the bottom edge (inside the bottom margin). */
  FOOTER_OFFSET: 28,
  /** Month names only; dates are assembled as `DD Mon YYYY` (`01 Sep 2026`). */
  DATE_LOCALE: 'en-US',
  DATE_SEPARATOR: ' – ',
  META_SEPARATOR: '  ·  ',
  EMPTY_NAME: '—',
  ELLIPSIS: '…',
  LABELS: {
    DOCUMENT: 'Student Codes',
    SUBTITLE: 'All Student Codes',
    STUDENT_NAME: 'STUDENT NAME',
    STUDENT_CODE: 'STUDENT CODE',
    EMPTY: 'No students with active codes',
    PAGE: 'Page',
    AUTHOR: 'Realityworks',
  },
};
