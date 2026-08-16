import Link from "next/link"
import { notFound } from "next/navigation"

import { getApplication } from "@/lib/dashboard/jobs"
import type { FitRequirement } from "@/lib/dashboard/jobs-content"
import { stripFrontmatter } from "@/lib/dashboard/cv-render"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

function Requirements({
  items,
  empty,
}: {
  items: FitRequirement[]
  empty: string
}) {
  if (items.length === 0) {
    return <p className="text-muted-foreground text-sm">{empty}</p>
  }
  return (
    <ul className="divide-border divide-y">
      {items.map((item) => (
        <li key={item.requirement} className="flex flex-col gap-0.5 py-2 first:pt-0 last:pb-0">
          <span className="text-sm font-medium">{item.requirement}</span>
          {item.detail ? (
            <span className="text-muted-foreground text-xs">{item.detail}</span>
          ) : null}
        </li>
      ))}
    </ul>
  )
}

export default async function ApplicationPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const application = await getApplication(slug)
  if (!application) notFound()

  const meta = [
    application.status,
    application.since,
    application.role,
  ].filter(Boolean)

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>{application.company}</CardTitle>
          <CardDescription>
            {meta.join(" · ")}
            {application.source ? ` · ${application.source}` : ""}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-4 text-sm">
          {application.hasCv ? (
            <Link
              href={`/jobs/${slug}/cv`}
              className="underline underline-offset-2"
            >
              Print view of the CV →
            </Link>
          ) : (
            <span className="text-muted-foreground">
              No cv.md yet — run /cv to fill your template for this role.
            </span>
          )}
          <Link href="/jobs" className="text-muted-foreground hover:underline">
            ← Back to the pipeline
          </Link>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Fit</CardTitle>
          <CardDescription>
            From <code>fit.md</code>. Every satisfied requirement is cited to
            something already in your profile; the missing ones are what /goals
            reads when it looks for goals worth having.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6 md:grid-cols-2">
          <div className="flex flex-col gap-2">
            <h2 className="text-sm font-medium">
              Met ({application.fit.met.length})
            </h2>
            <Requirements
              items={application.fit.met}
              empty="No gap analysis yet — run /cv for this application."
            />
          </div>
          <div className="flex flex-col gap-2">
            <h2 className="text-sm font-medium">
              Missing ({application.fit.missing.length})
            </h2>
            <Requirements
              items={application.fit.missing}
              empty="Nothing listed as missing."
            />
          </div>
        </CardContent>
      </Card>

      {application.hasJd ? (
        <Card>
          <CardHeader>
            <CardTitle>Job description</CardTitle>
            <CardDescription>
              As pasted, in <code>jd.md</code> — the source every claim in the
              fit analysis is judged against.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-sm leading-relaxed whitespace-pre-wrap">
              {stripFrontmatter(application.jd).trim()}
            </div>
          </CardContent>
        </Card>
      ) : null}
    </>
  )
}
