"use client"

import * as React from "react"
import { Trash2 } from "lucide-react"

import { addTaskAction, deleteTaskAction, toggleTaskAction } from "@/app/actions"
import type { Task } from "@/lib/dashboard/types"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"

/** Just enough of a weekly goal to link a task to it. */
export interface WeeklyGoalOption {
  id: string
  title: string
}

export function TodoList({
  tasks,
  weeklyGoals = [],
}: {
  tasks: Task[]
  weeklyGoals?: WeeklyGoalOption[]
}) {
  const [isPending, startTransition] = React.useTransition()
  const formRef = React.useRef<HTMLFormElement>(null)

  const goalTitle = React.useMemo(
    () => new Map(weeklyGoals.map((g) => [g.id, g.title])),
    [weeklyGoals],
  )

  return (
    <div className="flex flex-col gap-4">
      <form
        ref={formRef}
        action={(formData) => {
          startTransition(async () => {
            await addTaskAction(formData)
            formRef.current?.reset()
          })
        }}
        className="flex flex-wrap gap-2"
      >
        <Input
          name="title"
          placeholder="Add a task…"
          autoComplete="off"
          aria-label="Task title"
          className="flex-1"
        />
        {weeklyGoals.length > 0 ? (
          <select
            name="goal"
            aria-label="Link to a weekly goal"
            defaultValue=""
            className="border-input bg-transparent text-foreground h-9 rounded-md border px-3 py-1 text-sm shadow-xs"
          >
            <option value="">No goal</option>
            {weeklyGoals.map((g) => (
              <option key={g.id} value={g.id}>
                {g.title}
              </option>
            ))}
          </select>
        ) : null}
        <Button type="submit" disabled={isPending}>
          Add
        </Button>
      </form>

      {tasks.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No tasks yet. Add one above to get started.
        </p>
      ) : (
        <ul className="flex flex-col gap-1">
          {tasks.map((task) => (
            <li
              key={task.id}
              className="group hover:bg-accent/50 flex items-center gap-3 rounded-md px-2 py-1.5"
            >
              <Checkbox
                checked={task.done}
                aria-label={`Mark "${task.title}" ${task.done ? "not done" : "done"}`}
                onCheckedChange={() =>
                  startTransition(() => toggleTaskAction(task.id))
                }
              />
              <span
                className={
                  task.done
                    ? "text-muted-foreground flex-1 text-sm line-through"
                    : "flex-1 text-sm"
                }
              >
                {task.title}
              </span>
              {task.goal ? (
                <span className="text-muted-foreground rounded bg-accent px-1.5 py-0.5 text-xs">
                  {goalTitle.get(task.goal) ?? task.goal}
                </span>
              ) : null}
              <Button
                variant="ghost"
                size="icon"
                className="size-7 opacity-0 group-hover:opacity-100"
                aria-label={`Delete "${task.title}"`}
                onClick={() =>
                  startTransition(() => deleteTaskAction(task.id))
                }
              >
                <Trash2 className="text-muted-foreground size-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
