/**
 * Gathers the vault's indexable, non-private prose for the search index.
 *
 * Framework-free (no `server-only`, no path aliases) so the indexing script
 * can import it directly, mirroring `lib/dashboard/note-content.ts`. Reads
 * only `notes/` and `projects/` — the privacy wall on diary entries holds by
 * construction, since this module never lists or opens that directory.
 */

import { parse } from 'yaml'
import type { Vault } from '../vault/index.ts'

export interface IndexableDoc {
  source: 'notes' | 'projects'
  slug: string
  title: string
  type?: string
  project?: string
  tags?: string[]
  body: string
}

function splitFrontmatter(content: string): {
  frontmatter: Record<string, unknown>
  body: string
} {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(content)
  if (!match) return { frontmatter: {}, body: content }

  let frontmatter: Record<string, unknown> = {}
  try {
    const parsed = parse(match[1] ?? '')
    if (parsed && typeof parsed === 'object') frontmatter = parsed as Record<string, unknown>
  } catch {
    // Malformed frontmatter — treat as none rather than crashing the indexer.
  }
  return { frontmatter, body: content.slice(match[0].length) }
}

function titleFromSlug(slug: string): string {
  const words = slug.replace(/[-_]+/g, ' ').trim()
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : slug
}

function asStringArray(value: unknown): string[] | undefined {
  if (Array.isArray(value)) return value.map(String)
  if (typeof value === 'string' && value.trim()) return [value]
  return undefined
}

/**
 * `notes/*.md` minus `type: private` — the same boundary `getPublicNotes`
 * enforces for the dashboard's agent-facing reads.
 */
async function getIndexableNotes(vault: Vault): Promise<IndexableDoc[]> {
  const files = (await vault.list('notes')).filter((f) => f.endsWith('.md'))

  const docs = await Promise.all(
    files.map(async (file): Promise<IndexableDoc | null> => {
      const slug = file.replace(/\.md$/, '')
      const { frontmatter, body } = splitFrontmatter(await vault.read(`notes/${file}`))
      if (frontmatter.type === 'private') return null

      return {
        source: 'notes',
        slug,
        title:
          typeof frontmatter.title === 'string' && frontmatter.title.trim()
            ? frontmatter.title
            : titleFromSlug(slug),
        type: typeof frontmatter.type === 'string' ? frontmatter.type : undefined,
        project: typeof frontmatter.project === 'string' ? frontmatter.project : undefined,
        tags: asStringArray(frontmatter.tags),
        body: body.trim(),
      }
    }),
  )

  return docs.filter((d): d is IndexableDoc => d !== null)
}

/**
 * `projects/*.md` minus `status: private`. Projects don't use the same
 * `type: private` note taxonomy, but a project explicitly marked private is
 * excluded for the same reason: it must never surface via semantic search.
 */
async function getIndexableProjects(vault: Vault): Promise<IndexableDoc[]> {
  const files = (await vault.list('projects')).filter((f) => f.endsWith('.md'))

  const docs = await Promise.all(
    files.map(async (file): Promise<IndexableDoc | null> => {
      const slug = file.replace(/\.md$/, '')
      const { frontmatter, body } = splitFrontmatter(await vault.read(`projects/${file}`))
      if (frontmatter.status === 'private') return null

      return {
        source: 'projects',
        slug,
        title:
          typeof frontmatter.title === 'string' && frontmatter.title.trim()
            ? frontmatter.title
            : titleFromSlug(slug),
        body: body.trim(),
      }
    }),
  )

  return docs.filter((d): d is IndexableDoc => d !== null)
}

/** All indexable documents (notes + projects), excluding empty bodies. */
export async function getIndexableDocuments(vault: Vault): Promise<IndexableDoc[]> {
  const [notes, projects] = await Promise.all([
    getIndexableNotes(vault),
    getIndexableProjects(vault),
  ])
  return [...notes, ...projects].filter((d) => d.body.length > 0)
}
