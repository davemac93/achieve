/**
 * Profile content model — the shape of the `profile/` stores, the builders that
 * produce them, and the one-time migration that parses a hand-written `user.md`
 * into them.
 *
 * Framework-free and side-effect free (no `server-only`, no disk access on its
 * own), like `note-content.ts`, so three callers can share it without dragging
 * server-only into plain node: the migration script, the dashboard read layer,
 * and the tests. `applyProposal` takes an already-opened `Vault`, so the atomic
 * write + one-labeled-commit guarantee is inherited rather than reimplemented.
 *
 * Writers (see CLAUDE.md): the `/profile` skill owns every file below except
 * `profile/evidence.yaml`, which only the dashboard appends to.
 */

import { stringify } from "yaml"
import type { Vault } from "@/lib/vault"
// Relative, extension-ful: this is the one *value* import here, and the
// migration script runs under plain node, which resolves no path aliases.
import {
  SKILL_LEVELS,
  type Education,
  type Experience,
  type Preferences,
  type ProfileSkill,
  type SkillLevel,
} from "./types.ts"

export const PROFILE_DIR = "profile"
export const SKILLS_FILE = `${PROFILE_DIR}/skills.yaml`
export const EDUCATION_FILE = `${PROFILE_DIR}/education.yaml`
export const PREFERENCES_FILE = `${PROFILE_DIR}/preferences.yaml`
export const EVIDENCE_FILE = `${PROFILE_DIR}/evidence.yaml`
export const EXPERIENCE_DIR = `${PROFILE_DIR}/experience`
export const USER_MD = "user.md"

/** An empty preferences record — the shape callers get when the file is blank. */
export function emptyPreferences(): Preferences {
  return { workStyle: [], constraints: [], energyPatterns: [] }
}

export function isSkillLevel(value: unknown): value is SkillLevel {
  return typeof value === "string" && (SKILL_LEVELS as readonly string[]).includes(value)
}

/** File-name stem for a role: `<company>-<title>`, kebab and ASCII-safe. */
export function experienceSlug(company: string, title: string): string {
  const slug = `${company} ${title}`
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "") // drop combining marks left by NFKD
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
  return slug || "role"
}

/** Compose `profile/experience/<slug>.md`: frontmatter, then the narrative. */
export function buildExperienceFile(entry: Omit<Experience, "slug">): string {
  const company = entry.company.trim()
  const title = entry.title.trim()
  if (!company) throw new Error("An experience entry needs a company.")
  if (!title) throw new Error("An experience entry needs a title.")

  const frontmatter: Record<string, unknown> = {
    company,
    title,
    start: entry.start.trim(),
  }
  // An absent `end` is meaningful: the role is current. Never write a guess.
  if (entry.end?.trim()) frontmatter.end = entry.end.trim()
  if (entry.tech.length > 0) frontmatter.tech = entry.tech

  const body = entry.body.trim()
  return `---\n${stringify(frontmatter).trimEnd()}\n---\n\n${body}\n`
}

/* ------------------------------------------------------------------------- */
/* Migration: hand-written user.md → structured stores                        */
/* ------------------------------------------------------------------------- */

/**
 * What a migration would produce. Deliberately just data: the script prints it,
 * the `/profile` skill shows it to the user and may correct it, and only an
 * approved proposal is ever written.
 */
export interface ProfileProposal {
  skills: ProfileSkill[]
  education: Education[]
  preferences: Preferences
  experience: Experience[]
}

export interface ProposedFile {
  relPath: string
  content: string
}

interface Section {
  heading: string
  lines: string[]
}

/** Split markdown into its `##`-level sections (text before the first one is dropped). */
function sections(text: string): Section[] {
  const out: Section[] = []
  let current: Section | null = null
  for (const line of text.replace(/\r\n/g, "\n").split("\n")) {
    const heading = /^##\s+(.*\S)\s*$/.exec(line)
    if (heading && !line.startsWith("###")) {
      current = { heading: heading[1]!, lines: [] }
      out.push(current)
      continue
    }
    current?.lines.push(line)
  }
  return out
}

/** Top-level `- ` / `* ` bullets in a block, with the marker stripped. */
function bullets(lines: string[]): string[] {
  return lines
    .map((line) => /^\s*[-*]\s+(.*\S)\s*$/.exec(line)?.[1])
    .filter((text): text is string => Boolean(text))
}

/** Split a block into `###` sub-sections (the roles inside an Experience section). */
function subSections(lines: string[]): Section[] {
  const out: Section[] = []
  let current: Section | null = null
  for (const line of lines) {
    const heading = /^###\s+(.*\S)\s*$/.exec(line)
    if (heading) {
      current = { heading: heading[1]!, lines: [] }
      out.push(current)
      continue
    }
    current?.lines.push(line)
  }
  return out
}

const DASH = /\s+[—–-]\s+/

/** `2019–2023`, `2019-06 — present`, `(2019 to now)` … → start/end, if present. */
function parseDates(text: string): { start?: string; end?: string } {
  const range =
    /\b(\d{4}(?:-\d{2})?)\s*(?:[—–-]|to)\s*(present|now|current|\d{4}(?:-\d{2})?)?/i.exec(text)
  if (!range) return {}
  const end = range[2]
  return {
    start: range[1],
    end: end && !/^(present|now|current)$/i.test(end) ? end : undefined,
  }
}

/** Strip a trailing date range and its brackets from a heading. */
function withoutDates(text: string): string {
  return text
    .replace(/\((?:[^()]*\d{4}[^()]*)\)/g, "")
    .replace(/,?\s*\b\d{4}(?:-\d{2})?\s*(?:[—–-]|to)\s*(?:present|now|current|\d{4}(?:-\d{2})?)?\s*$/i, "")
    .trim()
}

/**
 * Parse a role heading. `X at Y` reads as *title at company*; a dash form
 * (`Acme — Senior Engineer`) reads as *company — title*, the more common CV
 * order. Both are guesses on free prose — the user corrects them at the
 * approval step, which is exactly why migration is proposed, never applied.
 */
function parseRoleHeading(heading: string): { company: string; title: string } {
  const text = withoutDates(heading)
  const at = /\s+at\s+/i.exec(text)
  if (at) {
    return {
      title: text.slice(0, at.index).trim(),
      company: text.slice(at.index + at[0].length).trim(),
    }
  }
  const dash = DASH.exec(text)
  if (dash) {
    return {
      company: text.slice(0, dash.index).trim(),
      title: text.slice(dash.index + dash[0].length).trim(),
    }
  }
  return { company: text, title: text }
}

const TECH_LINE = /^(?:tech|stack|tech stack|technologies)\s*:\s*(.*)$/i

function splitList(text: string): string[] {
  return text
    .split(/[,;/]|\s+·\s+/)
    .map((part) => part.trim())
    .filter(Boolean)
}

function parseExperienceSection(section: Section): Experience[] {
  const roles = subSections(section.lines)
  // No `###` roles: fall back to one bullet per role, body empty.
  const blocks: { heading: string; lines: string[] }[] =
    roles.length > 0
      ? roles
      : bullets(section.lines).map((text) => ({ heading: text, lines: [] }))

  return blocks.map((block) => {
    const { company, title } = parseRoleHeading(block.heading)
    const dates = parseDates(block.heading)
    const tech: string[] = []
    const bodyLines: string[] = []
    for (const line of block.lines) {
      const bullet = /^\s*[-*]\s+(.*\S)\s*$/.exec(line)?.[1] ?? line.trim()
      const techLine = TECH_LINE.exec(bullet)
      if (techLine) {
        tech.push(...splitList(techLine[1]!))
        continue
      }
      bodyLines.push(line)
    }
    return {
      slug: experienceSlug(company, title),
      company,
      title,
      start: dates.start ?? "",
      ...(dates.end ? { end: dates.end } : {}),
      tech,
      body: bodyLines.join("\n").trim(),
    }
  })
}

/**
 * Skills from a bullet list. `Kubernetes — working` carries its own level;
 * a bare `TypeScript, React` yields one skill per item at `basic`. Levels are
 * never invented above what the text says, and `evidenceCount` always starts at
 * 0 — the evidence log is the only thing that may raise it.
 */
function parseSkillsSection(section: Section): ProfileSkill[] {
  const out: ProfileSkill[] = []
  const seen = new Set<string>()

  const add = (name: string, level: SkillLevel): void => {
    const skill = name.trim()
    if (!skill) return
    const key = skill.toLowerCase()
    if (seen.has(key)) return
    seen.add(key)
    out.push({ skill, level, evidenceCount: 0 })
  }

  for (const bullet of bullets(section.lines)) {
    const dash = DASH.exec(bullet)
    const tail = dash ? bullet.slice(dash.index + dash[0].length).trim() : ""
    const declared = tail.replace(/[().]/g, "").trim().toLowerCase()
    if (dash && isSkillLevel(declared)) {
      add(bullet.slice(0, dash.index), declared)
      continue
    }
    for (const item of splitList(bullet)) add(item, "basic")
  }
  return out
}

/** `MSc Computer Science — University of X (2018–2020)` and friends. */
function parseEducationSection(section: Section): Education[] {
  const roles = subSections(section.lines)
  const items =
    roles.length > 0 ? roles.map((r) => r.heading) : bullets(section.lines)

  return items.map((item) => {
    const text = withoutDates(item)
    const dash = DASH.exec(text)
    const dates = parseDates(item)
    return {
      qualification: dash ? text.slice(0, dash.index).trim() : text,
      institution: dash ? text.slice(dash.index + dash[0].length).trim() : "",
      ...(dates.start ? { start: dates.start } : {}),
      ...(dates.end ? { end: dates.end } : {}),
    }
  })
}

const CONSTRAINT = /\b(constraint|can'?t|cannot|avoid|no |never|limit|only)\b/i
const ENERGY = /\b(energy|morning|evening|night|afternoon|focus|deep work|tired|peak)\b/i

/** Route each preference bullet to the list it belongs in. */
function parsePreferencesSection(section: Section): Preferences {
  const prefs = emptyPreferences()
  for (const bullet of bullets(section.lines)) {
    if (ENERGY.test(bullet)) prefs.energyPatterns.push(bullet)
    else if (CONSTRAINT.test(bullet)) prefs.constraints.push(bullet)
    else prefs.workStyle.push(bullet)
  }
  return prefs
}

const HEADING_MATCHERS: {
  match: RegExp
  apply: (proposal: ProfileProposal, section: Section) => void
}[] = [
  {
    match: /experience|work history|career|roles|employment/i,
    apply: (p, s) => p.experience.push(...parseExperienceSection(s)),
  },
  {
    match: /education|degree|studies|university|school/i,
    apply: (p, s) => p.education.push(...parseEducationSection(s)),
  },
  {
    match: /skill|stack|technolog|tooling/i,
    apply: (p, s) => p.skills.push(...parseSkillsSection(s)),
  },
  {
    match: /work best|preferenc|how i work|constraint|energy|working style/i,
    apply: (p, s) => {
      const parsed = parsePreferencesSection(s)
      p.preferences.workStyle.push(...parsed.workStyle)
      p.preferences.constraints.push(...parsed.constraints)
      p.preferences.energyPatterns.push(...parsed.energyPatterns)
    },
  },
]

/**
 * Parse a hand-written `user.md` into a proposal for the structured stores.
 *
 * Best-effort by design: it recognizes the sections people actually write
 * (experience, education, skills, how-I-work) and ignores everything else,
 * which stays in `user.md` untouched. Nothing here writes — the caller shows
 * the proposal and only an approved one reaches disk.
 */
export function parseUserMd(text: string): ProfileProposal {
  const proposal: ProfileProposal = {
    skills: [],
    education: [],
    preferences: emptyPreferences(),
    experience: [],
  }
  for (const section of sections(text)) {
    for (const matcher of HEADING_MATCHERS) {
      if (matcher.match.test(section.heading)) {
        matcher.apply(proposal, section)
        break
      }
    }
  }
  return proposal
}

function hasPreferences(prefs: Preferences): boolean {
  return (
    prefs.workStyle.length + prefs.constraints.length + prefs.energyPatterns.length > 0
  )
}

/** Render a proposal as the files it would produce. Empty stores are omitted. */
export function proposalFiles(proposal: ProfileProposal): ProposedFile[] {
  const files: ProposedFile[] = []

  if (proposal.skills.length > 0) {
    files.push({ relPath: SKILLS_FILE, content: stringify({ skills: proposal.skills }) })
  }
  if (proposal.education.length > 0) {
    files.push({
      relPath: EDUCATION_FILE,
      content: stringify({ education: proposal.education }),
    })
  }
  if (hasPreferences(proposal.preferences)) {
    files.push({
      relPath: PREFERENCES_FILE,
      content: stringify(proposal.preferences),
    })
  }
  for (const role of proposal.experience) {
    files.push({
      relPath: `${EXPERIENCE_DIR}/${role.slug}.md`,
      content: buildExperienceFile(role),
    })
  }
  return files
}

export interface MigrationResult {
  written: string[]
  /** Targets left alone, and why — a migration never overwrites real content. */
  skipped: { relPath: string; reason: string }[]
}

/** A YAML store counts as empty (safe to fill) when it holds no records. */
function isEmptyStore(text: string): boolean {
  const stripped = text
    .split("\n")
    .filter((line) => !/^\s*#/.test(line))
    .join("\n")
  return !/^\s*-\s+\S/m.test(stripped)
}

/**
 * Write an approved proposal through the vault (one labeled commit per file).
 *
 * Non-destructive, without exception:
 *  - `user.md` is never touched here — the migration only *adds* structure.
 *  - an existing experience file is never overwritten; the target is skipped.
 *  - a YAML store is filled only when it is still the empty seed; a store with
 *    records in it is skipped, never merged behind the user's back.
 */
export async function applyProposal(
  vault: Vault,
  files: ProposedFile[],
  message = "/profile: migrate user.md into profile/",
): Promise<MigrationResult> {
  const result: MigrationResult = { written: [], skipped: [] }

  for (const file of files) {
    if (await vault.exists(file.relPath)) {
      const existing = await vault.read(file.relPath)
      const isYaml = file.relPath.endsWith(".yaml")
      if (!isYaml || !isEmptyStore(existing)) {
        result.skipped.push({
          relPath: file.relPath,
          reason: isYaml ? "already has records" : "file already exists",
        })
        continue
      }
    }
    await vault.write(file.relPath, file.content, { message })
    result.written.push(file.relPath)
  }
  return result
}
