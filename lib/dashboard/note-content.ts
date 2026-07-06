/**
 * Note content model — the shape of a `notes/<slug>.md` file and the pure
 * builder that produces one.
 *
 * Framework-free and side-effect free (no `server-only`, no path aliases, no
 * disk access on its own) so it can be shared by three callers without dragging
 * in server-only: the `/note` write script, the dashboard read layer, and the
 * tests. `writeNote` takes an already-opened `Vault` and routes the actual
 * mutation through it, so the atomic-write + one-labeled-commit guarantee is
 * inherited rather than reimplemented.
 */

import { stringify } from "yaml"
import type { Vault } from "@/lib/vault"

/**
 * The note-type enum — the closed set of categories a note may declare.
 *
 * Membership was decided from observed usage, not up front (see README §
 * "Note types"): these are the four types the vault's own skills produce and
 * read. It is deliberately small and can grow, but a note's `type` is now
 * *validated* against it — the write path rejects anything else rather than
 * letting the vocabulary drift silently.
 *
 * `private` is load-bearing: it marks human-only notes that the privacy filter
 * excludes from every agent surface (see `getPublicNotes`). It must stay a
 * member with those semantics intact.
 */
export const NOTE_TYPES = ["learning", "validation", "working", "private"] as const

/** A validated note category — one of {@link NOTE_TYPES}. */
export type NoteType = (typeof NOTE_TYPES)[number]

/** True when `value` is a member of the note-type enum. */
export function isNoteType(value: unknown): value is NoteType {
  return typeof value === "string" && (NOTE_TYPES as readonly string[]).includes(value)
}

/** The fields the `/note` skill hands to the write path. */
export interface NoteInput {
  /** Human title; also the basis for the file slug. */
  title: string
  /** Assigned category — must be a member of NOTE_TYPES (validated on write). */
  type: string
  /** Optional freeform tags. */
  tags?: string[]
  /** Optional project slug this note relates to. */
  project?: string
  /** The (already summarized) markdown body. */
  body: string
}

/** Turn a title into a filesystem-safe kebab slug. */
export function slugify(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
  return slug || "note"
}

/**
 * Build the full markdown for a note: YAML frontmatter (`title`, `type`,
 * optional `tags`/`project`, `created`) followed by the body. Pure — `created`
 * is passed in so the output is deterministic and testable.
 */
export function buildNoteFile(input: NoteInput, created: string): string {
  const title = input.title.trim()
  const type = input.type.trim()
  if (!title) throw new Error("A note needs a title.")
  if (!type) throw new Error("A note needs a type.")
  if (!isNoteType(type)) {
    throw new Error(
      `Invalid note type ${JSON.stringify(type)}. Must be one of: ${NOTE_TYPES.join(", ")}.`,
    )
  }

  const frontmatter: Record<string, unknown> = { title, type }
  const tags = (input.tags ?? []).map((t) => t.trim()).filter(Boolean)
  if (tags.length) frontmatter.tags = tags
  if (input.project?.trim()) frontmatter.project = input.project.trim()
  frontmatter.created = created

  return `---\n${stringify(frontmatter)}---\n\n${input.body.trim()}\n`
}

/**
 * Write a note into the vault through the I/O layer: pick a non-colliding slug,
 * build the file, and commit exactly one labeled mutation. Returns the slug and
 * the vault-relative path actually written.
 */
export async function writeNote(
  vault: Vault,
  input: NoteInput,
  created: string,
): Promise<{ slug: string; relPath: string }> {
  const content = buildNoteFile(input, created)

  const existing = new Set(
    (await vault.list("notes")).filter((f) => f.endsWith(".md")),
  )
  const base = slugify(input.title)
  let slug = base
  for (let n = 2; existing.has(`${slug}.md`); n++) slug = `${base}-${n}`

  const relPath = `notes/${slug}.md`
  await vault.write(relPath, content, { message: `/note: add ${slug}` })
  return { slug, relPath }
}
