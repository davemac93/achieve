import type { Goal, GoalStatus } from "./types"

/**
 * Derived goal progress — the answer to "how far along is this?", computed
 * rather than typed.
 *
 * Pure and dependency-free like [goal-tree.ts](./goal-tree.ts), so the
 * dashboard, the migration script and the tests all share one implementation.
 *
 * The rules, and why they are these rules:
 *
 * - **Only leaf steps are ticked.** A container's progress is the share of the
 *   leaf steps beneath it that are done, rolled up weekly → monthly → yearly →
 *   direction. There is no field anywhere holding a percentage, so the only way
 *   to move a number is to finish a step.
 * - **Unweighted.** Every leaf step counts exactly one. Weights would look
 *   precise while being guesses, and they invite tuning the model instead of
 *   doing the work.
 * - **A direction has no percentage at all.** It is a north star: not finished,
 *   not unfinished. The counts beneath it are still summed (the math is uniform
 *   all the way up), but `percent` is `null` and nothing renders a chip for it.
 * - **Blocking is inherited.** A step is blocked while any prerequisite of its
 *   own — or of any ancestor — is incomplete. That is what keeps an
 *   irreversible step (sign the lease) behind the ones that justify it
 *   (research the city, find the location).
 */

export interface GoalProgress {
  /** No children — the only kind of entry that can be ticked by hand. */
  leaf: boolean
  /** Leaf steps beneath it; a leaf counts itself. */
  totalSteps: number
  /** How many of those are ticked. */
  doneSteps: number
  /** Share of leaf steps ticked, 0–100 rounded. `null` for a direction. */
  percent: number | null
  /** Every leaf beneath it is ticked (and there is at least one). */
  complete: boolean
  /**
   * Unmet prerequisites — its own, plus any inherited from an ancestor. A
   * non-empty list means the step must not be ticked yet.
   */
  blockedBy: string[]
}

/** The ids ticked in `goal-status.yaml`, as `computeGoalProgress` wants them. */
export function doneIds(status: Record<string, GoalStatus>): Set<string> {
  return new Set(
    Object.entries(status)
      .filter(([, entry]) => entry?.done)
      .map(([id]) => id),
  )
}

/**
 * Roll ticked leaf steps up the tree. Returns one entry per goal, keyed by id.
 *
 * Tolerant of a malformed tree (missing parents, cycles, unknown prerequisite
 * ids) because it also runs on files the validator has already complained
 * about: an unknown prerequisite counts as *unmet*, so a typo can never quietly
 * unblock an irreversible step.
 */
export function computeGoalProgress(
  goals: Goal[],
  done: ReadonlySet<string>,
): Map<string, GoalProgress> {
  const byId = new Map(goals.map((goal) => [goal.id, goal]))
  const childrenOf = new Map<string, Goal[]>()
  for (const goal of goals) {
    if (!goal.parent || !byId.has(goal.parent)) continue
    const arr = childrenOf.get(goal.parent) ?? []
    arr.push(goal)
    childrenOf.set(goal.parent, arr)
  }

  interface Counts {
    total: number
    done: number
  }
  const counts = new Map<string, Counts>()
  const counting = new Set<string>()

  const countOf = (goal: Goal): Counts => {
    const cached = counts.get(goal.id)
    if (cached) return cached
    // A parent cycle is impossible in a valid tree and harmless here: treat the
    // revisited node as contributing nothing rather than recursing forever.
    if (counting.has(goal.id)) return { total: 0, done: 0 }
    counting.add(goal.id)

    const children = childrenOf.get(goal.id) ?? []
    let result: Counts
    if (children.length > 0) {
      result = { total: 0, done: 0 }
      for (const child of children) {
        const sub = countOf(child)
        result.total += sub.total
        result.done += sub.done
      }
    } else if (goal.horizon === "direction") {
      // A direction with nothing under it is not a step waiting to be ticked.
      result = { total: 0, done: 0 }
    } else {
      result = { total: 1, done: done.has(goal.id) ? 1 : 0 }
    }

    counting.delete(goal.id)
    counts.set(goal.id, result)
    return result
  }

  const isComplete = (id: string): boolean => {
    const goal = byId.get(id)
    if (!goal) return false
    const count = countOf(goal)
    return count.total > 0 && count.done === count.total
  }

  const blockers = new Map<string, string[]>()
  const resolving = new Set<string>()

  const blockedBy = (goal: Goal): string[] => {
    const cached = blockers.get(goal.id)
    if (cached) return cached
    if (resolving.has(goal.id)) return []
    resolving.add(goal.id)

    const own = (goal.after ?? []).filter((id) => !isComplete(id))
    const parent = goal.parent ? byId.get(goal.parent) : undefined
    const inherited = parent ? blockedBy(parent) : []
    const merged = [...new Set([...own, ...inherited])]

    resolving.delete(goal.id)
    blockers.set(goal.id, merged)
    return merged
  }

  const report = new Map<string, GoalProgress>()
  for (const goal of goals) {
    const count = countOf(goal)
    const leaf = (childrenOf.get(goal.id)?.length ?? 0) === 0 && goal.horizon !== "direction"
    report.set(goal.id, {
      leaf,
      totalSteps: count.total,
      doneSteps: count.done,
      percent:
        goal.horizon === "direction"
          ? null
          : count.total === 0
            ? 0
            : Math.round((count.done / count.total) * 100),
      complete: count.total > 0 && count.done === count.total,
      blockedBy: blockedBy(goal),
    })
  }
  return report
}
