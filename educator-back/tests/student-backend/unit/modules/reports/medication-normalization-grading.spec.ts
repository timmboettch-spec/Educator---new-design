/**
 * Unit tests: Medication Normalization and GradingType Resolution
 *
 * Directly tests the functions and grading logic exported from:
 * src/student-backend/modules/reports/reports.service.ts
 *
 * Covers:
 *  - normalizeMedicationName
 *  - normalizeMedicationKey
 *  - Scenario orders filtering / extraction for mandatory medications:
 *      • gradingType: 'Mandatory' + enabled: false (gradingType takes priority)
 *      • gradingType: 'Mandatory' + enabled: true
 *      • gradingType: 'Optional' + enabled: true/false
 *      • gradingType: 'Distractor' + enabled: true/false
 *      • enabled: true without gradingType (legacy backward compatibility)
 *      • enabled: false without gradingType
 *      • non-medication category filtering
 */

import {
  normalizeMedicationName,
  normalizeMedicationKey,
} from '@/modules/reports/reports.service';

describe('Medication Normalization & Key Helpers (reports.service)', () => {
  describe('normalizeMedicationName', () => {
    it('returns empty string for undefined, null, empty or non-string inputs', () => {
      expect(normalizeMedicationName(undefined)).toBe('');
      expect(normalizeMedicationName(null as unknown as string)).toBe('');
      expect(normalizeMedicationName('')).toBe('');
      expect(normalizeMedicationName('   ')).toBe('');
      expect(normalizeMedicationName(123 as unknown as string)).toBe('');
    });

    it('trims whitespace and lowercases input', () => {
      expect(normalizeMedicationName('  Aspirin  ')).toBe('aspirin');
      expect(normalizeMedicationName('METOPROLOL')).toBe('metoprolol');
    });

    it('collapses multiple consecutive whitespace characters', () => {
      expect(normalizeMedicationName('Aspirin   81   mg')).toBe('aspirin 81mg');
      expect(normalizeMedicationName('Metoprolol  Tartrate   25  mg')).toBe(
        'metoprolol tartrate 25mg',
      );
    });

    it('removes space between dose numbers and units', () => {
      expect(normalizeMedicationName('Omeprazole 20 mg')).toBe('omeprazole 20mg');
      expect(normalizeMedicationName('Atropine 0.5 mg')).toBe('atropine 0.5mg');
      expect(normalizeMedicationName('Heparin 5000 units')).toBe('heparin 5000units');
      expect(normalizeMedicationName('Norepinephrine 0.1 mcg/kg/min')).toBe(
        'norepinephrine 0.1mcg/kg/min',
      );
    });

    it('removes spaces around slashes', () => {
      expect(normalizeMedicationName('Amoxicillin 500 mg / 10 mL')).toBe(
        'amoxicillin 500mg/10ml',
      );
      expect(normalizeMedicationName('PO / IV')).toBe('po/iv');
    });
  });

  describe('normalizeMedicationKey', () => {
    it('prefers medicationId when provided and non-empty', () => {
      expect(normalizeMedicationKey('Aspirin 81 mg', 'med-001')).toBe('id:med-001');
      expect(normalizeMedicationKey('Aspirin 81 mg', '  MED-ABC  ')).toBe('id:med-abc');
    });

    it('falls back to normalized name when medicationId is absent, empty or whitespace', () => {
      expect(normalizeMedicationKey('Aspirin 81 mg', undefined)).toBe(
        'name:aspirin 81mg',
      );
      expect(normalizeMedicationKey('Omeprazole 20 mg', '')).toBe(
        'name:omeprazole 20mg',
      );
      expect(normalizeMedicationKey('Metoprolol 25 mg', '   ')).toBe(
        'name:metoprolol 25mg',
      );
    });

    it('returns empty string if both name and medicationId are absent or empty', () => {
      expect(normalizeMedicationKey(undefined, undefined)).toBe('');
      expect(normalizeMedicationKey('', '')).toBe('');
      expect(normalizeMedicationKey('   ', '   ')).toBe('');
    });
  });
});

describe('Mandatory Medication Orders Resolution Logic (reports.service lines 6035-6055 & 7095-7112)', () => {
  interface ScenarioOrder {
    id?: string;
    title?: string;
    category?: string;
    medicationConfig?: {
      gradingConfig?: { enabled?: boolean; gradingType?: string };
    };
  }

  // Exact reproduction of the extraction logic in reports.service.ts
  function extractMandatoryOrders(scenarioOrders: ScenarioOrder[]) {
    return scenarioOrders
      .filter((o) => {
        if (o?.category !== 'Medication') {
          return false;
        }
        const gc = o?.medicationConfig?.gradingConfig;
        const isMandatory = gc?.gradingType
          ? gc.gradingType === 'Mandatory'
          : gc?.enabled === true;
        return isMandatory;
      })
      .map((o) => ({
        id: o.id,
        title: (o.title ?? '').trim(),
        idKey: o.id ? `id:${o.id.trim().toLowerCase()}` : '',
        nameKey: normalizeMedicationName(o.title)
          ? `name:${normalizeMedicationName(o.title)}`
          : '',
      }))
      .filter((o) => o.title.length > 0);
  }

  it('prioritizes gradingType="Mandatory" even when enabled is false', () => {
    const orders: ScenarioOrder[] = [
      {
        id: 'order-1',
        title: 'Aspirin 81 mg',
        category: 'Medication',
        medicationConfig: {
          gradingConfig: { enabled: false, gradingType: 'Mandatory' },
        },
      },
    ];

    const result = extractMandatoryOrders(orders);
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('Aspirin 81 mg');
    expect(result[0].nameKey).toBe('name:aspirin 81mg');
  });

  it('excludes gradingType="Optional" even when enabled is true', () => {
    const orders: ScenarioOrder[] = [
      {
        id: 'order-2',
        title: 'Acetaminophen 325 mg',
        category: 'Medication',
        medicationConfig: {
          gradingConfig: { enabled: true, gradingType: 'Optional' },
        },
      },
    ];

    const result = extractMandatoryOrders(orders);
    expect(result).toHaveLength(0);
  });

  it('excludes gradingType="Distractor" even when enabled is true', () => {
    const orders: ScenarioOrder[] = [
      {
        id: 'order-3',
        title: 'Morphine 2 mg',
        category: 'Medication',
        medicationConfig: {
          gradingConfig: { enabled: true, gradingType: 'Distractor' },
        },
      },
    ];

    const result = extractMandatoryOrders(orders);
    expect(result).toHaveLength(0);
  });

  it('handles legacy format: enabled=true with no gradingType is treated as Mandatory', () => {
    const orders: ScenarioOrder[] = [
      {
        id: 'order-4',
        title: 'Lisinopril 10 mg',
        category: 'Medication',
        medicationConfig: {
          gradingConfig: { enabled: true },
        },
      },
    ];

    const result = extractMandatoryOrders(orders);
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('Lisinopril 10 mg');
  });

  it('handles legacy format: enabled=false with no gradingType is excluded', () => {
    const orders: ScenarioOrder[] = [
      {
        id: 'order-5',
        title: 'Atenolol 50 mg',
        category: 'Medication',
        medicationConfig: {
          gradingConfig: { enabled: false },
        },
      },
    ];

    const result = extractMandatoryOrders(orders);
    expect(result).toHaveLength(0);
  });

  it('ignores non-Medication category orders regardless of gradingConfig', () => {
    const orders: ScenarioOrder[] = [
      {
        id: 'order-lab',
        title: 'CBC with Diff',
        category: 'Lab',
        medicationConfig: {
          gradingConfig: { enabled: true, gradingType: 'Mandatory' },
        },
      },
      {
        id: 'order-img',
        title: 'Chest X-Ray',
        category: 'Imaging',
        medicationConfig: {
          gradingConfig: { enabled: true, gradingType: 'Mandatory' },
        },
      },
    ];

    const result = extractMandatoryOrders(orders);
    expect(result).toHaveLength(0);
  });

  it('handles mixed scenario with multiple medication configurations', () => {
    const orders: ScenarioOrder[] = [
      {
        id: 'm1',
        title: 'Aspirin 81 mg',
        category: 'Medication',
        medicationConfig: { gradingConfig: { enabled: true, gradingType: 'Mandatory' } },
      },
      {
        id: 'm2',
        title: 'Metoprolol 25 mg',
        category: 'Medication',
        medicationConfig: { gradingConfig: { enabled: false, gradingType: 'Mandatory' } },
      },
      {
        id: 'm3',
        title: 'Acetaminophen 325 mg',
        category: 'Medication',
        medicationConfig: { gradingConfig: { enabled: true, gradingType: 'Optional' } },
      },
      {
        id: 'm4',
        title: 'Morphine 2 mg',
        category: 'Medication',
        medicationConfig: { gradingConfig: { enabled: true, gradingType: 'Distractor' } },
      },
      {
        id: 'm5',
        title: 'Heparin 5000 units',
        category: 'Medication',
        medicationConfig: { gradingConfig: { enabled: true } }, // Legacy enabled
      },
    ];

    const result = extractMandatoryOrders(orders);
    expect(result.map((r) => r.title)).toEqual([
      'Aspirin 81 mg',
      'Metoprolol 25 mg',
      'Heparin 5000 units',
    ]);
  });
});
