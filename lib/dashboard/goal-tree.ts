import type { Goal } from "./types"

/**
 * Pure goal-tree logic, isolated from the vault so it can be unit-tested and
 * shared between the dashboard, the migration script and the `/goals` skill's
 * contract. No I/O, and no runtime imports — plain node runs it too.
 */

/**
 * The horizons, coarsest first. `direction` is the north star: no status, no
 * progress, no deadline, because it is context for judging feasibility rather
 * than something you complete. Everything below it is trackable, and `yearly`
 * — twelve months — is the hard ceiling for that.
 */
export const HORIZONS = ["direction", "yearly", "monthly", "weekly"] as const
export type Horizon = (typeof HORIZONS)[number]

/**
 * What kind of work a step is: `learn` acquires a capability, `do` produces a
 * result. Optional — a goal that only contains other goals is a container and
 * carries no kind.
 */
export const GOAL_KINDS = ["learn", "do"] as const
export type GoalKind = (typeof GOAL_KINDS)[number]

/** The horizon a goal's parent must occupy — exactly one level coarser. */
const PARENT_HORIZON: Record<Horizon, Horizon | null> = {
  direction: null,
  yearly: "direction",
  monthly: "yearly",
  weekly: "monthly",
}

/** Tree depth used for indentation: direction=0, yearly=1, monthly=2, weekly=3. */
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
  /** ids with no valid parent link (missing/unflagged), excluding directions. */
  orphans: string[]
}

/**
 * Validate `goals.yaml` against the soft-tree schema: well-formed entries,
 * unique ids, parent references that point one horizon coarser, and an `after`
 * graph that is actually orderable. A non-root goal with no parent is an error
 * unless it is explicitly flagged `orphan: true` — orphans are allowed, but
 * only when the writer owns up to them.
 *
 * Two rules earn their own explanation:
 *
 * - **A direction carries no `kind`, `after`, `skill` or `topic`.** Those belong
 *   to work you can finish; a north star is not work.
 * - **`after` must not cycle** (A after B after A). Nothing in such a set is
 *   ever startable, and the tree can express it, so the validator has to catch
 *   it. Parent links cannot cycle by construction — each hop is exactly one
 *   horizon coarser — so only the `after` graph needs the check.
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
    if (goal.kind != null && !GOAL_KINDS.includes(goal.kind as GoalKind))
      errors.push({ id: goal.id, message: `invalid kind "${goal.kind}" — use learn or do` })
    // A topic is the curriculum that acquires a capability, so it only belongs
    // to a step that says one is missing. On a `do` step it would claim the
    // learning happens somewhere it does not.
    if (goal.topic != null && goal.kind !== "learn" && goal.horizon !== "direction")
      errors.push({
        id: goal.id,
        message: "`topic` belongs to a `kind: learn` step — that is what a curriculum is for",
      })
    if (goal.horizon === "direction") {
      for (const field of ["kind", "after", "skill", "topic"] as const) {
        if (goal[field] != null)
          errors.push({
            id: goal.id,
            message: `a direction is a north star, not work — drop \`${field}\``,
          })
      }
    }
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

    for (const prerequisite of goal.after ?? []) {
      if (prerequisite === goal.id) {
        errors.push({ id: goal.id, message: "cannot come after itself" })
        continue
      }
      const target = byId.get(prerequisite)
      if (!target) {
        errors.push({ id: goal.id, message: `prerequisite "${prerequisite}" not found` })
      } else if (target.horizon === "direction") {
        errors.push({
          id: goal.id,
          message: `prerequisite "${prerequisite}" is a direction — a north star is never done, so nothing can wait on it`,
        })
      }
    }
  }

  for (const id of findAfterCycle(goals)) {
    errors.push({ id, message: "prerequisite cycle — these steps wait on each other" })
  }

  return { ok: errors.length === 0, errors, orphans }
}

/**
 * Ids that sit on a cycle in the `after` graph, in declaration order. Kahn's
 * algorithm: peel off everything whose prerequisites are all satisfiable; what
 * cannot be peeled is exactly what cycles.
 */
function findAfterCycle(goals: Goal[]): string[] {
  const known = new Set(goals.map((g) => g.id).filter(Boolean))
  const waiting = new Map<string, Set<string>>()
  for (const goal of goals) {
    if (!goal.id || waiting.has(goal.id)) continue
    // Dangling prerequisites do not cycle, and a self-reference is reported
    // precisely above — neither belongs in this scan.
    const edges = (goal.after ?? []).filter((id) => known.has(id) && id !== goal.id)
    waiting.set(goal.id, new Set(edges))
  }

  const settled = new Set<string>()
  let peeled = true
  while (peeled) {
    peeled = false
    for (const [id, prerequisites] of waiting) {
      if (settled.has(id)) continue
      if ([...prerequisites].every((p) => settled.has(p))) {
        settled.add(id)
        peeled = true
      }
    }
  }

  return [...waiting.keys()].filter((id) => !settled.has(id))
}

/**
 * Order goals depth-first (each parent immediately followed by its children) so
 * the tree reads top-down, and order siblings so a prerequisite comes before
 * whatever waits on it. Both orderings are needed: `parent` shows containment,
 * `after` shows sequence, and a list that only honors the first reads as if the
 * work could start anywhere. Robust to missing parents and to cycles — roots
 * and any unreachable nodes are still emitted.
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
    for (const child of bySequence(childrenOf.get(goal.id) ?? [])) visit(child)
  }
  for (const root of bySequence(roots)) visit(root)
  for (const goal of goals) if (!seen.has(goal.id)) out.push(goal)
  return out
}

/**
 * Sort one sibling set so prerequisites lead. Stable — among steps that are
 * equally ready, declaration order wins — and cycle-safe: whatever cannot be
 * ordered keeps its declared position rather than disappearing.
 */
function bySequence(siblings: Goal[]): Goal[] {
  if (siblings.length < 2) return siblings
  const here = new Set(siblings.map((g) => g.id))
  const out: Goal[] = []
  const emitted = new Set<string>()

  let progressed = true
  while (out.length < siblings.length && progressed) {
    progressed = false
    for (const goal of siblings) {
      if (emitted.has(goal.id)) continue
      // Only prerequisites inside this sibling set can reorder it; anything
      // outside is handled by the tree walk itself.
      const blockers = (goal.after ?? []).filter((id) => here.has(id))
      if (blockers.every((id) => emitted.has(id))) {
        out.push(goal)
        emitted.add(goal.id)
        progressed = true
      }
    }
  }
  for (const goal of siblings) if (!emitted.has(goal.id)) out.push(goal)
  return out
}
