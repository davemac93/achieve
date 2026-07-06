import Link from "next/link"

import type { Project } from "@/lib/dashboard/types"

/**
 * A project's `status` from frontmatter, rendered as a small badge so
 * `working` vs `private` is visually distinct. Presentational and
 * server-rendered — the dashboard only reads projects (the human owns the
 * files), so there's no interactivity here.
 */
function StatusBadge({ status }: { status?: Project["status"] }) {
  if (status === "private") {
    return (
      <span className="border-border text-muted-foreground rounded-full border px-2 py-0.5 text-xs">
        private · human-only
      </span>
    )
  }
  if (status === "working") {
    return (
      <span className="bg-primary text-primary-foreground rounded-full px-2 py-0.5 text-xs">
        working
      </span>
    )
  }
  return null
}

export function ProjectList({ projects }: { projects: Project[] }) {
  return (
    <ul className="divide-border divide-y">
      {projects.map((project) => (
        <li key={project.slug}>
          <Link
            href={`/projects/${project.slug}`}
            className="hover:bg-accent -mx-2 flex items-center justify-between gap-4 rounded-md px-2 py-2"
          >
            <span className="text-sm">{project.title}</span>
            <StatusBadge status={project.status} />
          </Link>
        </li>
      ))}
    </ul>
  )
}
