import "server-only"

import { openVault } from "@/lib/vault"
import { getGoals } from "@/lib/dashboard/goals"
import { getProjects } from "@/lib/dashboard/projects"
import { getPublicNotes } from "@/lib/dashboard/notes"
import { getEvidence } from "@/lib/dashboard/evidence"
import { parseFrontmatter } from "@/lib/dashboard/markdown"
import {
  EDUCATION_FILE,
  EXPERIENCE_DIR,
  PREFERENCES_FILE,
  SKILLS_FILE,
  USER_MD,
  emptyPreferences,
  isSkillLevel,
} from "@/lib/dashboard/profile-content"
import type {
  Education,
  EvidenceRecord,
  Experience,
  Goal,
  Note,
  Preferences,
  ProfileSkill,
  Project,
} from "@/lib/dashboard/types"

/**
 * Read side of the profile context database.
 *
 * `user.md` is the **short summary** auto-loaded into every Claude Code session
 * (the vault's `CLAUDE.md` imports it); the full picture lives in the `profile/`
 * stores below, which agents query only when they need them. Keeping them apart
 * is what stops a trivial `/note` call from paying for the user's whole history.
 *
 * Writers: the dashboard editor and the `/profile` skill share `user.md`;
 * `/profile` owns the `profile/` stores — except `profile/evidence.yaml`, which
 * only the dashboard appends to ([evidence.ts](./evidence.ts)).
 */

/** Read `user.md`. Returns an empty string if it does not exist yet. */
export async function getProfile(): Promise<string> {
  const vault = openVault()
  if (!(await vault.exists(USER_MD))) return ""
  return vault.read(USER_MD)
}

/**
 * Save `user.md`. The dashboard editor (human) and the `/profile` skill (after
 * approval) are the two sanctioned writers; this is the human path.
 */
export async function saveProfile(content: string): Promise<void> {
  const body = content.replace(/\r\n/g, "\n").trimEnd()
  if (!body) throw new Error("Profile must not be empty.")
  const vault = openVault()
  await vault.write(USER_MD, `${body}\n`, { message: "dashboard: edit profile" })
}

/** Read a YAML store, tolerating a missing or empty file. */
async function readStore<T>(relPath: string): Promise<T | null> {
  const vault = openVault()
  if (!(await vault.exists(relPath))) return null
  return (await vault.readYaml<T | null>(relPath)) ?? null
}

function asStringList(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String) : []
}

/**
 * Skills from `profile/skills.yaml`, strongest-looking first (by evidence, then
 * name). Rows with an unrecognized level are kept at `basic` rather than
 * dropped — the file is hand-editable, and a typo should not hide a skill.
 */
export async function getSkills(): Promise<ProfileSkill[]> {
  const data = await readStore<{ skills?: unknown[] }>(SKILLS_FILE)
  const rows = Array.isArray(data?.skills) ? data.skills : []

  return rows
    .filter((row): row is Record<string, unknown> => !!row && typeof row === "object")
    .map((row) => ({
      skill: String(row.skill ?? "").trim(),
      level: isSkillLevel(row.level) ? row.level : "basic",
      evidenceCount: Number.isFinite(Number(row.evidenceCount))
        ? Number(row.evidenceCount)
        : 0,
      lastUsed: typeof row.lastUsed === "string" ? row.lastUsed : undefined,
    }))
    .filter((skill) => skill.skill !== "")
    .sort(
      (a, b) => b.evidenceCount - a.evidenceCount || a.skill.localeCompare(b.skill),
    )
}

/** Roles from `profile/experience/*.md`, most recent first. */
export async function getExperience(): Promise<Experience[]> {
  const vault = openVault()
  const files = (await vault.list(EXPERIENCE_DIR)).filter((f) => f.endsWith(".md"))

  const roles = await Promise.all(
    files.map(async (file): Promise<Experience> => {
      const slug = file.replace(/\.md$/, "")
      const { frontmatter, body } = parseFrontmatter(
        await vault.read(`${EXPERIENCE_DIR}/${file}`),
      )
      return {
        slug,
        company: String(frontmatter.company ?? "").trim(),
        title: String(frontmatter.title ?? "").trim(),
        start: frontmatter.start != null ? String(frontmatter.start) : "",
        end: frontmatter.end != null ? String(frontmatter.end) : undefined,
        tech: asStringList(frontmatter.tech),
        body: body.trim(),
      }
    }),
  )

  // A role with no `end` is current, so it sorts above any dated one.
  return roles.sort(
    (a, b) => (b.end ?? "9999").localeCompare(a.end ?? "9999") || b.start.localeCompare(a.start),
  )
}

/** Education entries from `profile/education.yaml`. */
export async function getEducation(): Promise<Education[]> {
  const data = await readStore<{ education?: unknown[] }>(EDUCATION_FILE)
  const rows = Array.isArray(data?.education) ? data.education : []

  return rows
    .filter((row): row is Record<string, unknown> => !!row && typeof row === "object")
    .map((row) => ({
      institution: String(row.institution ?? "").trim(),
      qualification: String(row.qualification ?? "").trim(),
      start: row.start != null ? String(row.start) : undefined,
      end: row.end != null ? String(row.end) : undefined,
      notes: typeof row.notes === "string" ? row.notes : undefined,
    }))
    .filter((entry) => entry.institution !== "" || entry.qualification !== "")
}

/** `profile/preferences.yaml` — how the user works best. */
export async function getPreferences(): Promise<Preferences> {
  const data = await readStore<Record<string, unknown>>(PREFERENCES_FILE)
  if (!data) return emptyPreferences()
  return {
    workStyle: asStringList(data.workStyle),
    constraints: asStringList(data.constraints),
    energyPatterns: asStringList(data.energyPatterns),
  }
}

/**
 * The complete set of vault material the `/profile` skill is allowed to draw on:
 * the structured profile stores and the evidence log, plus goals, projects and
 * non-private notes.
 *
 * It deliberately excludes the two protected sources — diary entries and
 * private notes are never gathered here, so they can never reach the profile.
 * The privacy test asserts exactly that.
 */
export interface ProfileSources {
  goals: Goal[]
  projects: Project[]
  notes: Note[]
  skills: ProfileSkill[]
  experience: Experience[]
  education: Education[]
  preferences: Preferences
  /** Read-only here: `/profile` proposes promotions from it, never writes it. */
  evidence: EvidenceRecord[]
}

export async function getProfileSources(): Promise<ProfileSources> {
  const [goals, projects, notes, skills, experience, education, preferences, evidence] =
    await Promise.all([
      getGoals(),
      getProjects(),
      getPublicNotes(),
      getSkills(),
      getExperience(),
      getEducation(),
      getPreferences(),
      getEvidence(),
    ])
  return { goals, projects, notes, skills, experience, education, preferences, evidence }
}
