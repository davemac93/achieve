/**
 * Learn content model — the shape of the `learn/<topic>/` store, the pure
 * builders that produce a plan file, and the progress rollup over a curriculum.
 *
 * Framework-free and side-effect free (no `server-only`, no disk access of its
 * own), like `goal-content.ts` and `note-content.ts`, so three callers share it:
 * the `/teach` write script running under plain node, the dashboard read layer,
 * and the tests.
 *
 * The idea the whole module rests on: **a curriculum item is a tickable step**,
 * the same concept `goals.yaml` already has. So nothing here reimplements
 * sequencing, blocking or progress — items are mapped onto `Goal` and handed to
 * [goal-tree.ts](./goal-tree.ts) and [goal-progress.ts](./goal-progress.ts).
 * One implementation means a curriculum can never drift into a second, subtly
 * different notion of "done".
 *
 * Writers (see CLAUDE.md): the `/teach` skill owns `plan.md` and everything
 * under `sessions/`; the **dashboard** owns `learn/status.yaml`, which item is
 * ticked. Same split as `goals.yaml` vs `goal-status.yaml`.
 */

import { stringify } from "yaml"
import type { Vault } from "@/lib/vault"
// Relative and extension-ful: the write script runs under plain node, which
// resolves neither path aliases nor extension-less specifiers.
import { GOAL_KINDS, orderGoalTree, validateGoalTree, type GoalTreeReport } from "./goal-tree.ts"
import { computeGoalProgress } from "./goal-progress.ts"
import { normalizeStatus } from "./goal-content.ts"
import type { Goal, GoalStatus } from "./types.ts"

export const LEARN_DIR = "learn"
/** The topic's definition: why it exists, and the ordered curriculum. */
export const PLAN_FILE = "plan.md"
/** One file per study session, named for the date it happened. */
export const SESSIONS_DIR = "sessions"
/** Which curriculum items are ticked — the dashboard's file, for every topic. */
export const LEARN_STATUS_FILE = `${LEARN_DIR}/status.yaml`

/** Topic folders are plain kebab names — reject anything that could escape `learn/`. */
export const TOPIC_SLUG = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i
/** A session file is named for its date, so a topic reads as a timeline. */
export const SESSION_DATE = /^\d{4}-\d{2}-\d{2}$/

/**
 * One item of a curriculum: the same fields a goal step carries, because it is
 * the same thing. `after` sequences items that genuinely depend on each other
 * (you cannot write a controller before you know what a pod is); `skill:` turns
 * a tick into a record in the evidence log, which is how learning promotes a
 * skill honestly.
 */
export interface CurriculumItem {
  id: string
  title: string
  /** `learn` acquires the understanding, `do` proves it on something real. */
  kind?: "learn" | "do"
  /** Item ids that must be ticked before this one may be. */
  after?: string[]
  /** Ticking a tagged item appends to `profile/evidence.yaml`. */
  skill?: string
}

/** A topic's `plan.md`: what is being learned, why, and in what order. */
export interface TopicPlan {
  /** The `learn/<slug>/` folder this plan lives in. */
  slug: string
  title: string
  /**
   * Why the topic exists. Required — a topic with no reason is precisely what
   * this module is here to prevent, so the write path refuses one.
   */
  why: string
  /** The `goals.yaml` step that demanded it, if a goal did. */
  goal?: string
  /** The `jobs/<slug>/` application whose `fit.md` listed it missing, if one did. */
  job?: string
  /** `YYYY-MM-DD` the topic was opened. */
  started?: string
  curriculum: CurriculumItem[]
  /** The prose under the frontmatter — resources, notes, whatever helps. */
  body: string
}

/** One bit per curriculum item, exactly like a goal step's status entry. */
export type ItemStatus = GoalStatus

/** `learn/status.yaml`: topic slug → item id → ticked or not. */
export type LearnStatus = Record<string, Record<string, ItemStatus>>

/* ------------------------------------------------------------------------- */
/* Curriculum items are goal steps                                            */
/* ------------------------------------------------------------------------- */

/**
 * A curriculum as goal steps.
 *
 * Every item becomes a `weekly` leaf — the horizon that means "a step you
 * tick" — flagged `orphan` because no goal in `goals.yaml` contains it and that
 * is deliberate: the containment lives in the topic, the sequence lives in
 * `after`. With that mapping, `validateGoalTree`, `orderGoalTree` and
 * `computeGoalProgress` apply unchanged.
 */
export function curriculumSteps(items: CurriculumItem[]): Goal[] {
  return items.map((item) => ({
    id: item.id,
    horizon: "weekly" as const,
    title: item.title,
    orphan: true,
    ...(item.kind ? { kind: item.kind } : {}),
    ...(item.after?.length ? { after: item.after } : {}),
    ...(item.skill ? { skill: item.skill } : {}),
  }))
}

/**
 * Validate a curriculum with the goal-tree validator: unique ids, real titles,
 * prerequisites that exist, and an `after` graph that is actually orderable.
 * A curriculum whose items wait on each other teaches nothing, and the file can
 * express it, so it has to be caught — the same reasoning as for goals.
 */
export function validateCurriculum(items: CurriculumItem[]): GoalTreeReport {
  return validateGoalTree(curriculumSteps(items))
}

/** A curriculum item joined with its ticked and blocked state. */
export interface CurriculumItemView extends CurriculumItem {
  done: boolean
  /** Unmet prerequisites; non-empty means it must not be ticked yet. */
  blockedBy: string[]
}

/**
 * A topic's derived progress. No percentage is ever stored — this is computed
 * from ticked items every time, the same unweighted rule as goals: each item
 * counts exactly one, because weights would look precise while being guesses.
 */
export interface TopicProgress {
  totalItems: number
  doneItems: number
  /** Share of items ticked, 0–100 rounded. 0 for an empty curriculum. */
  percent: number
  complete: boolean
}

export interface CurriculumView extends TopicProgress {
  /** Items ordered so a prerequisite always comes before what waits on it. */
  items: CurriculumItemView[]
}

/**
 * Order a curriculum and roll its ticked items up into topic progress. Pure:
 * `done` is the set of ticked item ids for this topic.
 */
export function computeCurriculumView(
  items: CurriculumItem[],
  done: ReadonlySet<string>,
): CurriculumView {
  const steps = curriculumSteps(items)
  const progress = computeGoalProgress(steps, done)
  const byId = new Map(items.map((item) => [item.id, item]))

  const ordered = orderGoalTree(steps).flatMap((step): CurriculumItemView[] => {
    const item = byId.get(step.id)
    if (!item) return []
    return [
      {
        ...item,
        done: done.has(item.id),
        blockedBy: progress.get(item.id)?.blockedBy ?? [],
      },
    ]
  })

  const doneItems = ordered.filter((item) => item.done).length
  return {
    items: ordered,
    totalItems: ordered.length,
    doneItems,
    percent: ordered.length === 0 ? 0 : Math.round((doneItems / ordered.length) * 100),
    complete: ordered.length > 0 && doneItems === ordered.length,
  }
}

/* ------------------------------------------------------------------------- */
/* Reading what the /teach skill wrote                                        */
/* ------------------------------------------------------------------------- */

/** Read one curriculum item from frontmatter, dropping anything malformed. */
export function normalizeCurriculumItem(raw: unknown): CurriculumItem | null {
  if (!raw || typeof raw !== "object") return null
  const row = raw as Record<string, unknown>
  const id = typeof row.id === "string" ? row.id.trim() : ""
  if (!id) return null

  const item: CurriculumItem = {
    id,
    title: typeof row.title === "string" ? row.title.trim() : "",
  }
  if (typeof row.kind === "string" && (GOAL_KINDS as readonly string[]).includes(row.kind)) {
    item.kind = row.kind as CurriculumItem["kind"]
  }
  if (Array.isArray(row.after)) {
    const after = row.after
      .filter((id): id is string => typeof id === "string")
      .map((id) => id.trim())
      .filter(Boolean)
    if (after.length > 0) item.after = after
  }
  if (typeof row.skill === "string" && row.skill.trim()) item.skill = row.skill.trim()
  return item
}

/**
 * Read a `plan.md` into a `TopicPlan`, tolerating a hand-edited file: a missing
 * title falls back to the folder name, a malformed curriculum entry is dropped
 * rather than crashing the tab. The plan is the user's (via `/teach`), so the
 * dashboard reads it defensively and never writes it back.
 */
export function normalizeTopicPlan(
  slug: string,
  frontmatter: Record<string, unknown>,
  body: string,
): TopicPlan {
  const text = (value: unknown): string =>
    typeof value === "string" ? value.trim() : value instanceof Date ? value.toISOString().slice(0, 10) : ""

  const rows = Array.isArray(frontmatter.curriculum) ? frontmatter.curriculum : []
  const plan: TopicPlan = {
    slug,
    title: text(frontmatter.title) || titleFromTopicSlug(slug),
    why: text(frontmatter.why),
    curriculum: rows
      .map(normalizeCurriculumItem)
      .filter((item): item is CurriculumItem => item !== null),
    body,
  }
  const goal = text(frontmatter.goal)
  if (goal) plan.goal = goal
  const job = text(frontmatter.job)
  if (job) plan.job = job
  const started = text(frontmatter.started)
  if (started) plan.started = started.slice(0, 10)
  return plan
}

/** Read `learn/status.yaml`, dropping rows that mean nothing. */
export function normalizeLearnStatus(raw: unknown): LearnStatus {
  const rows = (raw as { status?: Record<string, unknown> } | null)?.status
  if (!rows || typeof rows !== "object") return {}

  const status: LearnStatus = {}
  for (const [topic, items] of Object.entries(rows)) {
    if (!items || typeof items !== "object") continue
    const forTopic: Record<string, ItemStatus> = {}
    for (const [id, entry] of Object.entries(items as Record<string, unknown>)) {
      // The status entry is a goal step's, down to the legacy shapes it tolerates.
      const normalized = normalizeStatus(entry)
      if (normalized) forTopic[id] = normalized
    }
    if (Object.keys(forTopic).length > 0) status[topic] = forTopic
  }
  return status
}

/** The ticked item ids for one topic, as `computeCurriculumView` wants them. */
export function doneItemIds(status: LearnStatus, topic: string): Set<string> {
  return new Set(
    Object.entries(status[topic] ?? {})
      .filter(([, entry]) => entry?.done)
      .map(([id]) => id),
  )
}

/* ------------------------------------------------------------------------- */
/* Writing                                                                     */
/* ------------------------------------------------------------------------- */

export const LEARN_STATUS_HEADER = `# Volatile per-item state — primary writer: dashboard. Agents read only.
# Split from learn/<topic>/plan.md so no file has two writers: /teach owns the
# curriculum, the dashboard owns which items are ticked.
# Map of topic slug -> curriculum item id -> { done: true|false }.
# There is no \`progress\` field on purpose: a topic's progress is the share of
# its curriculum items ticked, derived in lib/dashboard/learn-content.ts — the
# same unweighted rule as goals.
`

/** Render `learn/status.yaml`: the schema header, then the ticked map. */
export function renderLearnStatusFile(status: LearnStatus): string {
  return LEARN_STATUS_HEADER + stringify({ status })
}

/** Turn a topic name into a filesystem-safe kebab folder name. */
export function topicSlug(title: string): string {
  const slug = title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "") // drop combining marks left by NFKD
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
  return slug || "topic"
}

/** `kubernetes-networking` → `Kubernetes networking`, for a plan with no title. */
export function titleFromTopicSlug(slug: string): string {
  const words = slug.replace(/[-_]+/g, " ").trim()
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : slug
}

/** What the `/teach` skill hands the write path for a plan. */
export interface TopicPlanInput {
  /** Folder name; derived from the title when omitted. */
  slug?: string
  title: string
  why: string
  goal?: string
  job?: string
  curriculum: CurriculumItem[]
  body?: string
}

/**
 * Build a `plan.md`: frontmatter (title, why, the goal or job that demanded the
 * topic, the curriculum) then the prose body.
 *
 * Three things are refused rather than written, because each would produce a
 * topic that cannot be trusted:
 *
 * - **no title** — nothing to call it;
 * - **no `why`** — a curriculum with no reason behind it is exactly the aimless
 *   studying this module exists to replace;
 * - **an invalid curriculum** — duplicate ids, a dangling prerequisite, or an
 *   `after` cycle. The dashboard would render it, so the write path stops it,
 *   the same way `/goals` output must pass `validateGoalTree`.
 *
 * Pure: `started` is passed in, so the output is deterministic and testable.
 */
export function buildPlanFile(input: TopicPlanInput, started: string): string {
  const title = input.title?.trim()
  if (!title) throw new Error("A topic needs a title.")
  const why = input.why?.trim()
  if (!why)
    throw new Error(
      "A topic needs a `why` — the goal or job requirement that demanded it. A curriculum with no reason is what this module exists to prevent.",
    )

  const curriculum = (input.curriculum ?? [])
    .map(normalizeCurriculumItem)
    .filter((item): item is CurriculumItem => item !== null)
  const report = validateCurriculum(curriculum)
  if (!report.ok) {
    throw new Error(
      `Invalid curriculum:\n${report.errors.map((e) => `  - ${e.id || "(no id)"}: ${e.message}`).join("\n")}`,
    )
  }

  const frontmatter: Record<string, unknown> = { title, why }
  if (input.goal?.trim()) frontmatter.goal = input.goal.trim()
  if (input.job?.trim()) frontmatter.job = input.job.trim()
  frontmatter.started = started
  frontmatter.curriculum = curriculum

  const body = (input.body ?? "").trim()
  return `---\n${stringify(frontmatter)}---\n\n${body ? `${body}\n` : ""}`
}

/** What the `/teach` skill hands the write path for a session summary. */
export interface SessionInput {
  /** Topic folder; must already have a `plan.md`. */
  topic: string
  /** `YYYY-MM-DD`; defaults to today at the call site. */
  date?: string
  /** What the session covered, in the user's own terms. */
  body: string
  /** Curriculum item ids the session worked on, for the trail back. */
  covered?: string[]
}

/**
 * Build a session file — or extend today's, when one already exists.
 *
 * Two sessions on one day append rather than collide: the file is the day's
 * record, and a study session that resumes after lunch is not a different day.
 * `existing` is the current file content, or `null` if there is none.
 */
export function buildSessionFile(
  input: SessionInput,
  date: string,
  existing: string | null,
): string {
  const body = input.body?.trim()
  if (!body) throw new Error("A session needs a summary of what was covered.")
  const covered = (input.covered ?? []).map((id) => id.trim()).filter(Boolean)

  if (existing?.trim()) {
    const trailer = covered.length > 0 ? `\n\nCovered: ${covered.join(", ")}` : ""
    return `${existing.trimEnd()}\n\n## Later that day\n\n${body}${trailer}\n`
  }

  const frontmatter: Record<string, unknown> = { date }
  if (covered.length > 0) frontmatter.covered = covered
  return `---\n${stringify(frontmatter)}---\n\n${body}\n`
}

/**
 * Write a topic's `plan.md` through the vault I/O layer: atomic write, exactly
 * one labeled commit. Rewriting an existing plan is how a curriculum is
 * revised — the file is the topic's definition, and the ticks live elsewhere,
 * so nothing is lost as long as the item ids stay stable.
 */
export async function writeTopicPlan(
  vault: Vault,
  input: TopicPlanInput,
  started: string,
): Promise<{ slug: string; relPath: string }> {
  const slug = (input.slug?.trim() || topicSlug(input.title ?? "")).toLowerCase()
  if (!TOPIC_SLUG.test(slug)) throw new Error(`Invalid topic slug: ${slug}`)

  const content = buildPlanFile(input, started)
  const relPath = `${LEARN_DIR}/${slug}/${PLAN_FILE}`
  await vault.write(relPath, content, { message: `/teach: plan ${slug}` })
  return { slug, relPath }
}

/**
 * Write (or extend) a session summary through the vault I/O layer.
 *
 * Refused without a `plan.md`: a session with no topic behind it is the loose
 * learning note this store replaced. Start the topic first, then study it.
 */
export async function writeSession(
  vault: Vault,
  input: SessionInput,
  date: string,
): Promise<{ relPath: string; appended: boolean }> {
  const slug = input.topic?.trim().toLowerCase() ?? ""
  if (!TOPIC_SLUG.test(slug)) throw new Error(`Invalid topic slug: ${slug}`)
  if (!SESSION_DATE.test(date)) throw new Error(`Invalid session date: ${date} (want YYYY-MM-DD)`)
  if (!(await vault.exists(`${LEARN_DIR}/${slug}/${PLAN_FILE}`))) {
    throw new Error(
      `No topic at ${LEARN_DIR}/${slug}. Write its plan.md first — a session belongs to a topic, not to a loose note.`,
    )
  }

  const relPath = `${LEARN_DIR}/${slug}/${SESSIONS_DIR}/${date}.md`
  const existing = (await vault.exists(relPath)) ? await vault.read(relPath) : null
  await vault.write(relPath, buildSessionFile(input, date, existing), {
    message: `/teach: ${existing ? "extend" : "record"} ${slug} session ${date}`,
  })
  return { relPath, appended: existing !== null }
}
