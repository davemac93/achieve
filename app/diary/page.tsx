import Link from "next/link"

import { DiaryEditor } from "@/components/diary/diary-editor"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { getDiaryEntry, listDiaryDates, todayKey } from "@/lib/dashboard/diary"
import { cn } from "@/lib/utils"

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function formatDate(key: string): string {
  const [y, m, d] = key.split("-").map(Number)
  return new Date(y!, m! - 1, d!).toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  })
}

export default async function DiaryPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>
}) {
  const { date } = await searchParams
  const today = todayKey()
  const active = date && DATE_RE.test(date) ? date : today

  const [content, dates] = await Promise.all([
    getDiaryEntry(active).then((c) => c ?? ""),
    listDiaryDates(),
  ])
  const earlier = dates.filter((d) => d !== today)

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_16rem]">
      <Card>
        <CardHeader>
          <CardTitle>{formatDate(active)}</CardTitle>
          <CardDescription>
            Your private journal — categorically off-limits to every AI agent
            and skill.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DiaryEditor date={active} content={content} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Entries</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="flex flex-col gap-1">
            <li>
              <Link
                href="/diary"
                className={cn(
                  "hover:bg-accent block rounded-md px-2 py-1 text-sm",
                  active === today && "bg-accent font-medium"
                )}
              >
                Today
              </Link>
            </li>
            {earlier.map((d) => (
              <li key={d}>
                <Link
                  href={`/diary?date=${d}`}
                  className={cn(
                    "hover:bg-accent block rounded-md px-2 py-1 text-sm tabular-nums",
                    active === d && "bg-accent font-medium"
                  )}
                >
                  {d}
                </Link>
              </li>
            ))}
            {earlier.length === 0 ? (
              <li className="text-muted-foreground px-2 py-1 text-sm">
                No earlier entries.
              </li>
            ) : null}
          </ul>
        </CardContent>
      </Card>
    </div>
  )
}
