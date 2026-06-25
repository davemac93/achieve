import "server-only"

import { openVault } from "@/lib/vault"
import type { Goal, GoalStatus } from "@/lib/dashboard/types"

const GOALS_REL = "goals.yaml"
const STATUS_REL = "goal-status.yaml"

interface GoalsFile {
  goals: Goal[]
}

interface StatusFile {
  status: Record<string, GoalStatus>
}

/**
 * Goal definitions are read-only in the dashboard — the `/goals` skill owns
 * `goals.yaml`. Returns an empty list if missing.
 */
export async function getGoals(): Promise<Goal[]> {
  const vault = openVault()
  if (!(await vault.exists(GOALS_REL))) return []
  const data = await vault.readYaml<GoalsFile | null>(GOALS_REL)
  return data?.goals ?? []
}

/** Volatile per-goal status. Dashboard owns `goal-status.yaml`. */
export async function getGoalStatus(): Promise<Record<string, GoalStatus>> {
  const vault = openVault()
  if (!(await vault.exists(STATUS_REL))) return {}
  const data = await vault.readYaml<StatusFile | null>(STATUS_REL)
  return data?.status ?? {}
}

const VALID_STATUS: GoalStatus["status"][] = ["not-started", "in-progress", "done"]

/**
 * Set a goal's volatile status (and optional progress). Writes only
 * `goal-status.yaml` — `goals.yaml` stays owned by the `/goals` skill, so no
 * file has two writers. Progress is preserved across a status-only change.
 */
export async function setGoalStatus(
  id: string,
  status: GoalStatus["status"],
  progress?: number,
): Promise<void> {
  if (!VALID_STATUS.includes(status)) throw new Error(`Invalid goal status: ${status}`)
  const current = await getGoalStatus()
  const entry: GoalStatus = { status }
  const carried = progress ?? current[id]?.progress
  if (carried != null) entry.progress = Math.max(0, Math.min(100, Math.round(carried)))

  const vault = openVault()
  await vault.writeYaml(
    STATUS_REL,
    { status: { ...current, [id]: entry } },
    { message: "dashboard: set goal status" },
  )
}

export interface GoalWithStatus extends Goal {
  state: GoalStatus["status"]
  progress?: number
}

/** Goals joined with their volatile status, for dashboard display. */
export async function getGoalsWithStatus(): Promise<GoalWithStatus[]> {
  const [goals, status] = await Promise.all([getGoals(), getGoalStatus()])
  return goals.map((goal) => ({
    ...goal,
    state: status[goal.id]?.status ?? "not-started",
    progress: status[goal.id]?.progress,
  }))
}
