/**
 * Fitness content model — the shape of the `fitness/` store, the pure builders
 * that produce the two skill-owned files, and the adherence math.
 *
 * Framework-free and side-effect free (no `server-only`, no disk access of its
 * own), like `learn-content.ts` and `note-content.ts`, so three callers share
 * it: the `/fitness` write script running under plain node, the dashboard read
 * layer, and the tests.
 *
 * Writers (see CLAUDE.md): the `/fitness` skill owns `intake.yaml` and
 * `plan.md`; the **dashboard** owns `workouts.yaml` and `measurements.yaml`.
 * Same split as `goals.yaml` vs `goal-status.yaml` — the program is the skill's,
 * what actually happened is the user's.
 *
 * Two boundaries are baked into this file rather than left to prose:
 *
 * - **The intake comes first.** `writeTrainingPlan` refuses to write a plan into
 *   a vault with no `intake.yaml`, and refuses one that schedules more days than
 *   the user said they have. A generic program is exactly what the interview
 *   exists to prevent, so the write path — not just the skill text — insists.
 * - **Nutrition is out of v1.** There is deliberately no calorie, macro or meal
 *   field anywhere below. It carries the highest data-entry burden in fitness,
 *   concentrates the health-advice risk, and is the most common reason such logs
 *   get abandoned; a field nobody can write is a boundary nobody can drift past.
 *
 * The photos folder is not reachable from here, on purpose: body photos are
 * gitignored and permission-denied, and no code in this project names that path
 * except the module registry, which only declares that the module owns it.
 */

import { stringify } from "yaml"
import type { Vault } from "@/lib/vault"

export const FITNESS_DIR = "fitness"
/** The interview answers — written once, revised when the user's life changes. */
export const INTAKE_FILE = `${FITNESS_DIR}/intake.yaml`
/** The training program itself, approve-gated prose plus a machine-read header. */
export const PLAN_FILE = `${FITNESS_DIR}/plan.md`
/** Sessions actually done — the dashboard's file. */
export const WORKOUTS_FILE = `${FITNESS_DIR}/workouts.yaml`
/** Body metrics over time — the dashboard's file. */
export const MEASUREMENTS_FILE = `${FITNESS_DIR}/measurements.yaml`

/** Dates are plain local `YYYY-MM-DD` everywhere in this module. */
export const DATE = /^\d{4}-\d{2}-\d{2}$/

/** Where the user is starting from — pitch, not diagnosis. */
export const TRAINING_LEVELS = ["beginner", "returning", "intermediate", "advanced"] as const
export type TrainingLevel = (typeof TRAINING_LEVELS)[number]

/** When they can actually train, which decides what a realistic plan looks like. */
export const TIMES_OF_DAY = ["morning", "midday", "evening", "varies"] as const
export type TimeOfDay = (typeof TIMES_OF_DAY)[number]

/**
 * The intake interview's answers — the reason a plan is cut for this user
 * rather than copied off a website.
 *
 * `limitations` is the one field to read carefully: it holds injuries, pain and
 * health conditions **in the user's own words**, recorded verbatim so the plan
 * can route around them. It is never a diagnosis, never interpreted, and never
 * treated as clearance — that comes from a doctor or a physiotherapist. See the
 * medical boundary in the `/fitness` skill.
 */
export interface Intake {
  /** `YYYY-MM-DD` the answers were last confirmed. */
  updated: string
  /** What the user has trained before, and how it went. */
  history: string
  level: TrainingLevel
  /** Days a week they can genuinely train — the ceiling a plan may not exceed. */
  daysPerWeek: number
  /** Minutes a session can realistically run. */
  sessionMinutes?: number
  timeOfDay?: TimeOfDay
  /** What they can train with: gym, barbell, dumbbells, pull-up bar, nothing. */
  equipment: string[]
  /** Injuries, pain, conditions — verbatim. Never diagnosed here. */
  limitations?: string
  /** What they want out of training, in their words. */
  wants?: string
}

/** One recurring session the plan defines, referenced by a logged workout. */
export interface PlanSession {
  id: string
  title: string
}

/** `fitness/plan.md` — the program, approve-gated and grounded in the intake. */
export interface TrainingPlan {
  title: string
  /** `YYYY-MM-DD` the plan was last revised. */
  updated: string
  /** Sessions a week the plan schedules — what adherence is measured against. */
  daysPerWeek: number
  sessions: PlanSession[]
  /** The program itself: exercises, progression, deloads, how to swap a day. */
  body: string
}

/** One session that actually happened. The dashboard's row. */
export interface Workout {
  id: string
  /** `YYYY-MM-DD`. */
  date: string
  /** What was done — free text, so an unplanned hike still counts. */
  title: string
  /** The `plan.md` session id this was, when it was one of them. */
  session?: string
  durationMin?: number
  /** Rate of perceived exertion, 1–10 — how hard it felt, not how it went. */
  rpe?: number
  notes?: string
}

/** One dated body measurement. The dashboard's row. */
export interface Measurement {
  id: string
  /** `YYYY-MM-DD`. */
  date: string
  weightKg?: number
  waistCm?: number
  notes?: string
}

/* ------------------------------------------------------------------------- */
/* Reading what is on disk                                                    */
/* ------------------------------------------------------------------------- */

function text(value: unknown): string {
  if (typeof value === "string") return value.trim()
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  return ""
}

function num(value: unknown): number | null {
  const n = typeof value === "string" ? Number(value) : value
  return typeof n === "number" && Number.isFinite(n) ? n : null
}

/** Read `intake.yaml`, or `null` when it holds nothing usable. */
export function normalizeIntake(raw: unknown): Intake | null {
  if (!raw || typeof raw !== "object") return null
  const row = raw as Record<string, unknown>

  const level = text(row.level).toLowerCase()
  const timeOfDay = text(row.timeOfDay).toLowerCase()
  const days = num(row.daysPerWeek)
  const minutes = num(row.sessionMinutes)

  const intake: Intake = {
    updated: text(row.updated).slice(0, 10),
    history: text(row.history),
    level: (TRAINING_LEVELS as readonly string[]).includes(level)
      ? (level as TrainingLevel)
      : "beginner",
    daysPerWeek: days !== null && days > 0 ? Math.floor(days) : 0,
    equipment: Array.isArray(row.equipment)
      ? row.equipment.map(text).filter(Boolean)
      : [],
  }
  if (minutes !== null && minutes > 0) intake.sessionMinutes = Math.floor(minutes)
  if ((TIMES_OF_DAY as readonly string[]).includes(timeOfDay)) {
    intake.timeOfDay = timeOfDay as TimeOfDay
  }
  const limitations = text(row.limitations)
  if (limitations) intake.limitations = limitations
  const wants = text(row.wants)
  if (wants) intake.wants = wants

  // An intake with no training days answered is not an intake — the plan has
  // nothing to build on, and the interview should be run (or finished) first.
  return intake.daysPerWeek > 0 ? intake : null
}

/**
 * Read a `plan.md` into a `TrainingPlan`, tolerating a hand-edited file: a
 * missing title falls back, a malformed session row is dropped rather than
 * crashing the tab. The plan is the user's (via `/fitness`), so the dashboard
 * reads it defensively and never writes it back.
 */
export function normalizeTrainingPlan(
  frontmatter: Record<string, unknown>,
  body: string,
): TrainingPlan {
  const days = num(frontmatter.daysPerWeek)
  const rows = Array.isArray(frontmatter.sessions) ? frontmatter.sessions : []

  return {
    title: text(frontmatter.title) || "Training plan",
    updated: text(frontmatter.updated).slice(0, 10),
    daysPerWeek: days !== null && days > 0 ? Math.floor(days) : 0,
    sessions: rows
      .map((raw): PlanSession | null => {
        if (!raw || typeof raw !== "object") return null
        const row = raw as Record<string, unknown>
        const id = text(row.id)
        if (!id) return null
        return { id, title: text(row.title) || id }
      })
      .filter((session): session is PlanSession => session !== null),
    body,
  }
}

/** Read `workouts.yaml`, dropping rows that could not be logged by the UI. */
export function normalizeWorkouts(raw: unknown): Workout[] {
  const rows = (raw as { workouts?: unknown } | null)?.workouts
  if (!Array.isArray(rows)) return []

  return rows.flatMap((entry): Workout[] => {
    if (!entry || typeof entry !== "object") return []
    const row = entry as Record<string, unknown>
    const id = text(row.id)
    const date = text(row.date).slice(0, 10)
    const title = text(row.title)
    if (!id || !DATE.test(date) || !title) return []

    const workout: Workout = { id, date, title }
    const session = text(row.session)
    if (session) workout.session = session
    const duration = num(row.durationMin)
    if (duration !== null && duration > 0) workout.durationMin = Math.round(duration)
    const rpe = num(row.rpe)
    if (rpe !== null && rpe >= 1 && rpe <= 10) workout.rpe = rpe
    const notes = text(row.notes)
    if (notes) workout.notes = notes
    return [workout]
  })
}

/** Read `measurements.yaml`, dropping rows with no date or no metric. */
export function normalizeMeasurements(raw: unknown): Measurement[] {
  const rows = (raw as { measurements?: unknown } | null)?.measurements
  if (!Array.isArray(rows)) return []

  return rows.flatMap((entry): Measurement[] => {
    if (!entry || typeof entry !== "object") return []
    const row = entry as Record<string, unknown>
    const id = text(row.id)
    const date = text(row.date).slice(0, 10)
    if (!id || !DATE.test(date)) return []

    const measurement: Measurement = { id, date }
    const weight = num(row.weightKg)
    if (weight !== null && weight > 0) measurement.weightKg = weight
    const waist = num(row.waistCm)
    if (waist !== null && waist > 0) measurement.waistCm = waist
    const notes = text(row.notes)
    if (notes) measurement.notes = notes
    // A row with a date and nothing measured is noise, not a measurement.
    return measurement.weightKg !== undefined ||
      measurement.waistCm !== undefined ||
      measurement.notes !== undefined
      ? [measurement]
      : []
  })
}

/* ------------------------------------------------------------------------- */
/* Adherence                                                                   */
/* ------------------------------------------------------------------------- */

/** One week of the adherence window, Monday-started. */
export interface WeekAdherence {
  /** `YYYY-MM-DD` of that week's Monday. */
  weekStart: string
  /** Sessions the plan asked for that week. */
  planned: number
  /** Sessions actually logged — uncapped, so a double week shows as one. */
  done: number
  /** `done / planned`, 0–100 rounded. Can exceed 100. */
  percent: number
}

export interface Adherence {
  /** Oldest week first, so the bars read left to right like a calendar. */
  weeks: WeekAdherence[]
  planned: number
  /** Sessions that counted toward the rollup — capped per week (see below). */
  counted: number
  /** `counted / planned`, 0–100 rounded. 0 when the plan asks for nothing. */
  percent: number
}

/** The Monday of the week containing `date`, as `YYYY-MM-DD`. */
export function weekStart(date: string): string {
  const day = new Date(`${date}T00:00:00Z`)
  // getUTCDay: 0 = Sunday. Monday-started weeks match how a training week reads.
  const shift = (day.getUTCDay() + 6) % 7
  day.setUTCDate(day.getUTCDate() - shift)
  return day.toISOString().slice(0, 10)
}

/** `date` shifted by `days`, as `YYYY-MM-DD`. */
function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/**
 * Adherence over the last `weeks` weeks ending with the week containing
 * `today` — the share of planned sessions that actually happened.
 *
 * **A double week does not buy back a missed one.** Each week contributes at
 * most its planned sessions to the rollup, so eight sessions one week and none
 * the next is 50%, not 100%. The plan is a cadence, and the point of measuring
 * adherence is to show when the cadence broke; an average that hides it would
 * be worse than no number. The per-week `done` stays raw, so the extra work is
 * still visible in the chart.
 *
 * Pure: `today` is passed in, so the result is deterministic and testable.
 */
export function computeAdherence(
  workouts: readonly Workout[],
  daysPerWeek: number,
  weeks: number,
  today: string,
): Adherence {
  const planned = Math.max(0, Math.floor(daysPerWeek))
  const window = Math.max(1, Math.floor(weeks))
  const lastMonday = weekStart(today)
  const firstMonday = addDays(lastMonday, -7 * (window - 1))

  const doneByWeek = new Map<string, number>()
  for (const workout of workouts) {
    const monday = weekStart(workout.date)
    if (monday < firstMonday || monday > lastMonday) continue
    doneByWeek.set(monday, (doneByWeek.get(monday) ?? 0) + 1)
  }

  const rows: WeekAdherence[] = []
  for (let i = 0; i < window; i++) {
    const monday = addDays(firstMonday, 7 * i)
    const done = doneByWeek.get(monday) ?? 0
    rows.push({
      weekStart: monday,
      planned,
      done,
      percent: planned === 0 ? 0 : Math.round((done / planned) * 100),
    })
  }

  const totalPlanned = planned * window
  const counted = rows.reduce((sum, week) => sum + Math.min(week.done, planned), 0)
  return {
    weeks: rows,
    planned: totalPlanned,
    counted,
    percent: totalPlanned === 0 ? 0 : Math.round((counted / totalPlanned) * 100),
  }
}

/** One point of a metric over time, oldest first — what the charts plot. */
export interface SeriesPoint {
  date: string
  value: number
}

/**
 * A single metric out of the measurement log, oldest first. Measurements with
 * that metric missing are skipped rather than interpolated: a line drawn
 * through a value nobody recorded is a claim the vault cannot back.
 */
export function metricSeries(
  measurements: readonly Measurement[],
  metric: "weightKg" | "waistCm",
): SeriesPoint[] {
  return measurements
    .flatMap((m): SeriesPoint[] => {
      const value = m[metric]
      return value === undefined ? [] : [{ date: m.date, value }]
    })
    .sort((a, b) => a.date.localeCompare(b.date))
}

/* ------------------------------------------------------------------------- */
/* Writing — the `/fitness` skill's two files                                  */
/* ------------------------------------------------------------------------- */

export const INTAKE_HEADER = `# Training intake — primary writer: the /fitness skill. Dashboard reads only.
# The interview answers behind fitness/plan.md, kept in their own file so the
# plan can be rewritten without asking the questions again.
# \`limitations\` holds injuries, pain and conditions **in the user's own words**.
# It is recorded, never diagnosed and never treated as clearance: whether an
# injury allows a movement is a question for a doctor or physiotherapist.
# There is deliberately no nutrition field — out of scope for v1.
`

/** What the `/fitness` skill hands the write path for the intake. */
export interface IntakeInput {
  history: string
  level: string
  daysPerWeek: number
  sessionMinutes?: number
  timeOfDay?: string
  equipment?: string[]
  limitations?: string
  wants?: string
}

/**
 * Build `intake.yaml`. Refused without the two answers a plan cannot be cut
 * without: how the user trains today (`history`, so the program starts where
 * they are) and how many days a week they actually have.
 *
 * Pure: `updated` is passed in, so the output is deterministic and testable.
 */
export function buildIntakeFile(input: IntakeInput, updated: string): string {
  const history = input.history?.trim()
  if (!history)
    throw new Error(
      "The intake needs the user's training history — what they have done and how it went. A plan with no starting point is the generic program the interview exists to replace.",
    )
  const days = Math.floor(Number(input.daysPerWeek))
  if (!Number.isFinite(days) || days < 1 || days > 7)
    throw new Error("The intake needs daysPerWeek — how many days a week the user can train (1–7).")

  const level = String(input.level ?? "").trim().toLowerCase()
  if (!(TRAINING_LEVELS as readonly string[]).includes(level))
    throw new Error(`level must be one of: ${TRAINING_LEVELS.join(", ")}.`)

  const intake: Record<string, unknown> = { updated, history, level, daysPerWeek: days }
  const minutes = Math.floor(Number(input.sessionMinutes))
  if (Number.isFinite(minutes) && minutes > 0) intake.sessionMinutes = minutes

  const timeOfDay = String(input.timeOfDay ?? "").trim().toLowerCase()
  if (timeOfDay) {
    if (!(TIMES_OF_DAY as readonly string[]).includes(timeOfDay))
      throw new Error(`timeOfDay must be one of: ${TIMES_OF_DAY.join(", ")}.`)
    intake.timeOfDay = timeOfDay
  }

  intake.equipment = (input.equipment ?? []).map((e) => String(e).trim()).filter(Boolean)
  if (input.limitations?.trim()) intake.limitations = input.limitations.trim()
  if (input.wants?.trim()) intake.wants = input.wants.trim()

  return INTAKE_HEADER + stringify(intake)
}

/** What the `/fitness` skill hands the write path for the plan. */
export interface TrainingPlanInput {
  title: string
  daysPerWeek: number
  sessions: PlanSession[]
  body: string
}

/**
 * Build `plan.md`: a small machine-read frontmatter (what adherence counts
 * against, and the session ids a logged workout can name) then the program.
 *
 * Refused without a body — a plan is the program, and frontmatter alone is a
 * schedule with no training in it.
 */
export function buildPlanFile(
  input: TrainingPlanInput,
  intake: Intake,
  updated: string,
): string {
  const title = input.title?.trim()
  if (!title) throw new Error("A training plan needs a title.")

  const days = Math.floor(Number(input.daysPerWeek))
  if (!Number.isFinite(days) || days < 1)
    throw new Error("A training plan needs daysPerWeek — the sessions a week it schedules.")
  // Grounded in the intake, and enforced here rather than trusted: a plan may
  // start smaller than the user's availability, never larger than it. Five days
  // written for someone who said three is the plan they quietly abandon.
  if (days > intake.daysPerWeek)
    throw new Error(
      `The plan schedules ${days} days a week, but the intake says ${intake.daysPerWeek}. A plan may ask for fewer days than the user has, never more.`,
    )

  const sessions = (input.sessions ?? []).flatMap((session): PlanSession[] => {
    const id = String(session?.id ?? "").trim()
    if (!id) return []
    return [{ id, title: String(session?.title ?? "").trim() || id }]
  })
  const ids = new Set(sessions.map((s) => s.id))
  if (ids.size !== sessions.length)
    throw new Error("Session ids must be unique — a logged workout names one of them.")

  const body = input.body?.trim()
  if (!body)
    throw new Error(
      "A training plan needs a body — the sessions, the progression, and what to do on a bad week.",
    )

  const frontmatter = { title, updated, daysPerWeek: days, sessions }
  return `---\n${stringify(frontmatter)}---\n\n${body}\n`
}

/** Write `intake.yaml` through the vault I/O layer: atomic, one labeled commit. */
export async function writeIntake(
  vault: Vault,
  input: IntakeInput,
  updated: string,
): Promise<{ relPath: string }> {
  await vault.write(INTAKE_FILE, buildIntakeFile(input, updated), {
    message: "/fitness: write training intake",
  })
  return { relPath: INTAKE_FILE }
}

/**
 * Write `plan.md` through the vault I/O layer.
 *
 * **Refused when there is no intake.** The interview is not a nicety the skill
 * may skip when it is in a hurry: without it the plan is generic, and a generic
 * plan is what this module exists to replace. Rewriting an existing plan is how
 * a program is revised — the log lives in other files, so nothing is lost.
 */
export async function writeTrainingPlan(
  vault: Vault,
  input: TrainingPlanInput,
  updated: string,
): Promise<{ relPath: string }> {
  if (!(await vault.exists(INTAKE_FILE)))
    throw new Error(
      `No intake at ${INTAKE_FILE}. Run the intake interview first — a plan written without it is a generic program, which is precisely what this module exists to replace.`,
    )
  const intake = normalizeIntake(await vault.readYaml(INTAKE_FILE))
  if (!intake)
    throw new Error(
      `${INTAKE_FILE} is incomplete — it must at least say how many days a week the user can train. Finish the intake interview, then write the plan.`,
    )

  await vault.write(PLAN_FILE, buildPlanFile(input, intake, updated), {
    message: "/fitness: write training plan",
  })
  return { relPath: PLAN_FILE }
}
