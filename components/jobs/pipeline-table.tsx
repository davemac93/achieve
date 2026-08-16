"use client"

import * as React from "react"
import Link from "next/link"
import { FileText, ScanSearch } from "lucide-react"

import { setApplicationStatusAction } from "@/app/actions"
import {
  APPLICATION_STATUSES,
  type Application,
  type ApplicationStatus,
} from "@/lib/dashboard/jobs-content"

/** Colour per stage — progress reads at a glance, rejection stays neutral. */
const STATUS_CLASS: Record<ApplicationStatus, string> = {
  saved: "bg-accent text-accent-foreground",
  applied: "bg-sky-500/15 text-sky-700 dark:text-sky-400",
  interview: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  offer: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-500",
  rejected: "text-muted-foreground border-border border",
}

function DocBadge({
  present,
  label,
  icon: Icon,
}: {
  present: boolean
  label: string
  icon: typeof FileText
}) {
  return (
    <span
      title={present ? label : `${label} — not written yet`}
      className={
        present
          ? "text-foreground inline-flex items-center gap-1 text-xs"
          : "text-muted-foreground/40 inline-flex items-center gap-1 text-xs"
      }
    >
      <Icon className="size-3.5" aria-hidden />
      {label}
    </span>
  )
}

/**
 * The application pipeline. Read-mostly: the folder's documents are the `/cv`
 * skill's, and the one thing the dashboard writes is where each application
 * stands — so the only control here is the stage dropdown, which appends
 * today's date to `applications.yaml` through a server action.
 */
export function PipelineTable({ applications }: { applications: Application[] }) {
  const [isPending, startTransition] = React.useTransition()

  return (
    <div className="flex flex-col gap-1">
      {applications.map((application) => (
        <div
          key={application.slug}
          className="border-border flex flex-wrap items-center justify-between gap-3 border-b py-3 last:border-b-0"
        >
          <div className="flex min-w-48 flex-1 flex-col gap-1">
            <Link
              href={`/jobs/${application.slug}`}
              className="text-sm font-medium hover:underline"
            >
              {application.company}
              {application.role ? (
                <span className="text-muted-foreground font-normal">
                  {" "}
                  · {application.role}
                </span>
              ) : null}
            </Link>
            <div className="flex flex-wrap items-center gap-3">
              <DocBadge present={application.hasJd} label="jd" icon={FileText} />
              <DocBadge present={application.hasFit} label="fit" icon={ScanSearch} />
              <DocBadge present={application.hasCv} label="cv" icon={FileText} />
              {application.hasFit ? (
                <span className="text-muted-foreground text-xs">
                  {application.missingCount === 0
                    ? "no gaps"
                    : `${application.missingCount} gap${application.missingCount === 1 ? "" : "s"}`}
                </span>
              ) : null}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span
              className={`rounded-full px-2 py-0.5 text-xs ${STATUS_CLASS[application.status]}`}
            >
              {application.status}
              {application.since ? ` · ${application.since}` : ""}
            </span>
            <select
              aria-label={`Stage for ${application.company}`}
              className="border-input h-8 rounded-md border bg-transparent px-2 text-xs shadow-xs"
              value={application.status}
              disabled={isPending}
              onChange={(event) => {
                const next = event.target.value
                startTransition(async () => {
                  await setApplicationStatusAction(application.slug, next)
                })
              }}
            >
              {APPLICATION_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </div>
        </div>
      ))}
    </div>
  )
}
