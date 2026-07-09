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

/** Asset categories a holding can have. Extend deliberately — the write path rejects anything else. */
export const ASSET_TYPES = ["stock", "etf"] as const
export type AssetType = (typeof ASSET_TYPES)[number]

/** A holding in `investments.yaml`. Dashboard is the primary writer. */
export interface Holding {
  id: string
  ticker: string
  name: string
  assetType: AssetType
  /** Account label, e.g. "IKE" or "IKZE". */
  account: string
  shares: number
  /** Average cost per share in PLN, as actually paid. */
  avgCost: number
  /** ISO-4217 currency the instrument is quoted in on its exchange, e.g. "EUR". */
  quoteCurrency: string
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

/** A single project with its markdown body — the shape the project reader renders. */
export interface ProjectWithBody extends Project {
  body: string
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

/** A single note with its markdown body — the shape the note reader renders. */
export interface NoteWithBody extends Note {
  body: string
}
