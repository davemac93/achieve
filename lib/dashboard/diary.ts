import "server-only"

import { openVault } from "@/lib/vault"

/**
 * Diary read/write for the dashboard.
 *
 * The privacy wall (see template/CLAUDE.md) blocks AI agents and skills from
 * the diary — NOT the person whose diary it is. The dashboard is that person's
 * own writing tool, so this is the one sanctioned module that touches `diary/`.
 * Nothing else in `lib/` may read it; a tripwire test enforces that.
 */

const DIR = "diary"
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/** Today's date as `YYYY-MM-DD` in local time. */
export function todayKey(now: Date = new Date()): string {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, "0")
  const d = String(now.getDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}

/** Guard the date so it can only ever name `diary/<YYYY-MM-DD>.md`. */
function assertDate(date: string): void {
  if (!DATE_RE.test(date)) throw new Error(`Invalid diary date: ${date}`)
}

/** Dates that have an entry, as `YYYY-MM-DD`, newest first. */
export async function listDiaryDates(): Promise<string[]> {
  const vault = openVault()
  return (await vault.list(DIR))
    .filter((f) => f.endsWith(".md"))
    .map((f) => f.replace(/\.md$/, ""))
    .filter((d) => DATE_RE.test(d))
    .sort((a, b) => b.localeCompare(a))
}

/** The entry body for a date, or `null` when none exists. */
export async function getDiaryEntry(date: string): Promise<string | null> {
  assertDate(date)
  const vault = openVault()
  const rel = `${DIR}/${date}.md`
  if (!(await vault.exists(rel))) return null
  return vault.read(rel)
}

/**
 * Create or overwrite the entry for a date. An empty body removes the entry,
 * so clearing the editor and saving deletes that day's file.
 */
export async function saveDiaryEntry(date: string, content: string): Promise<void> {
  assertDate(date)
  const vault = openVault()
  const rel = `${DIR}/${date}.md`
  const body = content.replace(/\r\n/g, "\n").trimEnd()

  if (!body) {
    if (await vault.exists(rel)) {
      await vault.remove(rel, { message: "dashboard: delete diary entry" })
    }
    return
  }

  await vault.write(rel, `${body}\n`, { message: "dashboard: write diary entry" })
}
