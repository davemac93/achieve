import "server-only"

import { openVault } from "@/lib/vault"
import {
  GOALS_FILE,
  STATUS_FILE,
  normalizeGoal,
  normalizeStatus,
  renderStatusFile,
} from "@/lib/dashboard/goal-content"
import {
  computeGoalProgress,
  doneIds,
  type GoalProgress,
} from "@/lib/dashboard/goal-progress"
import { orderGoalTree } from "@/lib/dashboard/goal-tree"
import type { Goal, GoalStatus } from "@/lib/dashboard/types"

interface GoalsFile {
  goals: unknown[]
}

interface StatusFile {
  status: Record<string, unknown>
}

/**
 * Goal definitions are read-only in the dashboard — the `/goals` skill owns
 * `goals.yaml`. Returns an empty list if missing.
 *
 * Entries pass through `normalizeGoal`, which reads a v1 `3yr` goal as the
 * `direction` it became. That is a read-time courtesy only: nothing is written
 * back, so a vault that has not yet run `npm run migrate-goals` still renders
 * correctly while its file says `3yr`.
 */
export async function getGoals(): Promise<Goal[]> {
  const vault = openVault()
  if (!(await vault.exists(GOALS_FILE))) return []
  const data = await vault.readYaml<GoalsFile | null>(GOALS_FILE)
  const rows = Array.isArray(data?.goals) ? data.goals : []
  return rows.map(normalizeGoal).filter((goal): goal is Goal => goal !== null)
}

/**
 * Volatile per-step state. Dashboard owns `goal-status.yaml`, and it holds one
 * bit per leaf step — the old three-state status and typed `progress` are read
 * through `normalizeStatus` for vaults written before the migration.
 */
export async function getGoalStatus(): Promise<Record<string, GoalStatus>> {
  const vault = openVault()
  if (!(await vault.exists(STATUS_FILE))) return {}
  const data = await vault.readYaml<StatusFile | null>(STATUS_FILE)
  const out: Record<string, GoalStatus> = {}
  for (const [id, row] of Object.entries(data?.status ?? {})) {
    const entry = normalizeStatus(row)
    if (entry) out[id] = entry
  }
  return out
}

/**
 * Tick (or untick) a leaf step, writing only `goal-status.yaml` — `goals.yaml`
 * stays owned by the `/goals` skill, so no file has two writers.
 *
 * Three things are refused rather than silently accepted, because each would be
 * a way to claim progress that was not made:
 *
 * - a **direction** — a north star is not something you finish;
 * - a goal with **steps beneath it** — its progress is derived from them;
 * - a **blocked** step — its prerequisites are not done, and skipping the
 *   research to sign the lease is exactly what the sequence exists to prevent.
 *
 * Unticking a blocked step is allowed: it cannot legitimately be done, so
 * letting it be cleared is a correction, not a shortcut.
 *
 * Returns the goal that was ticked, so the caller can act on its `skill:` tag.
 */
export async function setStepDone(id: string, done: boolean): Promise<Goal> {
  const [goals, status] = await Promise.all([getGoals(), getGoalStatus()])
  const goal = goals.find((entry) => entry.id === id)
  if (!goal) throw new Error(`Unknown goal id: ${id}`)
  if (goal.horizon === "direction")
    throw new Error(`"${goal.title}" is a direction — a north star is not something you tick.`)

  const progress = computeGoalProgress(goals, doneIds(status))
  const state = progress.get(id)
  if (!state?.leaf)
    throw new Error(
      `"${goal.title}" has steps beneath it — its progress is derived from them, not set by hand.`,
    )
  if (done && state.blockedBy.length > 0)
    throw new Error(
      `"${goal.title}" is blocked: ${state.blockedBy.join(", ")} must be done first.`,
    )

  const vault = openVault()
  await vault.write(STATUS_FILE, renderStatusFile({ ...status, [id]: { done } }), {
    message: done ? "dashboard: tick goal step" : "dashboard: untick goal step",
  })
  return goal
}

/** A goal joined with its derived progress — the shape the dashboard renders. */
export interface GoalWithProgress extends Goal, GoalProgress {
  /** Whether this exact step is ticked in `goal-status.yaml`. */
  done: boolean
}

/**
 * The whole tree, ordered for display (parents before children, prerequisites
 * before what waits on them) and joined with derived progress and blocked
 * state. The one read the Goals tab and the home card both use.
 */
export async function getGoalTreeView(): Promise<GoalWithProgress[]> {
  const [goals, status] = await Promise.all([getGoals(), getGoalStatus()])
  const ticked = doneIds(status)
  const progress = computeGoalProgress(goals, ticked)
  return orderGoalTree(goals).map((goal) => ({
    ...goal,
    ...progress.get(goal.id)!,
    done: ticked.has(goal.id),
  }))
}
