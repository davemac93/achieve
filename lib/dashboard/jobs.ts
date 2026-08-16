import "server-only"

import { stringify } from "yaml"

import { openVault } from "@/lib/vault"
import { parseFrontmatter, titleFromSlug } from "@/lib/dashboard/markdown"
import {
  APPLICATIONS_FILE,
  APPLICATION_SLUG,
  CV_FILE,
  CV_PDF_FILE,
  FIT_FILE,
  JD_FILE,
  JOBS_DIR,
  normalizeApplication,
  parseFit,
  type Application,
  type ApplicationEntry,
  type ApplicationStatus,
  type FitAnalysis,
} from "@/lib/dashboard/jobs-content"

export type { Application } from "@/lib/dashboard/jobs-content"

/**
 * Read side of the Jobs module, plus the dashboard's one write: the pipeline.
 *
 * The store is a folder per application (`jobs/<company>-<role>/`) holding the
 * job description, the gap analysis and the tailored CV — all written by the
 * `/cv` skill. `jobs/applications.yaml` is the **dashboard's** file: where each
 * application stands and when it got there. Same split as goals: definitions
 * belong to the skill, volatile state to the dashboard, so no file has two
 * writers.
 *
 * A folder with no row in `applications.yaml` still appears, as `saved`. The
 * folder is the record — the index only tracks what happened to it — so a
 * skill-written application shows up in the pipeline before the user has
 * touched it, and deleting a row never hides a folder.
 */

/** An application with the documents themselves — the detail page's shape. */
export interface ApplicationDetail extends Application {
  jd: string
  cv: string
  fit: FitAnalysis
  /** The `fit.md` body as written, so the page can show the prose too. */
  fitMarkdown: string
}

const APPLICATIONS_HEADER =
  "# Application pipeline — primary writer: dashboard. Agents read only.\n" +
  "# One row per jobs/<company>-<role>/ folder: where it stands, and the date\n" +
  "# it reached each stage. The documents in the folder (jd.md, fit.md, cv.md)\n" +
  "# belong to the /cv skill; this file holds the volatile state, so no file\n" +
  "# has two writers — the same split as goals.yaml vs goal-status.yaml.\n" +
  "# Each entry: { slug, status: saved|applied|interview|offer|rejected,\n" +
  "#               dates: { <status>: YYYY-MM-DD } }\n"

export function renderApplicationsFile(entries: ApplicationEntry[]): string {
  return APPLICATIONS_HEADER + stringify({ applications: entries })
}

async function readEntries(): Promise<Map<string, ApplicationEntry>> {
  const vault = openVault()
  if (!(await vault.exists(APPLICATIONS_FILE))) return new Map()
  const data = await vault.readYaml<{ applications?: unknown[] } | null>(
    APPLICATIONS_FILE,
  )
  const rows = Array.isArray(data?.applications) ? data.applications : []
  const entries = new Map<string, ApplicationEntry>()
  for (const row of rows) {
    const entry = normalizeApplication(row)
    if (entry) entries.set(entry.slug, entry)
  }
  return entries
}

/** Company and role: `jd.md` frontmatter, falling back to the folder name. */
function identify(
  slug: string,
  frontmatter: Record<string, unknown>,
): { company: string; role: string; source?: string } {
  const company = String(frontmatter.company ?? "").trim()
  const role = String(frontmatter.role ?? "").trim()
  const source = String(frontmatter.source ?? "").trim()
  return {
    company: company || titleFromSlug(slug),
    role,
    ...(source ? { source } : {}),
  }
}

/**
 * Every application, newest first (by the date it was saved, then slug).
 *
 * Reads three small files per folder; there are tens of applications, not
 * thousands, so a plain fan-out is the right shape.
 */
export async function getApplications(): Promise<Application[]> {
  const vault = openVault()
  const [slugs, entries] = await Promise.all([
    vault.listDirs(JOBS_DIR),
    readEntries(),
  ])

  const applications = await Promise.all(
    slugs.map(async (slug): Promise<Application> => {
      const dir = `${JOBS_DIR}/${slug}`
      const [hasJd, hasFit, hasCv, hasPdf] = await Promise.all([
        vault.exists(`${dir}/${JD_FILE}`),
        vault.exists(`${dir}/${FIT_FILE}`),
        vault.exists(`${dir}/${CV_FILE}`),
        vault.exists(`${dir}/${CV_PDF_FILE}`),
      ])
      const frontmatter = hasJd
        ? parseFrontmatter(await vault.read(`${dir}/${JD_FILE}`)).frontmatter
        : {}
      const missingCount = hasFit
        ? parseFit(await vault.read(`${dir}/${FIT_FILE}`)).missing.length
        : 0

      const entry = entries.get(slug)
      const status = entry?.status ?? "saved"
      const dates = entry?.dates ?? {}
      return {
        slug,
        ...identify(slug, frontmatter),
        status,
        dates,
        ...(dates[status] ? { since: dates[status] } : {}),
        hasJd,
        hasFit,
        hasCv,
        hasPdf,
        missingCount,
      }
    }),
  )

  return applications.sort(
    (a, b) =>
      (b.dates.saved ?? "").localeCompare(a.dates.saved ?? "") ||
      a.slug.localeCompare(b.slug),
  )
}

/** One application with its documents, or `null` if the folder does not exist. */
export async function getApplication(
  slug: string,
): Promise<ApplicationDetail | null> {
  if (!APPLICATION_SLUG.test(slug)) return null
  const applications = await getApplications()
  const application = applications.find((entry) => entry.slug === slug)
  if (!application) return null

  const vault = openVault()
  const dir = `${JOBS_DIR}/${slug}`
  const [jd, fitMarkdown, cv] = await Promise.all([
    application.hasJd ? vault.read(`${dir}/${JD_FILE}`) : Promise.resolve(""),
    application.hasFit ? vault.read(`${dir}/${FIT_FILE}`) : Promise.resolve(""),
    application.hasCv ? vault.read(`${dir}/${CV_FILE}`) : Promise.resolve(""),
  ])

  return {
    ...application,
    jd,
    fitMarkdown,
    fit: parseFit(fitMarkdown),
    cv,
  }
}

/** Today as `YYYY-MM-DD`, in the user's own timezone (dates here are local). */
function today(): string {
  const now = new Date()
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 10)
}

/**
 * Move an application along the pipeline, stamping the date it got there.
 *
 * Writes `jobs/applications.yaml` and nothing else — the folder's documents
 * stay the `/cv` skill's. Earlier stage dates are kept: the point of the index
 * is the trail (saved on the 1st, applied on the 5th, interview on the 20th),
 * not just the latest label. Re-setting the same status leaves its date alone,
 * so an accidental re-click never rewrites history.
 */
export async function setApplicationStatus(
  slug: string,
  status: ApplicationStatus,
  date: string = today(),
): Promise<ApplicationEntry> {
  if (!APPLICATION_SLUG.test(slug)) throw new Error(`Invalid application: ${slug}`)
  const vault = openVault()
  if (!(await vault.exists(`${JOBS_DIR}/${slug}/${JD_FILE}`))) {
    throw new Error(
      `No application at ${JOBS_DIR}/${slug}. Save the job description with /cv first.`,
    )
  }

  const entries = await readEntries()
  const existing = entries.get(slug)
  const entry: ApplicationEntry = {
    slug,
    status,
    dates: { ...existing?.dates },
  }
  entry.dates[status] ??= date
  // Every application was saved at some point, even if the row starts later.
  entry.dates.saved ??= date
  entries.set(slug, entry)

  await vault.write(
    APPLICATIONS_FILE,
    renderApplicationsFile([...entries.values()].sort((a, b) => a.slug.localeCompare(b.slug))),
    { message: `dashboard: application ${slug} → ${status}` },
  )
  return entry
}
