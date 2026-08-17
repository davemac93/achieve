"use client"

import * as React from "react"
import Link from "next/link"
import { Lock } from "lucide-react"

import { setStepDoneAction } from "@/app/actions"
import { horizonDepth } from "@/lib/dashboard/goal-tree"
import { Checkbox } from "@/components/ui/checkbox"

/**
 * A goal joined with its derived progress — the shape the dashboard renders.
 * Mirrors `GoalWithProgress` in `lib/dashboard/goals.ts`, restated here so the
 * client bundle never imports a `server-only` module.
 */
export interface GoalView {
  id: string
  horizon: string
  title: string
  orphan?: boolean
  kind?: "learn" | "do"
  skill?: string
  /** A `kind: learn` step's `learn/<topic>/` curriculum, if it has one. */
  topic?: string
  done: boolean
  leaf: boolean
  percent: number | null
  doneSteps: number
  totalSteps: number
  blockedBy: string[]
}

/**
 * The goal tree, read-only except for one thing: the checkbox on a leaf step.
 *
 * The `/goals` skill owns `goals.yaml`, so nothing here edits a definition.
 * What the dashboard writes is a single bit per leaf step, through the server
 * action into `goal-status.yaml` — everything else on screen is derived:
 *
 * - **Directions** show no control and no percentage. A north star is not
 *   something you complete, so offering a way to complete it would be a lie.
 * - **Containers** show the share of leaf steps ticked beneath them. There is
 *   no field behind that number; the only way to move it is to finish a step.
 * - **Blocked steps** are not tickable, and say what they wait on. That is the
 *   whole point of `after`: an irreversible step stays shut until the steps
 *   that justify it are done.
 */
export function GoalList({ goals }: { goals: GoalView[] }) {
  const [isPending, startTransition] = React.useTransition()

  const titleOf = React.useMemo(
    () => new Map(goals.map((goal) => [goal.id, goal.title])),
    [goals],
  )

  return (
    <ul className="divide-border divide-y">
      {goals.map((goal) => {
        const blocked = goal.blockedBy.length > 0
        const waitingOn = goal.blockedBy.map((id) => titleOf.get(id) ?? id).join(", ")

        return (
          <li
            key={goal.id}
            className="flex items-start justify-between gap-4 py-2 first:pt-0 last:pb-0"
          >
            <div
              className="flex min-w-0 items-start gap-3"
              style={{ paddingLeft: `${horizonDepth(goal.horizon) * 1}rem` }}
            >
              {goal.leaf ? (
                <Checkbox
                  className="mt-0.5"
                  checked={goal.done}
                  disabled={isPending || (blocked && !goal.done)}
                  aria-label={
                    blocked && !goal.done
                      ? `"${goal.title}" is blocked by ${waitingOn}`
                      : `Mark "${goal.title}" ${goal.done ? "not done" : "done"}`
                  }
                  onCheckedChange={() =>
                    startTransition(() => setStepDoneAction(goal.id, !goal.done))
                  }
                />
              ) : (
                <span className="w-4 shrink-0" aria-hidden />
              )}
              <div className="flex min-w-0 flex-col">
                <span className={goal.done ? "text-muted-foreground text-sm line-through" : "text-sm"}>
                  {goal.title}
                </span>
                <span className="text-muted-foreground text-xs uppercase">
                  {goal.horizon}
                  {goal.kind ? ` · ${goal.kind}` : ""}
                  {goal.skill ? ` · ${goal.skill}` : ""}
                  {goal.orphan ? " · unlinked" : ""}
                </span>
                {/* A learn step says a capability is missing; the topic is the
                    curriculum that actually builds it. */}
                {goal.topic ? (
                  <Link
                    href={`/learn/${goal.topic}`}
                    className="text-muted-foreground mt-0.5 text-xs hover:underline"
                  >
                    Curriculum: {goal.topic} →
                  </Link>
                ) : null}
                {blocked && !goal.done ? (
                  <span className="text-muted-foreground mt-0.5 flex items-center gap-1 text-xs">
                    <Lock className="size-3" />
                    Blocked by {waitingOn}
                  </span>
                ) : null}
              </div>
            </div>

            {/* A direction carries no progress at all — see goal-progress.ts. */}
            {goal.percent === null || goal.leaf ? null : (
              <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                {goal.percent}% · {goal.doneSteps}/{goal.totalSteps} steps
              </span>
            )}
          </li>
        )
      })}
    </ul>
  )
}
