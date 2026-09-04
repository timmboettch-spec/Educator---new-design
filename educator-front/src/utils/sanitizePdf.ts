import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

// --- Score colour thresholds -----------------------------------------------
const SCORE_GREEN_MIN = 90; // >= this → green (excellent)
const SCORE_BLUE_MIN = 75; // >= this → blue  (good)
const SCORE_YELLOW_MIN = 60; // >= this → yellow (needs improvement)

/** Delay (ms) before revoking a temporary blob URL created for file downloads. */
const BLOB_URL_REVOKE_DELAY_MS = 60_000;

/**
 * Merge Tailwind CSS classes with proper precedence
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format date to readable string
 */
export function formatDate(date: string | Date | null | undefined): string {
  if (!date) {
    return "";
  }
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) {
    // If the string is already a formatted date (MM/DD/YYYY), return it
    if (typeof date === "string" && /^\d{2}\/\d{2}\/\d{4}$/.test(date)) {
      return date;
    }
    return typeof date === "string" ? date : "";
  }
  return d.toLocaleDateString("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
  });
}

/**
 * Format time to readable string
 */
export function formatTime(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const hours = String(d.getHours()).padStart(2, "0");
  const minutes = String(d.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

/**
 * Format duration in minutes to human readable
 */
export function formatDuration(minutes: number): string {
  if (minutes < 60) {
    return `${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hours}h ${mins}min` : `${hours}h`;
}

/**
 * Calculate progress percentage
 */
export function calculateProgress(completed: number, total: number): number {
  if (total === 0) {
    return 0;
  }
  return Math.round((completed / total) * 100);
}

/**
 * Truncate text to specified length
 */
export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }
  return text.substring(0, maxLength) + "...";
}

/**
 * Get difficulty color
 */
export function getDifficultyColor(difficulty: string): string {
  switch (difficulty.toLowerCase()) {
    case "easy":
      return "text-green-600 bg-green-50";
    case "medium":
      return "text-yellow-600 bg-yellow-50";
    case "hard":
      return "text-red-600 bg-red-50";
    default:
      return "text-gray-600 bg-gray-50";
  }
}

/**
 * Get score color based on value
 */
export function getScoreColor(score: number): string {
  if (score >= SCORE_GREEN_MIN) {
    return "text-green-600";
  }
  if (score >= SCORE_BLUE_MIN) {
    return "text-blue-600";
  }
  if (score >= SCORE_YELLOW_MIN) {
    return "text-yellow-600";
  }
  return "text-red-600";
}

/**
 * Debounce function
 */
export function debounce<T extends (...args: Parameters<T>) => ReturnType<T>>(
  func: T,
  wait: number,
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout;
  return function executedFunction(...args: Parameters<T>) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

/**
 * Generate unique ID
 */
export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Sleep/delay function
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Resolve image source URL
 */
export const resolveImageSrc = (path: string | undefined): string => {
  const BACKEND_URL = (
    process.env.NEXT_PUBLIC_IMAGE_BASE_URL || "http://localhost:4000"
  ).replace(/\/$/, "");
  if (!path) {
    return "";
  }
  if (path.startsWith("http") || path.startsWith("data:")) {
    return path;
  }
  if (path.startsWith("/")) {
    return `${BACKEND_URL}${path}`;
  }
  return `${BACKEND_URL}/${path}`;
};

/**
 * Sanitize text for jsPDF to avoid font/encoding issues
 * Replaces non-ASCII symbols with readable ASCII equivalents
 */
export function sanitizePdfText(text: unknown): string {
  if (!text) {
    return "";
  }
  return String(text)
    .replace(/[\u2080-\u2089]/g, (c) =>
      String.fromCharCode(c.charCodeAt(0) - 0x2080 + 48),
    ) // Subscripts 0-9
    .replace(/[\u2070-\u2079]/g, (c) =>
      String.fromCharCode(c.charCodeAt(0) - 0x2070 + 48),
    ) // Superscripts 0-9 (except 1,2,3 which are different blocks)
    .replace(/\u00B2/g, "2")
    .replace(/\u00B3/g, "3")
    .replace(/\u00B9/g, "1") // Special superscripts
    .replace(/–|—/g, "-")
    // eslint-disable-next-line no-control-regex
    .replace(/[^\u0000-\u00FF]/g, (c) => {
      const map: Record<string, string> = {
        "\u2018": "'",
        "\u2019": "'",
        "\u201C": '"',
        "\u201D": '"',
        "\u2026": "...",
        "\u00B0": "\u00B0",
        "\u2022": "* ",
        "\u00A0": " ", // non-breaking space
      };
      return map[c] ?? "";
    })
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Safely open a Base64/Data URL in a new tab by converting it to a Blob URL.
 * For regular URLs a HEAD preflight is performed first; returns `false` if the
 * file is not reachable (404 / network error) so the caller can show an error.
 */
export const openBase64InNewTab = async (dataUrl: string): Promise<boolean> => {
  try {
    if (!dataUrl.startsWith("data:")) {
      // For absolute URLs (e.g. Azure Blob Storage), open directly.
      // For relative paths (e.g. legacy /uploads/ local files), resolve via
      // the backend base URL so the request hits the backend static-file
      // server (or the Next.js /uploads proxy route) instead of loading the
      // full Next.js app at the frontend domain.
      // For relative paths (e.g. /uploads/file.pdf), always use the frontend
      // origin so the request goes through the Next.js /uploads proxy route
      // rather than hitting the backend directly. This keeps the preflight
      // same-origin and avoids CORS issues.
      const isRelative = dataUrl.startsWith("/");
      const resolvedUrl = isRelative
        ? typeof window !== "undefined"
          ? `${window.location.origin}${dataUrl}`
          : dataUrl
        : dataUrl.startsWith("http://") || dataUrl.startsWith("https://")
          ? dataUrl
          : resolveImageSrc(dataUrl);

      // Preflight-check same-origin and relative URLs via the Next.js proxy.
      // Skip the check for external URLs (e.g. Azure Blob Storage) because
      // they may block cross-origin HEAD requests with a CORS error even when
      // the file exists, which would cause a false-negative.
      const isSameOrigin =
        isRelative ||
        (typeof window !== "undefined" &&
          resolvedUrl.startsWith(window.location.origin));

      if (isSameOrigin) {
        try {
          const check = await fetch(resolvedUrl, {
            method: "HEAD",
            cache: "no-store",
          });
          if (!check.ok) {
            return false;
          }
        } catch {
          return false;
        }
      }

      window.open(resolvedUrl, "_blank");
      return true;
    }

    const parts = dataUrl.split(";base64,");
    if (parts.length !== 2) {
      return false;
    }

    const contentType = parts[0].split(":")[1];
    const raw = window.atob(parts[1]);
    const rawLength = raw.length;
    const uInt8Array = new Uint8Array(rawLength);

    for (let i = 0; i < rawLength; ++i) {
      uInt8Array[i] = raw.charCodeAt(i);
    }

    const blob = new Blob([uInt8Array], { type: contentType });
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank");

    // Clean up the URL object after some time to free memory
    setTimeout(() => URL.revokeObjectURL(url), BLOB_URL_REVOKE_DELAY_MS);
    return true;
  } catch {
    return false;
  }
};
