/**
 * Goal file content model — the shape of `goals.yaml` and `goal-status.yaml`,
 * the renderers that produce them, and the one-time migration from the v1
 * schema (a `3yr` horizon and a hand-typed `progress` percentage) to the v2 one
 * (a `direction` north star and progress derived from ticked steps).
 *
 * Framework-free and side-effect free (no `server-only`, no disk access of its
 * own), like `profile-content.ts`, so three callers share it without dragging
 * server-only into plain node: the migration script, the dashboard read layer,
 * and the tests. `applyMigration` takes an already-opened `Vault`, so the
 * atomic write + one-labeled-commit guarantee is inherited rather than
 * reimplemented.
 */

import { stringify } from "yaml"
import type { Vault } from "@/lib/vault"
// Relative and extension-ful: the migration script runs under plain node, which
// resolves neither path aliases nor extension-less specifiers.
import { HORIZONS, type Horizon } from "./goal-tree.ts"
import type { Goal, GoalStatus } from "./types.ts"

export const GOALS_FILE = "goals.yaml"
export const STATUS_FILE = "goal-status.yaml"

/** The v1 horizon this migration retires. */
const LEGACY_DIRECTION = "3yr"

/** Header the template ships and the migration re-emits, so a file that has
 * been rewritten still documents its own schema. */
export const GOALS_HEADER = `# Goal definitions — primary writer: /goals skill. Dashboard reads only.
# Hierarchy: direction -> yearly -> monthly -> weekly via optional \`parent\` refs.
# A \`direction\` is a north star: no status, no progress, no deadline. Twelve
# months (\`yearly\`) is the hard ceiling for anything trackable.
# Strict tree softly enforced: orphans are allowed (flag them), the agent
# steers toward full linkage.
# Each entry: { id, horizon: direction|yearly|monthly|weekly, title, parent?,
#               orphan?, kind: learn|do, after: [ids], skill? }
# \`after\` is sequence (what waits on what), which \`parent\` (containment)
# cannot express; \`skill\` turns a tick into a profile evidence record.
`

export const STATUS_HEADER = `# Volatile per-step state — primary writer: dashboard. Agents read only.
# Split from goals.yaml so no file has two writers.
# Map of goal id -> { done: true|false }, for leaf steps only.
# There is no \`progress\` field on purpose: a goal's progress is the share of
# its leaf steps ticked, derived in lib/dashboard/goal-progress.ts. A number you
# can type is a number you can type without doing the work.
`

/** Render `goals.yaml`: the schema header, then the definitions. */
export function renderGoalsFile(goals: Goal[]): string {
  return GOALS_HEADER + stringify({ goals })
}

/** Render `goal-status.yaml`: the schema header, then the ticked map. */
export function renderStatusFile(status: Record<string, GoalStatus>): string {
  return STATUS_HEADER + stringify({ status })
}

function isHorizon(value: unknown): value is Horizon {
  return typeof value === "string" && (HORIZONS as readonly string[]).includes(value)
}

/**
 * Read one goal from YAML, tolerating the v1 schema.
 *
 * A `3yr` entry reads as the `direction` it became. This is a read-time
 * courtesy only — nothing is written back, so a vault that has not run
 * `npm run migrate-goals` still renders correctly while its file says `3yr`.
 */
export function normalizeGoal(raw: unknown): Goal | null {
  if (!raw || typeof raw !== "object") return null
  const entry = raw as Record<string, unknown>
  const id = typeof entry.id === "string" ? entry.id : ""
  if (!id) return null

  const rawHorizon = entry.horizon === LEGACY_DIRECTION ? "direction" : entry.horizon
  const goal: Goal = {
    id,
    horizon: isHorizon(rawHorizon) ? rawHorizon : (entry.horizon as Goal["horizon"]),
    title: typeof entry.title === "string" ? entry.title : "",
  }
  if (typeof entry.parent === "string") goal.parent = entry.parent
  if (entry.orphan === true) goal.orphan = true
  if (entry.kind === "learn" || entry.kind === "do") goal.kind = entry.kind
  if (Array.isArray(entry.after)) {
    const after = entry.after.filter((id): id is string => typeof id === "string")
    if (after.length > 0) goal.after = after
  }
  if (typeof entry.skill === "string" && entry.skill.trim()) goal.skill = entry.skill.trim()
  return goal
}

/**
 * Read one status entry, tolerating the v1 shape
 * (`{ status: not-started|in-progress|done, progress: 0-100 }`). Only `done`
 * survives: the old three-state status collapses to ticked-or-not, and the
 * typed percentage is dropped because progress is derived now.
 */
export function normalizeStatus(raw: unknown): GoalStatus | null {
  if (typeof raw === "boolean") return { done: raw }
  if (!raw || typeof raw !== "object") return null
  const entry = raw as Record<string, unknown>
  if (typeof entry.done === "boolean") return { done: entry.done }
  if (typeof entry.status === "string") return { done: entry.status === "done" }
  return null
}

/** One line of the migration preview: what changes, and why. */
export interface GoalMigrationChange {
  id: string
  message: string
}

export interface GoalsMigration {
  /** The migrated definitions — every id preserved, in file order. */
  goals: Goal[]
  /** The migrated per-step state, pruned to entries that still mean something. */
  status: Record<string, GoalStatus>
  changes: GoalMigrationChange[]
  /** Nothing to do: the vault is already on the v2 schema. */
  clean: boolean
}

/**
 * Migrate a v1 goals/status pair to the v2 schema.
 *
 * Non-destructive by construction:
 *
 * - **No id is ever renamed, and no goal is ever dropped** — that is what keeps
 *   `goal-status.yaml`, and every task linked to a weekly goal, attached.
 * - Exactly one thing changes on a goal: `3yr` becomes `direction`. Titles,
 *   parents and orphan flags are copied through untouched, and `kind`/`after`/
 *   `skill` are left for the `/goals` skill to propose rather than guessed at
 *   here.
 * - Status entries lose their typed `progress` (it is derived now) and collapse
 *   to `done`. Entries for a direction or for a container are dropped, since
 *   neither is tickable — each drop is reported so the user sees what went.
 */
export function migrateGoals(rawGoals: unknown, rawStatus: unknown): GoalsMigration {
  const changes: GoalMigrationChange[] = []

  const goalRows = Array.isArray((rawGoals as { goals?: unknown } | null)?.goals)
    ? ((rawGoals as { goals: unknown[] }).goals ?? [])
    : []
  const goals: Goal[] = []
  for (const row of goalRows) {
    const goal = normalizeGoal(row)
    if (!goal) continue
    const wasLegacy = (row as Record<string, unknown>).horizon === LEGACY_DIRECTION
    if (wasLegacy) {
      changes.push({
        id: goal.id,
        message: "3yr goal becomes a direction — a north star, no longer tracked",
      })
    }
    goals.push(goal)
  }

  const hasChild = new Set(goals.map((goal) => goal.parent).filter(Boolean) as string[])
  const byId = new Map(goals.map((goal) => [goal.id, goal]))

  const statusRows =
    (rawStatus as { status?: Record<string, unknown> } | null)?.status ?? {}
  const status: Record<string, GoalStatus> = {}
  for (const [id, row] of Object.entries(statusRows)) {
    const entry = normalizeStatus(row)
    if (!entry) continue
    const goal = byId.get(id)
    const legacyProgress = (row as Record<string, unknown> | null)?.progress

    if (goal?.horizon === "direction") {
      changes.push({ id, message: "status dropped — a direction is never done" })
      continue
    }
    if (goal && hasChild.has(id)) {
      changes.push({
        id,
        message: "status dropped — progress is derived from the steps beneath it",
      })
      continue
    }
    const legacyStatus = (row as Record<string, unknown> | null)?.status
    if (typeof legacyStatus === "string") {
      const was =
        typeof legacyProgress === "number"
          ? `"${legacyStatus}" (${legacyProgress}%)`
          : `"${legacyStatus}"`
      changes.push({
        id,
        message: `${was} becomes done: ${entry.done} — progress is the share of steps ticked now, never a typed number`,
      })
    }
    status[id] = entry
  }

  return { goals, status, changes, clean: changes.length === 0 }
}

/** What `applyMigration` wrote, for the script to report. */
export interface MigrationResult {
  written: string[]
  unchanged: string[]
}

/**
 * Write a migration, one labeled commit per file. Each file keeps its own
 * writer's label — `goals.yaml` is the `/goals` skill's (this runs on its
 * behalf, approve-gated), `goal-status.yaml` is the dashboard's. A file whose
 * content is already what we would write is reported as unchanged; the vault
 * layer commits nothing for an identical rewrite either.
 */
export async function applyMigration(
  vault: Vault,
  migration: GoalsMigration,
): Promise<MigrationResult> {
  const result: MigrationResult = { written: [], unchanged: [] }

  for (const [relPath, content] of [
    [GOALS_FILE, renderGoalsFile(migration.goals)],
    [STATUS_FILE, renderStatusFile(migration.status)],
  ] as const) {
    const current = (await vault.exists(relPath)) ? await vault.read(relPath) : null
    if (current === content) {
      result.unchanged.push(relPath)
      continue
    }
    await vault.write(relPath, content, {
      message:
        relPath === GOALS_FILE
          ? "/goals: migrate 3yr goals to directions"
          : "dashboard: migrate goal status to done/not-done",
    })
    result.written.push(relPath)
  }

  return result
}
