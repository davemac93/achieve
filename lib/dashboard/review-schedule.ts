/**
 * Pure weekly-review scheduling logic, isolated from the vault so it can be
 * unit-tested and shared by the dashboard and the review-due script. No I/O.
 */

export const WEEKLY_CADENCE_DAYS = 7
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/** Today as `YYYY-MM-DD` in local time. */
export function todayKey(now: Date = new Date()): string {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, "0")
  const d = String(now.getDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}

/** Whole days from `a` to `b` (both `YYYY-MM-DD`), via UTC midnight to dodge DST. */
export function daysBetween(a: string, b: string): number {
  const utc = (s: string) => {
    const [y, m, d] = s.split("-").map((n) => Number(n))
    return Date.UTC(y ?? 0, (m ?? 1) - 1, d ?? 1)
  }
  return Math.round((utc(b) - utc(a)) / 86_400_000)
}

/**
 * Is a weekly review due? Due when there has never been one, or when the most
 * recent review is at least `cadenceDays` old. A malformed last date counts as
 * "never reviewed", so the flag fails safe toward prompting a review.
 */
export function isWeeklyReviewDue(
  lastReviewDate: string | null,
  today: string,
  cadenceDays: number = WEEKLY_CADENCE_DAYS,
): boolean {
  if (!lastReviewDate || !DATE_RE.test(lastReviewDate)) return true
  return daysBetween(lastReviewDate, today) >= cadenceDays
}
