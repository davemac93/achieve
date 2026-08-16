import type { Experience } from "@/lib/dashboard/types"

/** `2021-03 – present` — an absent `end` means the role is current. */
function period(role: Experience): string {
  const start = role.start || "?"
  return `${start} – ${role.end ?? "present"}`
}

/**
 * Roles from `profile/experience/*.md`, read-only (the `/profile` skill writes
 * them). The narrative body is the achievement material a future CV draws on,
 * so it is shown as written rather than summarized away.
 */
export function ExperienceList({ roles }: { roles: Experience[] }) {
  return (
    <ul className="divide-border divide-y">
      {roles.map((role) => (
        <li key={role.slug} className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0">
          <div className="flex items-baseline justify-between gap-4">
            <span className="text-sm font-medium">
              {role.title}
              {role.company ? ` · ${role.company}` : ""}
            </span>
            <span className="text-muted-foreground shrink-0 text-xs">
              {period(role)}
            </span>
          </div>
          {role.tech.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {role.tech.map((tech) => (
                <span
                  key={tech}
                  className="border-border text-muted-foreground rounded-full border px-2 py-0.5 text-xs"
                >
                  {tech}
                </span>
              ))}
            </div>
          ) : null}
          {role.body ? (
            <p className="text-muted-foreground text-sm whitespace-pre-line">
              {role.body}
            </p>
          ) : null}
        </li>
      ))}
    </ul>
  )
}
