import { Injectable, Logger } from '@nestjs/common';

import { LoggerService } from '../../../common/services';

import {
  type ChecklistItem,
  type ChecklistItemStatus,
  type PPEScoreResult,
} from './types/scoring.types';

/** Legacy checklist item shape that may carry a boolean `mandatory` flag
 *  instead of a `status` string. */
type LegacyChecklistItem = ChecklistItem & { mandatory?: boolean };

/**
 * Canonical PPE items mirroring the frontend PPE_SECTIONS.
 * These IDs and texts match the Common Actions Panel labels exactly.
 * Used as a fallback when stored checklistItems are old-format.
 */
const CANONICAL_PPE_ITEMS: ChecklistItem[] = [
  // Infection Prevention
  { id: 'ppe-inf-1a', text: 'Eye Protection Donned', status: 'Optional' },
  { id: 'ppe-inf-1b', text: 'Eye Protection Doffed', status: 'Optional' },
  { id: 'ppe-inf-2a', text: 'Isolation Gown Donned', status: 'Optional' },
  { id: 'ppe-inf-2b', text: 'Isolation Gown Doffed', status: 'Optional' },
  { id: 'ppe-inf-3a', text: 'Standard Gloves Donned', status: 'Mandatory' },
  { id: 'ppe-inf-3b', text: 'Standard Gloves Doffed', status: 'Mandatory' },
  { id: 'ppe-inf-4a', text: 'Sterile Gloves Donned', status: 'Optional' },
  { id: 'ppe-inf-4b', text: 'Sterile Gloves Doffed', status: 'Optional' },
  {
    id: 'ppe-inf-5a',
    text: 'Respirator Mask (N95) Donned',
    status: 'Optional',
  },
  {
    id: 'ppe-inf-5b',
    text: 'Respirator Mask (N95) Doffed',
    status: 'Optional',
  },
  { id: 'ppe-inf-6a', text: 'Surgical Mask Donned', status: 'Optional' },
  { id: 'ppe-inf-6b', text: 'Surgical Mask Doffed', status: 'Optional' },
  { id: 'ppe-inf-7', text: 'Hand Hygiene Performed', status: 'Mandatory' },
  { id: 'ppe-inf-8', text: 'Sharps Discarded', status: 'Optional' },
  {
    id: 'ppe-inf-9',
    text: 'Non-Infectious Waste Discarded',
    status: 'Optional',
  },
  { id: 'ppe-inf-10', text: 'Infectious Waste Discarded', status: 'Optional' },
  // Privacy & Modesty
  { id: 'ppe-prv-1', text: 'Knock / Announce Entry', status: 'Mandatory' },
  { id: 'ppe-prv-2a', text: 'Door Closed', status: 'Optional' },
  { id: 'ppe-prv-2b', text: 'Door Opened', status: 'Optional' },
  { id: 'ppe-prv-3a', text: 'Curtain Drawn', status: 'Optional' },
  { id: 'ppe-prv-3b', text: 'Curtain Opened', status: 'Optional' },
  // Environmental Safety
  { id: 'ppe-env-1a', text: 'Bed/Chair Locked', status: 'Optional' },
  { id: 'ppe-env-2a', text: 'Bed/Chair Alarm Activated', status: 'Optional' },
  {
    id: 'ppe-env-3a',
    text: 'Bed Lowered to Lowest Position',
    status: 'Optional',
  },
  { id: 'ppe-env-4', text: 'Call Light In Reach', status: 'Optional' },
  { id: 'ppe-env-5', text: 'Equipment Checked', status: 'Optional' },
  {
    id: 'ppe-env-6',
    text: 'Lines / Tubes / Drains Checked',
    status: 'Optional',
  },
  { id: 'ppe-env-7', text: 'Personal Items Within Reach', status: 'Optional' },
];

/** IDs that belong to the canonical PPE format. */
const CANONICAL_PPE_IDS = new Set(CANONICAL_PPE_ITEMS.map((i) => i.id));

/**
 * Merge stored checklistItems with CANONICAL_PPE_ITEMS.
 * - If a stored item has a canonical ID, apply its configured status.
 * - Items not present in the store keep their canonical default status.
 * - Old-format items (IDs not in CANONICAL_PPE_IDS) are ignored.
 */
function resolveChecklistItems(stored: ChecklistItem[]): ChecklistItem[] {
  const logger = new Logger('PpePrivacyService');
  const hasCanonical = stored.some((ci) => CANONICAL_PPE_IDS.has(ci.id));
  const statusOverrides = new Map<string, ChecklistItemStatus>(
    stored
      .filter((ci) => CANONICAL_PPE_IDS.has(ci.id))
      .map((ci) => [ci.id, ci.status ?? 'Mandatory']),
  );

  if (!hasCanonical) {
    // Old-format items — log and fall back to full canonical list
    logger.log(
      `Old-format checklistItems detected (ids: ${stored
        .map((c) => c.id)
        .join(', ')}). Falling back to canonical PPE list.`,
    );
    return CANONICAL_PPE_ITEMS;
  }

  // Apply any instructor-configured status overrides
  return CANONICAL_PPE_ITEMS.map((ci) => ({
    ...ci,
    status: statusOverrides.get(ci.id) ?? ci.status,
  }));
}

/**
 * Explicit mapping from normalised action-log label → canonical PPE item ID.
 * Source of truth: CommonActions.tsx (togglePPE / togglePrivacy / toggleEnvironmental).
 *
 * normalizeLabel() strips non-alphanumeric chars and lowercases, so
 *   "Surgical/Procedural Mask Donned" → "surgicalprocedural mask donned"
 *   "Bed/Chair Locked Confirmed"      → "bedchair locked confirmed"
 */
const ACTION_LABEL_TO_PPE_ID: Record<string, string> = {
  // ── Privacy & Modesty ────────────────────────────────────────────────────
  'door knocked': 'ppe-prv-1', // Knock / Announce Entry
  'knocking stopped': 'ppe-prv-1', // same toggle off
  'door closed': 'ppe-prv-2a', // Door Closed
  'door opened': 'ppe-prv-2b', // Door Opened
  'curtain closed': 'ppe-prv-3a', // Curtain Drawn
  'curtain opened': 'ppe-prv-3b', // Curtain Opened
  // ── Infection Prevention — don ───────────────────────────────────────────
  'eye protection donned': 'ppe-inf-1a',
  'isolation gown donned': 'ppe-inf-2a', // Isolation Gown Donned
  'standard gloves donned': 'ppe-inf-3a', // Standard Gloves Donned
  'sterile gloves donned': 'ppe-inf-4a', // Sterile Gloves Donned
  'respirator mask donned': 'ppe-inf-5a', // Respirator Mask (N95) Donned
  'surgicalprocedural mask donned': 'ppe-inf-6a', // Surgical/Procedural → Surgical Mask Donned
  'hand hygiene performed': 'ppe-inf-7',
  // ── Infection Prevention — doff ──────────────────────────────────────────
  'eye protection doffed': 'ppe-inf-1b',
  'isolation gown doffed': 'ppe-inf-2b', // Isolation Gown Doffed
  'standard gloves doffed': 'ppe-inf-3b', // Standard Gloves Doffed
  'sterile gloves doffed': 'ppe-inf-4b',
  'respirator mask doffed': 'ppe-inf-5b',
  'surgicalprocedural mask doffed': 'ppe-inf-6b',
  // ── Environmental Safety ────────────────────────────────────────────────
  'bedchair locked confirmed': 'ppe-env-1a', // Bed/Chair Locked
  'bedchair alarm activated': 'ppe-env-2a',
  'bed lowest position confirmed': 'ppe-env-3a', // Bed Lowered to Lowest Position
  'call light in reach confirmed': 'ppe-env-4',
  'equipment checked': 'ppe-env-5',
  'lines  tubes  drains checked': 'ppe-env-6', // "/" stripped → double space
  'lines tubes drains checked': 'ppe-env-6', // alternate normalisation
  'personal items within reach confirmed': 'ppe-env-7',
  // ── Sharps / Waste ──────────────────────────────────────────────────────
  'sharps discarded': 'ppe-inf-8',
  'noninfectious waste discarded': 'ppe-inf-9',
  'infectious waste discarded': 'ppe-inf-10',
};

/** Strip non-alphanumeric characters (except spaces) and lowercase. */
function normalizeLabel(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .trim();
}

@Injectable()
export class PpePrivacyService {
  constructor(private readonly logger: LoggerService) {}

  /**
   * Action-log-based PPE / privacy score.
   * An item is considered detected when the action log contains a matching entry.
   * The transcript is NOT used — no AI, no fuzzy matching.
   *
   * Formula: (Detected mandatory items ÷ Total mandatory items) × 100
   */
  computePPEScore(
    rawChecklistItems: ChecklistItem[],
    _transcript: string,
    actionLog: Array<{ label: string; timestamp: string; type: string }> = [],
  ): PPEScoreResult {
    // Upgrade old-format (ea-1…ea-8) items to canonical PPE list.
    // When no checklist items are configured at all, fall back to the full
    // canonical list so that any PPE actions the student performed are still
    // matched and credited via the action log.
    const checklistItems =
      rawChecklistItems && Array.isArray(rawChecklistItems)
        ? rawChecklistItems.length > 0
          ? resolveChecklistItems(rawChecklistItems)
          : []
        : CANONICAL_PPE_ITEMS;

    this.logger.log(
      `computePPEScore called — checklistItems: ${checklistItems?.length ?? 'undefined'} | actionLog: ${actionLog?.length ?? 'undefined'}`,
    );

    if (!checklistItems || checklistItems.length === 0) {
      this.logger.log('Early return: no checklistItems');
      return {
        totalConfiguredItems: 0,
        totalStandalonePPE: 0,
        completedPPE: 0,
        ppeScore: 0,
        matchedItems: [],
        unmatchedItems: [],
      };
    }

    // ── Build scoreable items (skip Exclude) ─────────────────────────────────
    const scoreableItems: Array<{
      ci: ChecklistItem;
      status: ChecklistItemStatus;
    }> = [];
    for (const ci of checklistItems) {
      let status: ChecklistItemStatus = ci.status ?? 'Mandatory';
      if (!ci.status && (ci as LegacyChecklistItem).mandatory === false) {
        status = 'Optional';
      }
      if (status === 'Exclude') {
        continue;
      }
      scoreableItems.push({ ci, status });
    }

    if (scoreableItems.length === 0) {
      this.logger.log('Early return: all items excluded');
      return {
        totalConfiguredItems: checklistItems.length,
        totalStandalonePPE: 0,
        completedPPE: 0,
        ppeScore: 100,
        matchedItems: [],
        unmatchedItems: [],
      };
    }

    // ── Build detected-IDs set from action log via explicit dictionary ────────
    const actionLogEntries = (actionLog || []).filter((a) => a.label);

    if (actionLogEntries.length === 0) {
      this.logger.log('Early return: action log is empty');
      const mandatoryItems = scoreableItems.filter((s) => s.status === 'Mandatory');
      return {
        totalConfiguredItems: checklistItems.length,
        totalStandalonePPE: mandatoryItems.length,
        completedPPE: 0,
        ppeScore: mandatoryItems.length > 0 ? 0 : 100, // 100% if all items optional
        matchedItems: [],
        unmatchedItems: mandatoryItems.map((s) => s.ci.text),
      };
    }

    // Map: canonical PPE ID → { label: original action log label, count: number of times performed }
    const detectedPpeIds = new Map<string, { label: string; count: number }>();
    for (const entry of actionLogEntries) {
      const norm = normalizeLabel(entry.label);
      const ppeId = ACTION_LABEL_TO_PPE_ID[norm];
      if (ppeId) {
        const existing = detectedPpeIds.get(ppeId);
        if (existing) {
          existing.count++;
        } else {
          detectedPpeIds.set(ppeId, { label: entry.label, count: 1 });
        }
      }
    }

    this.logger.debug(
      `Action log entries: ${JSON.stringify(actionLogEntries.map((a) => a.label))}`,
    );
    this.logger.debug(
      `Detected PPE IDs: ${JSON.stringify(
        [...detectedPpeIds.entries()].map(
          ([id, { label, count }]) => `${id} ← "${label}" (×${count})`,
        ),
      )}`,
    );

    // ── Score each item ───────────────────────────────────────────────────────
    const matchedItems: PPEScoreResult['matchedItems'] = [];
    const unmatchedItems: string[] = [];
    let totalMandatory = 0;
    let completedMandatory = 0;

    for (const { ci, status } of scoreableItems) {
      const isMandatory = status === 'Mandatory';
      if (isMandatory) {
        totalMandatory++;
      }

      const matchedData = detectedPpeIds.get(ci.id);
      this.logger.debug(
        `"${ci.text}" (id: ${ci.id}) → ${matchedData ? `MATCHED: "${matchedData.label}" (×${matchedData.count})` : 'NO MATCH'}`,
      );

      if (matchedData) {
        matchedItems.push({
          checklistText: ci.text,
          matchedAction: matchedData.label,
          status,
          count: matchedData.count,
        });
        if (isMandatory) {
          completedMandatory++;
        }
      } else {
        if (isMandatory) {
          unmatchedItems.push(ci.text);
        }
      }
    }

    const totalStandalonePPE = totalMandatory;
    const completedPPE = completedMandatory;
    const ppeScore =
      totalStandalonePPE > 0 ? Number(((completedPPE / totalStandalonePPE) * 100).toFixed(2)) : 100;

    return {
      totalConfiguredItems: checklistItems.length,
      totalStandalonePPE,
      completedPPE,
      ppeScore,
      matchedItems,
      unmatchedItems,
    };
  }
}
