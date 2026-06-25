"use client"

import * as React from "react"
import { Trash2 } from "lucide-react"

import { addTaskAction, deleteTaskAction, toggleTaskAction } from "@/app/actions"
import type { Task } from "@/lib/dashboard/types"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"

export function TodoList({ tasks }: { tasks: Task[] }) {
  const [isPending, startTransition] = React.useTransition()
  const formRef = React.useRef<HTMLFormElement>(null)

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
        className="flex gap-2"
      >
        <Input
          name="title"
          placeholder="Add a task…"
          autoComplete="off"
          aria-label="Task title"
        />
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
