import Link from "next/link"

import { getTopics } from "@/lib/dashboard/learn"
import { SectionPlaceholder } from "@/components/section-placeholder"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

export default async function LearnPage() {
  const topics = await getTopics()

  if (topics.length === 0) {
    return (
      <SectionPlaceholder
        title="Learn"
        description="One folder per topic: why you are learning it, an ordered curriculum, and every session you have had on it."
        note="No topics yet. Run the /teach skill in Claude Code with something you need to learn: it works out why the topic exists — the goal or the job requirement that demanded it — proposes a curriculum, and writes each session's summary into the topic itself."
      />
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Topics</CardTitle>
        <CardDescription>
          Written by the /teach skill under <code>vault/learn/</code>. Progress is
          the share of curriculum items ticked — never a number anyone typed —
          and ticking a skill-tagged item records evidence in your profile.
          Least finished first.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-1">
        {topics.map((topic) => (
          <div
            key={topic.slug}
            className="border-border flex flex-wrap items-start justify-between gap-3 border-b py-3 last:border-b-0"
          >
            <div className="flex min-w-48 flex-1 flex-col gap-1">
              <Link
                href={`/learn/${topic.slug}`}
                className="text-sm font-medium hover:underline"
              >
                {topic.title}
              </Link>
              {topic.why ? (
                <span className="text-muted-foreground text-xs">{topic.why}</span>
              ) : null}
              <span className="text-muted-foreground text-xs">
                {topic.sessions.length === 0
                  ? "No sessions yet"
                  : `${topic.sessions.length} session${topic.sessions.length === 1 ? "" : "s"} · last ${topic.sessions[0]}`}
                {topic.goal ? ` · goal: ${topic.goal}` : ""}
                {topic.job ? ` · job: ${topic.job}` : ""}
              </span>
            </div>
            <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
              {topic.percent}% · {topic.doneItems}/{topic.totalItems} items
            </span>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
