import "server-only"

import { openVault } from "@/lib/vault"
import { parseFrontmatter, titleFromSlug } from "@/lib/dashboard/markdown"
import type { Note, NoteWithBody } from "@/lib/dashboard/types"

const DIR = "notes"

/** Slugs are plain kebab file stems — reject anything that could escape `notes/`. */
const SLUG = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i

function asStringArray(value: unknown): string[] | undefined {
  if (Array.isArray(value)) return value.map(String)
  if (typeof value === "string" && value.trim()) return [value]
  return undefined
}

/** Map a note's slug + parsed frontmatter to the `Note` shape (no body). */
function toNote(slug: string, frontmatter: Record<string, unknown>): Note {
  return {
    slug,
    title:
      typeof frontmatter.title === "string" && frontmatter.title.trim()
        ? frontmatter.title
        : titleFromSlug(slug),
    type: typeof frontmatter.type === "string" ? frontmatter.type : undefined,
    tags: asStringArray(frontmatter.tags),
    created:
      typeof frontmatter.created === "string" ? frontmatter.created : undefined,
    project:
      typeof frontmatter.project === "string" ? frontmatter.project : undefined,
  }
}

/**
 * Read all notes from `notes/*.md`. Read-only in the dashboard — the `/note`
 * skill is the primary writer. Newest first (by `created` frontmatter).
 */
export async function getNotes(): Promise<Note[]> {
  const vault = openVault()
  const files = (await vault.list(DIR)).filter((f) => f.endsWith(".md"))

  const notes = await Promise.all(
    files.map(async (file): Promise<Note> => {
      const slug = file.replace(/\.md$/, "")
      const { frontmatter } = parseFrontmatter(await vault.read(`${DIR}/${file}`))
      return toNote(slug, frontmatter)
    })
  )

  return notes.sort((a, b) => (b.created ?? "").localeCompare(a.created ?? ""))
}

/**
 * Read a single note (frontmatter + body) by slug, or `null` if it doesn't
 * exist. Read-only and `server-only`. Used by the dashboard note reader; the
 * human may read any of their own notes here, including `type: private` — the
 * `private` exclusion is an *agent* boundary (`getPublicNotes`), not a
 * human-facing one.
 */
export async function getNote(slug: string): Promise<NoteWithBody | null> {
  if (!SLUG.test(slug)) return null
  const vault = openVault()
  const rel = `${DIR}/${slug}.md`
  if (!(await vault.exists(rel))) return null
  const { frontmatter, body } = parseFrontmatter(await vault.read(rel))
  return { ...toNote(slug, frontmatter), body }
}

/**
 * Notes an agent may read: everything except `type: private`, which is
 * categorically human-only. This is the privacy filter the `/profile` skill
 * (and any future read-scoped agent) builds on — private notes never leave it.
 */
export async function getPublicNotes(): Promise<Note[]> {
  return (await getNotes()).filter((note) => note.type !== "private")
}
