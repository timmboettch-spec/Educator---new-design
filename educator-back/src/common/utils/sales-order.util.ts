/**
 * Parses the number of AI seats encoded in a sales-order-line SKU string.
 *
 * Part of the sales-order-lines Postgres migration — its only caller is
 * now SalesOrderLinesService (src/sales-order-lines/sales-order-lines.service.ts).
 *
 * Recognizes, in order:
 *   - "AI-SEAT-<n>" anywhere in the SKU
 *   - a "-AI<n>" suffix
 *   - a bare trailing "-<n>"
 * Returns 0 if none match.
 */
export function parseSeatTokensFromSku(sku?: string): number {
  if (!sku) return 0;

  const aiSeatMatch = sku.match(/AI-SEAT-(\d+)/i);
  if (aiSeatMatch) return parseInt(aiSeatMatch[1], 10);

  const aiSuffixMatch = sku.match(/-AI(\d+)$/i);
  if (aiSuffixMatch) return parseInt(aiSuffixMatch[1], 10);

  const trailingMatch = sku.match(/-(\d+)$/);
  if (trailingMatch) return parseInt(trailingMatch[1], 10);

  return 0;
}
