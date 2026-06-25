import "server-only"

import { openVault } from "@/lib/vault"
import { parseFrontmatter, titleFromSlug } from "@/lib/dashboard/markdown"
import type { Note } from "@/lib/dashboard/types"

const DIR = "notes"

function asStringArray(value: unknown): string[] | undefined {
  if (Array.isArray(value)) return value.map(String)
  if (typeof value === "string" && value.trim()) return [value]
  return undefined
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
    })
  )

  return notes.sort((a, b) => (b.created ?? "").localeCompare(a.created ?? ""))
}

/**
 * Notes an agent may read: everything except `type: private`, which is
 * categorically human-only. This is the privacy filter the `/profile` skill
 * (and any future read-scoped agent) builds on — private notes never leave it.
 */
export async function getPublicNotes(): Promise<Note[]> {
  return (await getNotes()).filter((note) => note.type !== "private")
}
