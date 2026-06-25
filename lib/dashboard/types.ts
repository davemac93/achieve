/**
 * Shared shapes for the data the dashboard reads from and writes to the vault.
 * These mirror the YAML files described in the vault template.
 */

/** A single task in `tasks.yaml`. Dashboard is the primary writer. */
export interface Task {
  id: string
  title: string
  done: boolean
  /** ISO-8601 creation timestamp. */
  created: string
  /** Optional link to a weekly-goal id, so daily actions trace to goals. */
  goal?: string
}

/** A goal definition in `goals.yaml`. The `/goals` skill is the primary writer. */
export interface Goal {
  id: string
  horizon: "3yr" | "yearly" | "monthly" | "weekly"
  title: string
  parent?: string
  orphan?: boolean
}

/** Volatile goal status in `goal-status.yaml`. Dashboard is the primary writer. */
export interface GoalStatus {
  status: "not-started" | "in-progress" | "done"
  progress?: number
}

/** A quote in `quotes.yaml`. */
export interface Quote {
  text: string
  author?: string
}

/** A project, from a markdown file in `projects/`. Human is the primary writer. */
export interface Project {
  slug: string
  title: string
  status?: "private" | "working"
}

/** A note, from a markdown file in `notes/`. The `/note` skill writes these. */
export interface Note {
  slug: string
  title: string
  type?: string
  tags?: string[]
  created?: string
  project?: string
}
