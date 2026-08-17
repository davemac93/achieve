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

/** Asset categories a holding can have. Extend deliberately — the write path rejects anything else.
 * `cash` is valued at face (shares = amount, avgCost = 1 for PLN) with no quote lookup. */
export const ASSET_TYPES = ["stock", "etf", "cash"] as const
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

/**
 * A goal definition in `goals.yaml`. The `/goals` skill is the primary writer.
 *
 * `direction` is the north star — no status, no progress, no deadline. It is
 * context for judging whether a goal is feasible, never something you complete.
 * Everything below it is trackable, and `yearly` (twelve months) is the hard
 * ceiling for that. The runtime lists live in
 * [goal-tree.ts](./goal-tree.ts) (`HORIZONS`, `GOAL_KINDS`).
 */
export interface Goal {
  id: string
  horizon: "direction" | "yearly" | "monthly" | "weekly"
  title: string
  parent?: string
  orphan?: boolean
  /** Steps only: `learn` acquires a capability, `do` produces a result. */
  kind?: "learn" | "do"
  /**
   * Ids that must be complete before this one may be ticked. Hierarchy is not
   * sequence — `parent` says what contains what, `after` says what waits on
   * what, and an irreversible step needs the second.
   */
  after?: string[]
  /** Ticking a step tagged with a skill appends to `profile/evidence.yaml`. */
  skill?: string
  /**
   * For a `kind: learn` step: the `learn/<topic>/` folder that carries it out.
   * The step says a capability is needed; the topic is the curriculum that
   * actually builds it, and its ticked items are where the evidence comes from.
   */
  topic?: string
}

/**
 * Volatile per-step state in `goal-status.yaml`. Dashboard is the primary
 * writer, and it records exactly one bit: ticked or not.
 *
 * There is deliberately no `progress` field. A percentage is a number you can
 * type without doing the work; progress is instead *derived* from the share of
 * leaf steps ticked (see [goal-progress.ts](./goal-progress.ts)), so the only
 * way to move it is to finish something.
 */
export interface GoalStatus {
  done: boolean
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

/**
 * The proficiency ladder in `profile/skills.yaml`, weakest first. Promotion
 * moves one rung at a time and only with evidence behind it — the `/profile`
 * skill proposes, the user approves.
 */
export const SKILL_LEVELS = ["basic", "working", "strong", "expert"] as const
export type SkillLevel = (typeof SKILL_LEVELS)[number]

/** A skill in `profile/skills.yaml`. The `/profile` skill is the primary writer. */
export interface ProfileSkill {
  skill: string
  level: SkillLevel
  /** Evidence records that stood behind the level when it was last reviewed. */
  evidenceCount: number
  /** ISO date (`YYYY-MM-DD`) the skill was last exercised, if known. */
  lastUsed?: string
}

/** One role, from `profile/experience/<slug>.md`. `/profile` is the writer. */
export interface Experience {
  slug: string
  company: string
  title: string
  /** `YYYY-MM` (or `YYYY`) — free-form enough for a CV, sortable as text. */
  start: string
  /** Absent means the role is current. */
  end?: string
  tech: string[]
  /** The narrative achievements — the markdown body of the file. */
  body: string
}

/** An entry in `profile/education.yaml`. `/profile` is the writer. */
export interface Education {
  institution: string
  qualification: string
  start?: string
  end?: string
  notes?: string
}

/**
 * `profile/preferences.yaml` — how the user works best. Three plain lists so
 * the file stays readable by hand; `/profile` is the writer.
 */
export interface Preferences {
  workStyle: string[]
  constraints: string[]
  energyPatterns: string[]
}

/**
 * A record in `profile/evidence.yaml` — append-only, and the **dashboard** is
 * its only writer (ticking a step tagged with a skill appends one). `/profile`
 * reads these to propose skill promotions but never writes the file: that split
 * is what keeps one writer per file, and what keeps a future CV honest — every
 * claimed skill has a dated trail behind it.
 */
export interface EvidenceRecord {
  id: string
  /** The skill the completed work is evidence for. */
  skill: string
  /** What was done, in the user's own words (the step title). */
  what: string
  /** ISO-8601 timestamp of when it was recorded. */
  when: string
  /** Where it came from, e.g. `goals:<stepId>` — the trail back to the work. */
  source: string
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
