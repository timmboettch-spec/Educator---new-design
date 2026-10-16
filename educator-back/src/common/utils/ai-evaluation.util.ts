import type { AiConceptEvaluation, AiConceptResultItem } from 'src/common/interfaces';

/** Smaller self-hosted models often return the bare results array instead of `{ results: [...] }`. */
export function getAiConceptResults(
  parsed: AiConceptEvaluation | AiConceptResultItem[] | null | undefined,
): AiConceptResultItem[] {
  if (Array.isArray(parsed)) return parsed;
  return parsed?.results ?? [];
}

/** Tolerates a model echoing the id without its prefix (e.g. `123_abc` for `concept_123_abc`). */
export function isSameConceptId(aiId: string | undefined, conceptId: string): boolean {
  const id = (aiId ?? '').trim();
  if (!id) return false;
  return id === conceptId || conceptId.endsWith(`_${id}`) || id.endsWith(`_${conceptId}`);
}
