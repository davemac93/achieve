import Link from "next/link"
import { notFound } from "next/navigation"

import { getSession, getTopic } from "@/lib/dashboard/learn"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

export default async function SessionPage({
  params,
}: {
  params: Promise<{ topic: string; date: string }>
}) {
  const { topic: slug, date } = await params
  const [topic, session] = await Promise.all([getTopic(slug), getSession(slug, date)])
  if (!topic || !session) notFound()

  const covered = session.covered
    .map((id) => topic.items.find((item) => item.id === id)?.title ?? id)
    .join(", ")

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {topic.title} — {session.date}
        </CardTitle>
        <CardDescription>
          {covered ? `Covered ${covered}` : "Written by /teach after the session."}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="text-sm leading-relaxed whitespace-pre-wrap">
          {session.body.trim()}
        </div>
        <Link
          href={`/learn/${topic.slug}`}
          className="text-muted-foreground text-xs hover:underline"
        >
          ← Back to {topic.title}
        </Link>
      </CardContent>
    </Card>
  )
}
