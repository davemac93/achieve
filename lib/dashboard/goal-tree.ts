import type { Goal } from "./types"

/**
 * Pure goal-tree logic, isolated from the vault so it can be unit-tested and
 * shared between the dashboard and the `/goals` skill's contract. No I/O.
 */

export const HORIZONS = ["3yr", "yearly", "monthly", "weekly"] as const
export type Horizon = (typeof HORIZONS)[number]

/** The horizon a goal's parent must occupy — exactly one level coarser. */
const PARENT_HORIZON: Record<Horizon, Horizon | null> = {
  "3yr": null,
  yearly: "3yr",
  monthly: "yearly",
  weekly: "monthly",
}

/** Tree depth used for indentation: 3yr=0, yearly=1, monthly=2, weekly=3. */
export function horizonDepth(horizon: string): number {
  const i = HORIZONS.indexOf(horizon as Horizon)
  return i < 0 ? 0 : i
}

export interface GoalTreeIssue {
  id: string
  message: string
}

export interface GoalTreeReport {
  ok: boolean
  errors: GoalTreeIssue[]
  /** ids with no valid parent link (missing/unflagged), excluding 3yr roots. */
  orphans: string[]
}

/**
 * Validate `goals.yaml` against the soft-tree schema: well-formed entries,
 * unique ids, and parent references that point one horizon coarser. A non-root
 * goal with no parent is an error unless it is explicitly flagged `orphan: true`
 * — orphans are allowed, but only when the writer owns up to them.
 */
export function validateGoalTree(goals: Goal[]): GoalTreeReport {
  const errors: GoalTreeIssue[] = []
  const orphans: string[] = []
  const byId = new Map<string, Goal>()

  for (const goal of goals) {
    if (!goal.id) {
      errors.push({ id: "", message: "missing id" })
      continue
    }
    if (byId.has(goal.id)) {
      errors.push({ id: goal.id, message: "duplicate id" })
      continue
    }
    byId.set(goal.id, goal)
    if (!goal.title?.trim()) errors.push({ id: goal.id, message: "missing title" })
    if (!HORIZONS.includes(goal.horizon as Horizon))
      errors.push({ id: goal.id, message: `invalid horizon "${goal.horizon}"` })
  }

  for (const goal of goals) {
    if (!goal.id || !HORIZONS.includes(goal.horizon as Horizon)) continue
    const expected = PARENT_HORIZON[goal.horizon as Horizon]
    if (goal.parent) {
      const parent = byId.get(goal.parent)
      if (!parent) {
        errors.push({ id: goal.id, message: `parent "${goal.parent}" not found` })
        orphans.push(goal.id)
      } else if (parent.horizon !== expected) {
        errors.push({
          id: goal.id,
          message: `parent must be a ${expected} goal, got ${parent.horizon}`,
        })
      }
    } else if (expected !== null) {
      orphans.push(goal.id)
      if (!goal.orphan)
        errors.push({
          id: goal.id,
          message: `${goal.horizon} goal has no parent — link it or set orphan: true`,
        })
    }
  }

  return { ok: errors.length === 0, errors, orphans }
}

/**
 * Order goals depth-first (each parent immediately followed by its children) so
 * the tree reads top-down. Robust to missing parents and cycles: roots and any
 * unreachable nodes are still emitted.
 */
export function orderGoalTree(goals: Goal[]): Goal[] {
  const ids = new Set(goals.map((g) => g.id))
  const childrenOf = new Map<string, Goal[]>()
  const roots: Goal[] = []

  for (const goal of goals) {
    if (goal.parent && ids.has(goal.parent)) {
      const arr = childrenOf.get(goal.parent) ?? []
      arr.push(goal)
      childrenOf.set(goal.parent, arr)
    } else {
      roots.push(goal)
    }
  }

  const out: Goal[] = []
  const seen = new Set<string>()
  const visit = (goal: Goal) => {
    if (seen.has(goal.id)) return
    seen.add(goal.id)
    out.push(goal)
    for (const child of childrenOf.get(goal.id) ?? []) visit(child)
  }
  for (const root of roots) visit(root)
  for (const goal of goals) if (!seen.has(goal.id)) out.push(goal)
  return out
}
