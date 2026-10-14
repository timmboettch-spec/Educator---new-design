type ScenarioRecord = Record<string, unknown>;

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

/** HS-online normalizeScenarioForRead parity (read path only). */
export function normalizeScenarioForStudentRead(scenario: ScenarioRecord): ScenarioRecord {
  const normalized: ScenarioRecord = { ...scenario };

  if ('timeline' in normalized) {
    delete normalized.timeline;
  }

  const pd = normalized.patientData as Record<string, unknown> | undefined;
  if (pd) {
    const vitals = { ...((pd.vitals as Record<string, unknown> | undefined) ?? {}) };

    if (isNonEmptyString(pd.Weight)) {
      if (!isNonEmptyString(vitals.weight)) {
        vitals.weight = pd.Weight;
      }
      delete pd.Weight;
    }

    if (isNonEmptyString(pd.Height)) {
      if (!isNonEmptyString(vitals.height)) {
        vitals.height = pd.Height;
      }
      delete pd.Height;
    }

    if (isNonEmptyString(pd.weight)) {
      if (!isNonEmptyString(vitals.weight)) {
        vitals.weight = pd.weight;
      }
      delete pd.weight;
    }

    if (isNonEmptyString(pd.height)) {
      if (!isNonEmptyString(vitals.height)) {
        vitals.height = pd.height;
      }
      delete pd.height;
    }

    pd.vitals = vitals;
  }

  const meta = normalized.metadata as Record<string, unknown> | undefined;
  if (meta) {
    if ('version' in meta) delete meta.version;
    if ('createdBy' in meta) delete meta.createdBy;
  }

  return normalized;
}
