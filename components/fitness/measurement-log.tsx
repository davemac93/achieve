"use client"

import * as React from "react"
import { Trash2 } from "lucide-react"

import { deleteMeasurementAction, logMeasurementAction } from "@/app/actions"
import type { Measurement } from "@/lib/dashboard/fitness-content"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

/** Body metrics over time. Same add-and-delete shape as the workout log: a
 * measurement is a dated reading, not a field to correct in place. */
export function MeasurementLog({
  measurements,
  today,
}: {
  measurements: Measurement[]
  today: string
}) {
  const [isPending, startTransition] = React.useTransition()
  const formRef = React.useRef<HTMLFormElement>(null)

  return (
    <div className="flex flex-col gap-4">
      <form
        ref={formRef}
        action={(formData) => {
          startTransition(async () => {
            await logMeasurementAction(formData)
            formRef.current?.reset()
          })
        }}
        className="grid grid-cols-2 gap-2 md:grid-cols-4"
      >
        <Input name="date" type="date" aria-label="Date" defaultValue={today} />
        <Input
          name="weightKg"
          type="number"
          step="0.1"
          min="0"
          placeholder="Weight (kg)"
          aria-label="Weight in kilograms"
        />
        <Input
          name="waistCm"
          type="number"
          step="0.1"
          min="0"
          placeholder="Waist (cm)"
          aria-label="Waist in centimetres"
        />
        <Button type="submit" disabled={isPending}>
          Log
        </Button>
      </form>

      {measurements.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No measurements yet.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted-foreground border-b text-left">
                <th className="px-2 py-2 font-medium">Date</th>
                <th className="px-2 py-2 text-right font-medium">Weight (kg)</th>
                <th className="px-2 py-2 text-right font-medium">Waist (cm)</th>
                <th className="px-2 py-2" aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {measurements.map((measurement) => (
                <tr key={measurement.id} className="group hover:bg-accent/50 border-b">
                  <td className="px-2 py-2 tabular-nums">
                    {measurement.date}
                    {measurement.notes ? (
                      <span className="text-muted-foreground block text-xs">
                        {measurement.notes}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">
                    {measurement.weightKg ?? "—"}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">
                    {measurement.waistCm ?? "—"}
                  </td>
                  <td className="px-2 py-2">
                    <div className="flex justify-end opacity-0 group-hover:opacity-100">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7"
                        aria-label={`Delete measurement from ${measurement.date}`}
                        onClick={() =>
                          startTransition(() => deleteMeasurementAction(measurement.id))
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
