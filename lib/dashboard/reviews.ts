import "server-only"

import { openVault } from "@/lib/vault"
import { isWeeklyReviewDue, todayKey } from "@/lib/dashboard/review-schedule"

/**
 * Reviews are written by the `/review` skill (the primary writer of
 * `reviews/`). The dashboard only reads them — to compute the review-due flag.
 */

const WEEKLY_DIR = "reviews/weekly"
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/** Weekly-review dates (`YYYY-MM-DD`), newest first. */
export async function listWeeklyReviews(): Promise<string[]> {
  const vault = openVault()
  return (await vault.list(WEEKLY_DIR))
    .filter((f) => f.endsWith(".md"))
    .map((f) => f.replace(/\.md$/, ""))
    .filter((d) => DATE_RE.test(d))
    .sort((a, b) => b.localeCompare(a))
}

export interface ReviewStatus {
  /** The most recent weekly review's date, or null if none exists yet. */
  lastReviewDate: string | null
  /** Whether a weekly review is due as of `now`. */
  due: boolean
}

/** The weekly-review flag the dashboard surfaces. */
export async function getReviewStatus(now: Date = new Date()): Promise<ReviewStatus> {
  const dates = await listWeeklyReviews()
  const lastReviewDate = dates[0] ?? null
  return { lastReviewDate, due: isWeeklyReviewDue(lastReviewDate, todayKey(now)) }
}
