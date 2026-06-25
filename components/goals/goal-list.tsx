"use client"

import * as React from "react"

import { setGoalStatusAction } from "@/app/actions"
import { horizonDepth } from "@/lib/dashboard/goal-tree"
import type { GoalStatus } from "@/lib/dashboard/types"
import { Button } from "@/components/ui/button"

/** A goal joined with its volatile status — the shape the dashboard renders. */
export interface GoalView {
  id: string
  horizon: string
  title: string
  orphan?: boolean
  state: GoalStatus["status"]
  progress?: number
}

const STATUS_LABEL: Record<GoalStatus["status"], string> = {
  "not-started": "Not started",
  "in-progress": "In progress",
  done: "Done",
}

/** Clicking the status chip cycles through the three states. */
const NEXT_STATUS: Record<GoalStatus["status"], GoalStatus["status"]> = {
  "not-started": "in-progress",
  "in-progress": "done",
  done: "not-started",
}

/**
 * Goal definitions are read-only here (the `/goals` skill owns `goals.yaml`).
 * The only thing the dashboard writes is volatile status, via the chip — which
 * routes through the server action into `goal-status.yaml`.
 */
export function GoalList({ goals }: { goals: GoalView[] }) {
  const [isPending, startTransition] = React.useTransition()

  return (
    <ul className="divide-border divide-y">
      {goals.map((goal) => (
        <li
          key={goal.id}
          className="flex items-center justify-between gap-4 py-2 first:pt-0 last:pb-0"
        >
          <div
            className="flex flex-col"
            style={{ paddingLeft: `${horizonDepth(goal.horizon) * 1}rem` }}
          >
            <span className="text-sm">{goal.title}</span>
            <span className="text-muted-foreground text-xs uppercase">
              {goal.horizon}
              {goal.orphan ? " · unlinked" : ""}
            </span>
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={isPending}
            aria-label={`Goal "${goal.title}" status: ${STATUS_LABEL[goal.state]}. Click to advance.`}
            onClick={() =>
              startTransition(() => setGoalStatusAction(goal.id, NEXT_STATUS[goal.state]))
            }
          >
            {STATUS_LABEL[goal.state]}
            {goal.progress != null ? ` · ${goal.progress}%` : ""}
          </Button>
        </li>
      ))}
    </ul>
  )
}
