/**
 * Deterministic quote rotation.
 *
 * Given the current pointer into `quotes.yaml` and how many quotes exist,
 * return where the pointer should land next. Pure and side-effect free so the
 * daily rotation is trivially testable over any given file, and so it can be
 * shared by both the rotation script and the data layer without dragging in
 * `server-only` or path aliases.
 *
 * - No quotes            -> `null` (nothing to show).
 * - Missing/invalid `current` -> `0` (start at the first quote).
 * - Otherwise advance by one, wrapping at the end.
 */
export function nextQuoteIndex(
  current: number | null | undefined,
  count: number,
): number | null {
  if (count <= 0) return null
  if (
    current == null ||
    !Number.isInteger(current) ||
    current < 0 ||
    current >= count
  ) {
    return 0
  }
  return (current + 1) % count
}
