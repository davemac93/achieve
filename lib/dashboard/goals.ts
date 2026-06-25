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
