"use client"

import * as React from "react"
import { Lock } from "lucide-react"

import { setCurriculumItemDoneAction } from "@/app/actions"
import { Checkbox } from "@/components/ui/checkbox"

/**
 * A curriculum item joined with its ticked and blocked state. Mirrors
 * `CurriculumItemView` in `lib/dashboard/learn-content.ts`, restated here so the
 * client bundle never imports a `server-only` module.
 */
export interface CurriculumItemProps {
  id: string
  title: string
  kind?: "learn" | "do"
  skill?: string
  done: boolean
  blockedBy: string[]
}

/**
 * A topic's curriculum — the same control as a goal step, because it is the
 * same thing: `plan.md` is the `/teach` skill's, and the one bit the dashboard
 * writes is whether an item is done.
 *
 * Items arrive ordered so prerequisites lead, and a **blocked** item is not
 * tickable: ticking "write an operator" before "what is a pod" would be a claim
 * about learning that did not happen. Ticking a `skill:`-tagged item appends to
 * the evidence log, which is how a curriculum promotes a skill honestly.
 */
export function CurriculumList({
  topic,
  items,
}: {
  topic: string
  items: CurriculumItemProps[]
}) {
  const [isPending, startTransition] = React.useTransition()

  const titleOf = React.useMemo(
    () => new Map(items.map((item) => [item.id, item.title])),
    [items],
  )

  return (
    <ol className="divide-border divide-y">
      {items.map((item) => {
        const blocked = item.blockedBy.length > 0
        const waitingOn = item.blockedBy.map((id) => titleOf.get(id) ?? id).join(", ")

        return (
          <li key={item.id} className="flex items-start gap-3 py-2 first:pt-0 last:pb-0">
            <Checkbox
              className="mt-0.5"
              checked={item.done}
              disabled={isPending || (blocked && !item.done)}
              aria-label={
                blocked && !item.done
                  ? `"${item.title}" is blocked by ${waitingOn}`
                  : `Mark "${item.title}" ${item.done ? "not done" : "done"}`
              }
              onCheckedChange={() =>
                startTransition(() =>
                  setCurriculumItemDoneAction(topic, item.id, !item.done),
                )
              }
            />
            <div className="flex min-w-0 flex-col">
              <span
                className={
                  item.done ? "text-muted-foreground text-sm line-through" : "text-sm"
                }
              >
                {item.title}
              </span>
              {item.kind || item.skill ? (
                <span className="text-muted-foreground text-xs uppercase">
                  {[item.kind, item.skill].filter(Boolean).join(" · ")}
                </span>
              ) : null}
              {blocked && !item.done ? (
                <span className="text-muted-foreground mt-0.5 flex items-center gap-1 text-xs">
                  <Lock className="size-3" />
                  Blocked by {waitingOn}
                </span>
              ) : null}
            </div>
          </li>
        )
      })}
    </ol>
  )
}
