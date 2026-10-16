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

/** Joins transcript lines, keeping the start and end of an over-long transcript so grading still fits the model's context. */
export function capTranscriptLines(lines: string[], maxChars: number): string {
  const full = lines.join('\n');
  if (full.length <= maxChars) return full;
  const headBudget = Math.floor(maxChars * 0.4);
  const tailBudget = maxChars - headBudget;
  const head: string[] = [];
  let used = 0;
  for (const line of lines) {
    if (used + line.length + 1 > headBudget) break;
    head.push(line);
    used += line.length + 1;
  }
  const tail: string[] = [];
  used = 0;
  for (let i = lines.length - 1; i >= head.length; i--) {
    if (used + lines[i].length + 1 > tailBudget) break;
    tail.unshift(lines[i]);
    used += lines[i].length + 1;
  }
  const omitted = lines.length - head.length - tail.length;
  const marker = `[... ${omitted} messages omitted from the middle of a very long session ...]`;
  return [...head, marker, ...tail].join('\n');
}
