import "server-only"

import { randomUUID } from "node:crypto"

import { openVault } from "@/lib/vault"
import { EVIDENCE_FILE } from "@/lib/dashboard/profile-content"
import type { EvidenceRecord } from "@/lib/dashboard/types"

/**
 * `profile/evidence.yaml` — the append-only evidence log.
 *
 * The **dashboard is its only writer**: ticking a step tagged with a skill
 * appends a record here (what, when, which skill, where it came from). The
 * `/profile` skill reads the log and proposes skill-level promotions in
 * `profile/skills.yaml` — approve-gated — but never writes this file. That
 * split is what keeps one writer per file, and what keeps a future CV honest:
 * every claimed skill has a dated trail behind it.
 *
 * Append-only means exactly that: `appendEvidence` only ever adds to the end.
 * Nothing here edits or removes a record.
 */

interface EvidenceFile {
  evidence: EvidenceRecord[]
}

/** Read the whole log, oldest first (the order it was appended in). */
export async function getEvidence(): Promise<EvidenceRecord[]> {
  const vault = openVault()
  if (!(await vault.exists(EVIDENCE_FILE))) return []
  const data = await vault.readYaml<EvidenceFile | null>(EVIDENCE_FILE)
  const rows = Array.isArray(data?.evidence) ? data.evidence : []
  return rows.filter((row): row is EvidenceRecord => !!row && typeof row === "object")
}

/** The most recent `limit` records, newest first — what the Profile tab shows. */
export async function getRecentEvidence(limit = 10): Promise<EvidenceRecord[]> {
  return (await getEvidence()).slice(-limit).reverse()
}

/** What a caller supplies; `id` and `when` are stamped here, at write time. */
export interface EvidenceInput {
  skill: string
  what: string
  /** Where it came from, e.g. `goals:<stepId>`. Also the idempotency key. */
  source: string
  /** Override the timestamp (tests, backfills). Defaults to now. */
  when?: string
}

/**
 * Append one evidence record, atomically and as one labeled commit.
 *
 * Idempotent on `(source, skill)`: re-ticking the same step never inflates the
 * count, which would quietly turn one afternoon's work into a promotion. The
 * already-recorded entry is returned and nothing is written.
 *
 * Issue #77 (tagged goal steps) is the caller this exists for; until it lands,
 * the server action in `app/actions.ts` and the tests are the only ones.
 */
export async function appendEvidence(input: EvidenceInput): Promise<EvidenceRecord> {
  const skill = input.skill.trim()
  if (!skill) throw new Error("Evidence needs a skill.")
  const what = input.what.trim()
  if (!what) throw new Error("Evidence needs a description of what was done.")
  const source = input.source.trim()
  if (!source) throw new Error("Evidence needs a source, e.g. goals:<stepId>.")

  const evidence = await getEvidence()
  const already = evidence.find(
    (record) => record.source === source && record.skill === skill,
  )
  if (already) return already

  const record: EvidenceRecord = {
    id: randomUUID(),
    skill,
    what,
    when: input.when ?? new Date().toISOString(),
    source,
  }

  const vault = openVault()
  await vault.writeYaml(
    EVIDENCE_FILE,
    { evidence: [...evidence, record] },
    { message: "dashboard: append evidence" },
  )
  return record
}
