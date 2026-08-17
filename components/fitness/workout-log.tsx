"use client"

import * as React from "react"
import { Trash2 } from "lucide-react"

import { deleteWorkoutAction, logWorkoutAction } from "@/app/actions"
import type { PlanSession, Workout } from "@/lib/dashboard/fitness-content"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

/**
 * Log a session, and the log itself. Rows are only added and removed — a
 * workout is a dated fact, so editing one in place would quietly rewrite what
 * happened; a mislog is deleted and logged again.
 *
 * `today` comes from the server so the default date matches the vault's day and
 * never differs between render and hydration.
 */
export function WorkoutLog({
  workouts,
  sessions,
  today,
}: {
  workouts: Workout[]
  sessions: PlanSession[]
  today: string
}) {
  const [isPending, startTransition] = React.useTransition()
  const formRef = React.useRef<HTMLFormElement>(null)

  const selectClass =
    "border-input bg-transparent text-foreground h-9 rounded-md border px-3 py-1 text-sm shadow-xs"
  const titles = new Map(sessions.map((s) => [s.id, s.title]))

  return (
    <div className="flex flex-col gap-4">
      <form
        ref={formRef}
        action={(formData) => {
          startTransition(async () => {
            await logWorkoutAction(formData)
            formRef.current?.reset()
          })
        }}
        className="grid grid-cols-2 gap-2 md:grid-cols-4 lg:grid-cols-6"
      >
        <Input name="date" type="date" aria-label="Date" defaultValue={today} />
        <Input
          name="title"
          placeholder="What you did"
          aria-label="What you did"
          autoComplete="off"
          className="col-span-2"
        />
        {sessions.length > 0 ? (
          <select name="session" aria-label="Plan session" defaultValue="" className={selectClass}>
            <option value="">Not a plan session</option>
            {sessions.map((session) => (
              <option key={session.id} value={session.id}>
                {session.title}
              </option>
            ))}
          </select>
        ) : null}
        <Input
          name="durationMin"
          type="number"
          min="1"
          step="1"
          placeholder="Minutes"
          aria-label="Duration in minutes"
        />
        <div className="flex gap-2">
          <Input
            name="rpe"
            type="number"
            min="1"
            max="10"
            step="1"
            placeholder="RPE"
            aria-label="Rate of perceived exertion, 1 to 10"
            className="w-20"
          />
          <Button type="submit" disabled={isPending} className="flex-1">
            Log
          </Button>
        </div>
      </form>

      {workouts.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No sessions logged yet. Log the first one above — adherence needs
          something to count.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted-foreground border-b text-left">
                <th className="px-2 py-2 font-medium">Date</th>
                <th className="px-2 py-2 font-medium">Session</th>
                <th className="px-2 py-2 font-medium">Plan</th>
                <th className="px-2 py-2 text-right font-medium">Minutes</th>
                <th className="px-2 py-2 text-right font-medium">RPE</th>
                <th className="px-2 py-2" aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {workouts.map((workout) => (
                <tr key={workout.id} className="group hover:bg-accent/50 border-b">
                  <td className="px-2 py-2 tabular-nums">{workout.date}</td>
                  <td className="px-2 py-2">
                    {workout.title}
                    {workout.notes ? (
                      <span className="text-muted-foreground block text-xs">
                        {workout.notes}
                      </span>
                    ) : null}
                  </td>
                  <td className="text-muted-foreground px-2 py-2 text-xs">
                    {workout.session
                      ? (titles.get(workout.session) ?? workout.session)
                      : "—"}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">
                    {workout.durationMin ?? "—"}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">
                    {workout.rpe ?? "—"}
                  </td>
                  <td className="px-2 py-2">
                    <div className="flex justify-end opacity-0 group-hover:opacity-100">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7"
                        aria-label={`Delete ${workout.title} on ${workout.date}`}
                        onClick={() =>
                          startTransition(() => deleteWorkoutAction(workout.id))
                        }
                      >
                        <Trash2 className="text-muted-foreground size-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
