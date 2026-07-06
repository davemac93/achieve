import Link from "next/link"
import { notFound } from "next/navigation"

import { getNote } from "@/lib/dashboard/notes"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

export default async function NotePage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const note = await getNote(slug)
  if (!note) notFound()

  const meta = [
    note.type ? (note.type === "private" ? "private · human-only" : note.type) : null,
    note.created ? note.created.slice(0, 10) : null,
    note.project ? `project: ${note.project}` : null,
  ].filter(Boolean)

  return (
    <Card>
      <CardHeader>
        <CardTitle>{note.title}</CardTitle>
        <CardDescription>
          {meta.join(" · ")}
          {note.tags?.length ? ` · ${note.tags.map((t) => `#${t}`).join(" ")}` : ""}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="text-sm leading-relaxed whitespace-pre-wrap">{note.body.trim()}</div>
        <Link href="/notes" className="text-muted-foreground text-xs hover:underline">
          ← Back to notes
        </Link>
      </CardContent>
    </Card>
  )
}
