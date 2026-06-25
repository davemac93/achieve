#!/usr/bin/env node
/**
 * Weekly review-due check.
 *
 * Reports whether a weekly review is due, computed from the most recent file
 * under `reviews/weekly/`. Read-only — it never writes the vault. Run on a
 * schedule (e.g. a weekly cron, for AFK nudges) or by hand:
 *
 *   npm run review-due
 *
 * Honors `ACHIEVE_VAULT_DIR`; defaults to `<repo>/vault`. Exits 0 when a review
 * is due and 1 when it is not, so a cron wrapper can branch on it. Never reads
 * `diary/`.
 */

import { openVault } from '../lib/vault/index.ts'
import {
  daysBetween,
  isWeeklyReviewDue,
  todayKey,
} from '../lib/dashboard/review-schedule.ts'

const WEEKLY_DIR = 'reviews/weekly'
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

async function main(): Promise<void> {
  const vault = openVault()
  const dates = (await vault.list(WEEKLY_DIR))
    .filter((f) => f.endsWith('.md'))
    .map((f) => f.replace(/\.md$/, ''))
    .filter((d) => DATE_RE.test(d))
    .sort((a, b) => b.localeCompare(a))

  const last = dates[0] ?? null
  const today = todayKey()
  const due = isWeeklyReviewDue(last, today)

  if (due) {
    const age = last ? `${daysBetween(last, today)} days since ${last}` : 'no review yet'
    console.log(`Weekly review is DUE (${age}). Run the /review skill.`)
    process.exit(0)
  }

  console.log(`Weekly review not due (last: ${last}).`)
  process.exit(1)
}

main().catch((err) => {
  console.error(err)
  process.exit(2)
})
