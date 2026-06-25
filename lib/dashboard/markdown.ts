import "server-only"

import { parse } from "yaml"

/**
 * Split a markdown file into its YAML frontmatter and body. A file with no
 * leading `---` block yields empty frontmatter and the whole text as body.
 */
export function parseFrontmatter(content: string): {
  frontmatter: Record<string, unknown>
  body: string
} {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(content)
  if (!match) return { frontmatter: {}, body: content }

  let frontmatter: Record<string, unknown> = {}
  try {
    const parsed = parse(match[1] ?? "")
    if (parsed && typeof parsed === "object") {
      frontmatter = parsed as Record<string, unknown>
    }
  } catch {
    // Malformed frontmatter — treat as none rather than crashing the dashboard.
  }

  return { frontmatter, body: content.slice(match[0].length) }
}

/** Turn a file slug like `my-side-project` into `My side project`. */
export function titleFromSlug(slug: string): string {
  const words = slug.replace(/[-_]+/g, " ").trim()
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : slug
}
