import "server-only"

import { openVault } from "@/lib/vault"
import { parseFrontmatter, titleFromSlug } from "@/lib/dashboard/markdown"
import type { Project } from "@/lib/dashboard/types"

const DIR = "projects"

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
      const status = frontmatter.status
      return {
        slug,
        title:
          typeof frontmatter.title === "string" && frontmatter.title.trim()
            ? frontmatter.title
            : titleFromSlug(slug),
        status: status === "private" || status === "working" ? status : undefined,
      }
    })
  )

  return projects.sort((a, b) => a.title.localeCompare(b.title))
}
