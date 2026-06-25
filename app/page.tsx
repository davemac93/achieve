import { Quote as QuoteIcon } from "lucide-react"

import { getTasks } from "@/lib/dashboard/tasks"
import { getCurrentQuote } from "@/lib/dashboard/quotes"
import { getGoalsWithStatus } from "@/lib/dashboard/goals"
import { getProjects } from "@/lib/dashboard/projects"
import { getNotes } from "@/lib/dashboard/notes"
import { AddQuote } from "@/components/dashboard/add-quote"
import { TodoList } from "@/components/dashboard/todo-list"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

const STATUS_LABEL: Record<string, string> = {
  "not-started": "Not started",
  "in-progress": "In progress",
  done: "Done",
}

export default async function DashboardPage() {
  const [tasks, quote, goals, projects, notes] = await Promise.all([
    getTasks(),
    getCurrentQuote(),
    getGoalsWithStatus(),
    getProjects(),
    getNotes(),
  ])

  const openCount = tasks.filter((t) => !t.done).length

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>To-do</CardTitle>
          <CardDescription>
            {openCount === 0
              ? "Nothing open — nice."
              : `${openCount} task${openCount === 1 ? "" : "s"} open`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TodoList tasks={tasks} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <QuoteIcon className="text-muted-foreground size-4" />
            Quote of the day
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {quote ? (
            <blockquote className="space-y-2">
              <p className="text-sm leading-relaxed italic">“{quote.text}”</p>
              {quote.author ? (
                <footer className="text-muted-foreground text-xs">
                  — {quote.author}
                </footer>
              ) : null}
            </blockquote>
          ) : (
            <p className="text-muted-foreground text-sm">
              No quotes yet. Add one to start your rotation.
            </p>
          )}
          <AddQuote />
        </CardContent>
      </Card>

      <Card className="lg:col-span-3">
        <CardHeader>
          <CardTitle>Goals</CardTitle>
          <CardDescription>
            Set and decomposed with the <code>/goals</code> skill — shown here
            read-only.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {goals.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No goals yet. Run the <code>/goals</code> skill in Claude Code to
              decompose a vision into 3-year → yearly → monthly → weekly goals.
            </p>
          ) : (
            <ul className="divide-border divide-y">
              {goals.map((goal) => (
                <li
                  key={goal.id}
                  className="flex items-center justify-between gap-4 py-2 first:pt-0 last:pb-0"
                >
                  <div className="flex flex-col">
                    <span className="text-sm">{goal.title}</span>
                    <span className="text-muted-foreground text-xs uppercase">
                      {goal.horizon}
                      {goal.orphan ? " · unlinked" : ""}
                    </span>
                  </div>
                  <span className="text-muted-foreground text-xs">
                    {STATUS_LABEL[goal.state] ?? goal.state}
                    {goal.progress != null ? ` · ${goal.progress}%` : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:col-span-3 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Projects</CardTitle>
            <CardDescription>
              From the vault’s <code>projects/</code> directory.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {projects.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                No projects yet. Add a markdown file under{" "}
                <code>projects/</code> to see it here.
              </p>
            ) : (
              <ul className="divide-border divide-y">
                {projects.map((project) => (
                  <li
                    key={project.slug}
                    className="flex items-center justify-between gap-4 py-2 first:pt-0 last:pb-0"
                  >
                    <span className="text-sm">{project.title}</span>
                    {project.status ? (
                      <span className="text-muted-foreground text-xs uppercase">
                        {project.status}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Notes</CardTitle>
            <CardDescription>
              From the vault’s <code>notes/</code> directory.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {notes.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                No notes yet. The <code>/note</code> skill writes these into{" "}
                <code>notes/</code>.
              </p>
            ) : (
              <ul className="divide-border divide-y">
                {notes.map((note) => (
                  <li
                    key={note.slug}
                    className="flex items-center justify-between gap-4 py-2 first:pt-0 last:pb-0"
                  >
                    <span className="text-sm">{note.title}</span>
                    {note.type ? (
                      <span className="text-muted-foreground text-xs uppercase">
                        {note.type}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
