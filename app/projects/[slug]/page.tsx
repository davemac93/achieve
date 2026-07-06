import Link from "next/link"
import { notFound } from "next/navigation"

import { getProject } from "@/lib/dashboard/projects"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const project = await getProject(slug)
  if (!project) notFound()

  const status =
    project.status === "private"
      ? "private · human-only"
      : project.status === "working"
        ? "working"
        : "no status"

  return (
    <Card>
      <CardHeader>
        <CardTitle>{project.title}</CardTitle>
        <CardDescription>{status}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="text-sm leading-relaxed whitespace-pre-wrap">
          {project.body.trim() || "This project note is empty."}
        </div>
        <Link href="/projects" className="text-muted-foreground text-xs hover:underline">
          ← Back to projects
        </Link>
      </CardContent>
    </Card>
  )
}
