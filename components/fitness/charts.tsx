import type { Adherence, SeriesPoint } from "@/lib/dashboard/fitness-content"

/**
 * The Fitness tab's two charts, drawn with plain CSS and inline SVG.
 *
 * No charting dependency: the whole project ships with none, and two shapes —
 * a bar per week and a line through a handful of points — do not justify one
 * (the same reasoning that kept Puppeteer out of the CV renderer). Both are
 * server components; there is nothing interactive to hydrate.
 */

/** Sessions done against sessions planned, one bar per week, oldest first. */
export function AdherenceBars({ adherence }: { adherence: Adherence }) {
  // Scale to the busiest week, never below the plan, so a 100% week fills the
  // column and an over-plan week visibly overshoots it.
  const ceiling = Math.max(
    adherence.weeks[0]?.planned ?? 1,
    ...adherence.weeks.map((w) => w.done),
    1,
  )

  return (
    <div className="flex items-end gap-1.5" role="img" aria-label="Weekly adherence">
      {adherence.weeks.map((week) => {
        const height = Math.round((week.done / ceiling) * 100)
        const met = week.done >= week.planned
        return (
          <div key={week.weekStart} className="flex flex-1 flex-col items-center gap-1">
            <span className="text-muted-foreground text-[10px] tabular-nums">
              {week.done}
            </span>
            <div className="bg-accent relative flex h-24 w-full items-end rounded-sm">
              {/* The plan's line, so a short week reads as short at a glance. */}
              <div
                className="border-muted-foreground/40 absolute inset-x-0 border-t border-dashed"
                style={{ bottom: `${Math.round((week.planned / ceiling) * 100)}%` }}
                aria-hidden
              />
              <div
                className={`w-full rounded-sm ${
                  met ? "bg-emerald-600 dark:bg-emerald-500" : "bg-muted-foreground/50"
                }`}
                style={{ height: `${height}%` }}
                title={`${week.weekStart}: ${week.done}/${week.planned} sessions`}
              />
            </div>
            <span className="text-muted-foreground text-[10px] tabular-nums">
              {week.weekStart.slice(5)}
            </span>
          </div>
        )
      })}
    </div>
  )
}

/** A metric over time as a sparkline. Nothing is drawn for fewer than 2 points. */
export function MetricTrend({
  points,
  label,
  unit,
}: {
  points: SeriesPoint[]
  label: string
  unit: string
}) {
  if (points.length < 2) {
    return (
      <p className="text-muted-foreground text-sm">
        {points.length === 0
          ? `No ${label.toLowerCase()} logged yet.`
          : `One ${label.toLowerCase()} reading — a second one makes a trend.`}
      </p>
    )
  }

  const values = points.map((p) => p.value)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const width = 100
  const height = 32

  const coords = points.map((point, i) => {
    const x = (i / (points.length - 1)) * width
    const y = height - ((point.value - min) / span) * height
    return `${x.toFixed(2)},${y.toFixed(2)}`
  })

  const first = points[0]!
  const last = points[points.length - 1]!
  const delta = last.value - first.value

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between text-sm">
        <span className="font-medium tabular-nums">
          {last.value} {unit}
        </span>
        <span className="text-muted-foreground text-xs tabular-nums">
          {delta === 0 ? "no change" : `${delta > 0 ? "+" : ""}${delta.toFixed(1)} ${unit}`} since{" "}
          {first.date}
        </span>
      </div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        className="h-16 w-full"
        role="img"
        aria-label={`${label} from ${first.value} ${unit} on ${first.date} to ${last.value} ${unit} on ${last.date}`}
      >
        <polyline
          points={coords.join(" ")}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          vectorEffect="non-scaling-stroke"
          className="text-foreground/70"
        />
      </svg>
      <p className="text-muted-foreground text-xs tabular-nums">
        {min} – {max} {unit} over {points.length} readings
      </p>
    </div>
  )
}
