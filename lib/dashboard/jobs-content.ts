/**
 * Jobs content model — the shape of the `jobs/` store, its file names, the
 * pipeline enum, and the parsers that read what the `/cv` skill writes.
 *
 * Framework-free and side-effect free (no `server-only`, no disk access on its
 * own), like `note-content.ts` and `profile-content.ts`, so the CLI script, the
 * dashboard read layer and the tests can all share it. Import-free too, because
 * the client component that renders the pipeline reads its types and enum from
 * here — the YAML renderer lives in the `server-only` layer next door rather
 * than dragging a parser into the browser bundle.
 *
 * Writers (see CLAUDE.md): the `/cv` skill owns the documents inside
 * `jobs/<slug>/` (`jd.md`, `fit.md`, `cv.md`) and the user owns
 * `jobs/cv-template.md`; the **dashboard** owns `jobs/applications.yaml`, the
 * pipeline index. That split mirrors goals: the skill writes the documents, the
 * dashboard records the volatile state (where each application stands, and
 * when it got there).
 */

export const JOBS_DIR = "jobs"
export const APPLICATIONS_FILE = `${JOBS_DIR}/applications.yaml`

/** The four documents an application folder holds. `cv.pdf` is gitignored. */
export const JD_FILE = "jd.md"
export const FIT_FILE = "fit.md"
export const CV_FILE = "cv.md"
export const CV_PDF_FILE = "cv.pdf"

/**
 * The pipeline: `saved → applied → interview → offer`, with `rejected` as the
 * terminal branch off any of them. Ordered, so the dashboard can group by
 * stage; the write path rejects anything outside the enum.
 */
export const APPLICATION_STATUSES = [
  "saved",
  "applied",
  "interview",
  "offer",
  "rejected",
] as const
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number]

export function isApplicationStatus(value: unknown): value is ApplicationStatus {
  return (
    typeof value === "string" &&
    (APPLICATION_STATUSES as readonly string[]).includes(value)
  )
}

/** A row in `jobs/applications.yaml`. The dashboard is the only writer. */
export interface ApplicationEntry {
  /** The `jobs/<slug>/` folder this row tracks. */
  slug: string
  status: ApplicationStatus
  /**
   * When the application entered each stage it has reached (`YYYY-MM-DD`).
   * Kept as a map rather than five columns so a stage that never happened is
   * simply absent, and so the history survives a later transition.
   */
  dates: Partial<Record<ApplicationStatus, string>>
}

/**
 * An application folder joined with its pipeline row — what the Jobs tab
 * renders. Declared here rather than in the `server-only` read layer so the
 * client component that shows it can import the type.
 */
export interface Application {
  slug: string
  company: string
  role: string
  status: ApplicationStatus
  dates: Partial<Record<ApplicationStatus, string>>
  /** The date it entered its current status, when that is recorded. */
  since?: string
  /** Where the description came from (`source:` in `jd.md` frontmatter). */
  source?: string
  hasJd: boolean
  hasFit: boolean
  hasCv: boolean
  hasPdf: boolean
  /** Requirements `fit.md` lists as missing — the gaps `/goals` turns into goals. */
  missingCount: number
}

/** Read one row from YAML, dropping anything malformed rather than throwing. */
export function normalizeApplication(raw: unknown): ApplicationEntry | null {
  if (!raw || typeof raw !== "object") return null
  const row = raw as Record<string, unknown>
  const slug = typeof row.slug === "string" ? row.slug.trim() : ""
  if (!slug) return null

  const dates: Partial<Record<ApplicationStatus, string>> = {}
  const rawDates = row.dates
  if (rawDates && typeof rawDates === "object") {
    for (const [key, value] of Object.entries(rawDates as Record<string, unknown>)) {
      // A YAML date scalar parses to a Date; normalize both forms to YYYY-MM-DD.
      if (!isApplicationStatus(key)) continue
      if (typeof value === "string" && value.trim()) dates[key] = value.trim().slice(0, 10)
      else if (value instanceof Date) dates[key] = value.toISOString().slice(0, 10)
    }
  }

  return {
    slug,
    // An unrecognized status reads as `saved`: the folder exists, so the
    // application exists — a typo should not hide it from the pipeline.
    status: isApplicationStatus(row.status) ? row.status : "saved",
    dates,
  }
}

/** Folder name for an application: `<company>-<role>`, kebab and ASCII-safe. */
export function applicationSlug(company: string, role: string): string {
  const slug = `${company} ${role}`
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "") // drop combining marks left by NFKD
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
  return slug || "application"
}

/** Slugs are plain kebab folder names — reject anything that could escape `jobs/`. */
export const APPLICATION_SLUG = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i

/* ------------------------------------------------------------------------- */
/* fit.md — the gap analysis                                                  */
/* ------------------------------------------------------------------------- */

/**
 * One requirement from `fit.md`: the requirement itself, and the text after the
 * em dash — the evidence that satisfies it, or what is missing.
 */
export interface FitRequirement {
  requirement: string
  detail: string
}

export interface FitAnalysis {
  met: FitRequirement[]
  missing: FitRequirement[]
}

const MET_HEADING = /^##\s+requirements?\s+met\b/i
const MISSING_HEADING = /^##\s+requirements?\s+missing\b/i
const BULLET = /^[-*]\s+(.*\S)\s*$/
/** `**Kubernetes** — no evidence` → requirement + detail. */
const REQUIREMENT = /^\*\*(.+?)\*\*\s*(?:[—–-]\s*(.*))?$/

/**
 * Parse the two lists out of a `fit.md` body.
 *
 * This is the machine-readable half of decision 13: `fit.md` is the hinge
 * between Jobs and Goals, and the `/goals` discovery phase reads its **missing**
 * requirements to propose goals that close real gaps. Keeping the parser here —
 * and testing it against the shape the skill is instructed to write — is what
 * stops the two halves from drifting apart; the dashboard uses the same parse
 * to show how many gaps an application still has.
 */
export function parseFit(markdown: string): FitAnalysis {
  const analysis: FitAnalysis = { met: [], missing: [] }
  let target: FitRequirement[] | null = null

  for (const raw of markdown.replace(/\r\n/g, "\n").split("\n")) {
    const line = raw.trim()
    if (line.startsWith("## ")) {
      target = MET_HEADING.test(line)
        ? analysis.met
        : MISSING_HEADING.test(line)
          ? analysis.missing
          : null
      continue
    }
    if (!target) continue

    // Only top-level bullets are requirements; indented ones are elaboration.
    const bullet = BULLET.exec(raw)?.[1]
    if (!bullet) continue
    const parsed = REQUIREMENT.exec(bullet)
    target.push({
      requirement: (parsed?.[1] ?? bullet).trim(),
      detail: (parsed?.[2] ?? "").trim(),
    })
  }

  return analysis
}
