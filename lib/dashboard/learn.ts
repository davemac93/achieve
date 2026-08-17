import "server-only"

import { openVault } from "@/lib/vault"
import { parseFrontmatter } from "@/lib/dashboard/markdown"
import {
  LEARN_DIR,
  LEARN_STATUS_FILE,
  PLAN_FILE,
  SESSIONS_DIR,
  SESSION_DATE,
  TOPIC_SLUG,
  computeCurriculumView,
  doneItemIds,
  normalizeLearnStatus,
  normalizeTopicPlan,
  renderLearnStatusFile,
  type CurriculumItem,
  type CurriculumItemView,
  type LearnStatus,
  type TopicPlan,
  type TopicProgress,
} from "@/lib/dashboard/learn-content"

export type { CurriculumItem, CurriculumItemView, TopicPlan } from "@/lib/dashboard/learn-content"

/**
 * Read side of the Learn module, plus the dashboard's one write: which
 * curriculum items are ticked.
 *
 * The store is a folder per topic (`learn/<topic>/`) holding `plan.md` — what is
 * being learned, why, and the ordered curriculum — and one file per study
 * session under `sessions/`, all written by the `/teach` skill.
 * `learn/status.yaml` is the **dashboard's** file. Same split as goals:
 * definitions belong to the skill, volatile state to the dashboard, so no file
 * has two writers.
 *
 * A folder with a `plan.md` is a topic whether or not it has ever been studied,
 * and a topic with ticks but no plan simply shows nothing — the plan is the
 * record, `status.yaml` only tracks what happened against it.
 */

/** A topic without its prose — the shape the Learn tab lists. */
export interface TopicSummary extends TopicProgress {
  slug: string
  title: string
  why: string
  /** The `goals.yaml` step that demanded it, if a goal did. */
  goal?: string
  /** The `jobs/<slug>/` application whose `fit.md` listed it missing. */
  job?: string
  started?: string
  /** Session files under `sessions/`, newest first. */
  sessions: string[]
}

/** A topic with its curriculum and prose — the detail page's shape. */
export interface TopicDetail extends TopicSummary {
  body: string
  items: CurriculumItemView[]
}

/** One study session, as `/teach` wrote it. */
export interface Session {
  /** `YYYY-MM-DD` — the file name, and the date in its frontmatter. */
  date: string
  /** Curriculum item ids the session worked on, when it recorded any. */
  covered: string[]
  body: string
}

/** Ticked items for every topic. Empty when the dashboard has never written. */
export async function getLearnStatus(): Promise<LearnStatus> {
  const vault = openVault()
  if (!(await vault.exists(LEARN_STATUS_FILE))) return {}
  return normalizeLearnStatus(await vault.readYaml(LEARN_STATUS_FILE))
}

/** Read one topic's `plan.md`, or `null` when the folder holds no plan. */
async function readPlan(slug: string): Promise<TopicPlan | null> {
  const vault = openVault()
  const relPath = `${LEARN_DIR}/${slug}/${PLAN_FILE}`
  if (!(await vault.exists(relPath))) return null
  const { frontmatter, body } = parseFrontmatter(await vault.read(relPath))
  return normalizeTopicPlan(slug, frontmatter, body)
}

/** Session dates for a topic, newest first. */
async function listSessions(slug: string): Promise<string[]> {
  const vault = openVault()
  const files = await vault.list(`${LEARN_DIR}/${slug}/${SESSIONS_DIR}`)
  return files
    .filter((name) => name.endsWith(".md"))
    .map((name) => name.slice(0, -".md".length))
    .sort()
    .reverse()
}

function summarize(
  plan: TopicPlan,
  status: LearnStatus,
  sessions: string[],
): TopicSummary {
  const view = computeCurriculumView(plan.curriculum, doneItemIds(status, plan.slug))
  return {
    slug: plan.slug,
    title: plan.title,
    why: plan.why,
    ...(plan.goal ? { goal: plan.goal } : {}),
    ...(plan.job ? { job: plan.job } : {}),
    ...(plan.started ? { started: plan.started } : {}),
    sessions,
    totalItems: view.totalItems,
    doneItems: view.doneItems,
    percent: view.percent,
    complete: view.complete,
  }
}

/**
 * Every topic, least finished first, so what still needs work leads. Reads two
 * small files per topic; there are tens of topics, not thousands, so a plain
 * fan-out is the right shape.
 */
export async function getTopics(): Promise<TopicSummary[]> {
  const vault = openVault()
  const [slugs, status] = await Promise.all([vault.listDirs(LEARN_DIR), getLearnStatus()])

  const topics = await Promise.all(
    slugs.map(async (slug): Promise<TopicSummary | null> => {
      const plan = await readPlan(slug)
      if (!plan) return null
      return summarize(plan, status, await listSessions(slug))
    }),
  )

  return topics
    .filter((topic): topic is TopicSummary => topic !== null)
    .sort((a, b) => a.percent - b.percent || a.title.localeCompare(b.title))
}

/** One topic with its curriculum, ticked state and prose, or `null`. */
export async function getTopic(slug: string): Promise<TopicDetail | null> {
  if (!TOPIC_SLUG.test(slug)) return null
  const [plan, status] = await Promise.all([readPlan(slug), getLearnStatus()])
  if (!plan) return null

  const sessions = await listSessions(slug)
  const view = computeCurriculumView(plan.curriculum, doneItemIds(status, slug))
  return {
    ...summarize(plan, status, sessions),
    body: plan.body,
    items: view.items,
  }
}

/** One session summary, or `null` when that date was never studied. */
export async function getSession(slug: string, date: string): Promise<Session | null> {
  if (!TOPIC_SLUG.test(slug) || !SESSION_DATE.test(date)) return null
  const vault = openVault()
  const relPath = `${LEARN_DIR}/${slug}/${SESSIONS_DIR}/${date}.md`
  if (!(await vault.exists(relPath))) return null

  const { frontmatter, body } = parseFrontmatter(await vault.read(relPath))
  const covered = Array.isArray(frontmatter.covered)
    ? frontmatter.covered.filter((id): id is string => typeof id === "string")
    : []
  return { date, covered, body }
}

/** What a tick resolved to, so the caller can act on the item's `skill:` tag. */
export interface TickedItem {
  topic: TopicSummary
  item: CurriculumItem
}

/**
 * Tick (or untick) a curriculum item, writing only `learn/status.yaml` —
 * `plan.md` stays owned by the `/teach` skill, so no file has two writers.
 *
 * A **blocked** item is refused, exactly as a blocked goal step is: its
 * prerequisites are not done, and ticking "write an operator" before "what is a
 * pod" is a claim about learning that did not happen. Unticking a blocked item
 * is allowed — it cannot legitimately be done, so clearing it is a correction.
 *
 * Returns the item and its topic, so the caller can append evidence.
 */
export async function setCurriculumItemDone(
  slug: string,
  itemId: string,
  done: boolean,
): Promise<TickedItem> {
  if (!TOPIC_SLUG.test(slug)) throw new Error(`Invalid topic: ${slug}`)
  const [plan, status] = await Promise.all([readPlan(slug), getLearnStatus()])
  if (!plan)
    throw new Error(
      `No topic at ${LEARN_DIR}/${slug}. Start one with /teach — it writes the plan.`,
    )

  const view = computeCurriculumView(plan.curriculum, doneItemIds(status, slug))
  const item = view.items.find((entry) => entry.id === itemId)
  if (!item) throw new Error(`Unknown curriculum item: ${itemId}`)
  if (done && item.blockedBy.length > 0)
    throw new Error(
      `"${item.title}" is blocked: ${item.blockedBy.join(", ")} must be done first.`,
    )

  const next: LearnStatus = {
    ...status,
    [slug]: { ...status[slug], [itemId]: { done } },
  }
  const vault = openVault()
  await vault.write(LEARN_STATUS_FILE, renderLearnStatusFile(next), {
    message: done ? "dashboard: tick curriculum item" : "dashboard: untick curriculum item",
  })

  return {
    topic: summarize(plan, next, await listSessions(slug)),
    item,
  }
}
