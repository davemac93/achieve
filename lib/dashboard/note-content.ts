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
 * The current note-type set. Fluid in v2 — the `/note` skill assigns from this
 * list, but a note is not hard-rejected for using another value yet. Issue #41
 * promotes this into a documented, validated enum once real usage data exists.
 * `private` is load-bearing: it marks human-only notes the privacy filter
 * excludes from every agent surface (see `getPublicNotes`).
 */
export const NOTE_TYPES = ["learning", "validation", "working", "private"] as const

/** The fields the `/note` skill hands to the write path. */
export interface NoteInput {
  /** Human title; also the basis for the file slug. */
  title: string
  /** Assigned category — one of NOTE_TYPES in normal use. */
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
