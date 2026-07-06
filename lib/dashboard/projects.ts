import "server-only"

import { openVault } from "@/lib/vault"
import { parseFrontmatter, titleFromSlug } from "@/lib/dashboard/markdown"
import type { Project, ProjectWithBody } from "@/lib/dashboard/types"

const DIR = "projects"

/** Slugs are plain kebab file stems — reject anything that could escape `projects/`. */
const SLUG = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i

/** Map a project's slug + parsed frontmatter to the `Project` shape (no body). */
function toProject(slug: string, frontmatter: Record<string, unknown>): Project {
  const status = frontmatter.status
  return {
    slug,
    title:
      typeof frontmatter.title === "string" && frontmatter.title.trim()
        ? frontmatter.title
        : titleFromSlug(slug),
    status: status === "private" || status === "working" ? status : undefined,
  }
}

/**
 * Read all projects from `projects/*.md`. Read-only in the dashboard — the
 * human owns these files. Returns an empty list if the directory is empty.
 */
export async function getProjects(): Promise<Project[]> {
  const vault = openVault()
  const files = (await vault.list(DIR)).filter((f) => f.endsWith(".md"))

  const projects = await Promise.all(
    files.map(async (file): Promise<Project> => {
      const slug = file.replace(/\.md$/, "")
      const { frontmatter } = parseFrontmatter(await vault.read(`${DIR}/${file}`))
      return toProject(slug, frontmatter)
    })
  )

  return projects.sort((a, b) => a.title.localeCompare(b.title))
}

/**
 * Read a single project (frontmatter + body) by slug, or `null` if it doesn't
 * exist. Read-only and `server-only` — the human authors these in markdown.
 */
export async function getProject(slug: string): Promise<ProjectWithBody | null> {
  if (!SLUG.test(slug)) return null
  const vault = openVault()
  const rel = `${DIR}/${slug}.md`
  if (!(await vault.exists(rel))) return null
  const { frontmatter, body } = parseFrontmatter(await vault.read(rel))
  return { ...toProject(slug, frontmatter), body }
}
