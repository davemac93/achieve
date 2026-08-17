import Link from "next/link"
import { notFound } from "next/navigation"

import { getTopic } from "@/lib/dashboard/learn"
import { CurriculumList } from "@/components/learn/curriculum-list"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

export default async function TopicPage({
  params,
}: {
  params: Promise<{ topic: string }>
}) {
  const { topic: slug } = await params
  const topic = await getTopic(slug)
  if (!topic) notFound()

  const meta = [
    `${topic.percent}% · ${topic.doneItems}/${topic.totalItems} items`,
    topic.started ? `started ${topic.started}` : null,
  ].filter(Boolean)

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>{topic.title}</CardTitle>
          <CardDescription>{meta.join(" · ")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm">
          {/* Why the topic exists is the first thing on the page on purpose:
              a curriculum with no reason behind it is aimless studying. */}
          {topic.why ? <p>{topic.why}</p> : null}
          <div className="text-muted-foreground flex flex-wrap gap-4 text-xs">
            {topic.goal ? (
              <Link href="/goals" className="hover:underline">
                Demanded by goal <code>{topic.goal}</code> →
              </Link>
            ) : null}
            {topic.job ? (
              <Link href={`/jobs/${topic.job}`} className="hover:underline">
                Missing requirement in <code>{topic.job}</code> →
              </Link>
            ) : null}
            <Link href="/learn" className="hover:underline">
              ← Back to topics
            </Link>
          </div>
          {topic.body.trim() ? (
            <div className="text-sm leading-relaxed whitespace-pre-wrap">
              {topic.body.trim()}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Curriculum</CardTitle>
          <CardDescription>
            From <code>plan.md</code>, ordered so a prerequisite always comes
            before what waits on it. Tick an item as you finish it; a
            skill-tagged item appends to your evidence log, which is what lets
            /profile promote a skill level honestly.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {topic.items.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No curriculum items yet — run /teach on this topic to propose one.
            </p>
          ) : (
            <CurriculumList topic={topic.slug} items={topic.items} />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Sessions</CardTitle>
          <CardDescription>
            Every session /teach has run on this topic, newest first — the whole
            history in one place, rather than scattered notes.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {topic.sessions.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No sessions yet. Run <code>/teach {topic.slug}</code> in Claude Code.
            </p>
          ) : (
            <ul className="divide-border divide-y">
              {topic.sessions.map((date) => (
                <li key={date} className="py-2 first:pt-0 last:pb-0">
                  <Link
                    href={`/learn/${topic.slug}/sessions/${date}`}
                    className="text-sm hover:underline"
                  >
                    {date}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </>
  )
}
