import {
  getIntake,
  getMeasurements,
  getTrainingPlan,
  getWorkouts,
} from "@/lib/dashboard/fitness"
import { computeAdherence, metricSeries } from "@/lib/dashboard/fitness-content"
import { AdherenceBars, MetricTrend } from "@/components/fitness/charts"
import { MeasurementLog } from "@/components/fitness/measurement-log"
import { WorkoutLog } from "@/components/fitness/workout-log"
import { SectionPlaceholder } from "@/components/section-placeholder"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

/** Weeks of history the adherence chart covers — two months reads as a habit
 * without turning one bad fortnight into a verdict. */
const ADHERENCE_WEEKS = 8

/** Today in the user's own timezone, as `YYYY-MM-DD` (dates here are local). */
function today(): string {
  const now = new Date()
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 10)
}

export default async function FitnessPage() {
  const [intake, plan, workouts, measurements] = await Promise.all([
    getIntake(),
    getTrainingPlan(),
    getWorkouts(),
    getMeasurements(),
  ])

  if (!plan && !intake && workouts.length === 0 && measurements.length === 0) {
    return (
      <SectionPlaceholder
        title="Fitness"
        description="A training plan cut for you — your history, your injuries, your equipment, the days you actually have — plus the sessions and measurements you log against it."
        note="Nothing here yet. Run the /fitness skill in Claude Code: it runs the intake interview first, stores the answers so it never asks twice, and writes a plan only after you approve it. It builds general training programs — anything about injuries, pain or medication belongs with a doctor or physiotherapist, and nutrition is out of scope."
      />
    )
  }

  // Adherence is measured against what the plan schedules; before there is a
  // plan, the intake's availability is the closest honest yardstick.
  const daysPerWeek = plan?.daysPerWeek || intake?.daysPerWeek || 0
  const adherence = computeAdherence(workouts, daysPerWeek, ADHERENCE_WEEKS, today())

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>{plan ? plan.title : "No training plan yet"}</CardTitle>
          <CardDescription>
            {plan ? (
              <>
                From <code>fitness/plan.md</code>, written by the /fitness skill
                after you approved it — {plan.daysPerWeek} sessions a week
                {plan.updated ? `, updated ${plan.updated}` : ""}. Revise it with{" "}
                <code>/fitness</code>; this tab never edits it.
              </>
            ) : (
              <>
                Run <code>/fitness</code> in Claude Code. It finishes the intake
                interview first, then proposes a plan — and writes nothing until
                you approve it.
              </>
            )}
          </CardDescription>
        </CardHeader>
        {plan?.body.trim() ? (
          <CardContent>
            <div className="text-sm leading-relaxed whitespace-pre-wrap">
              {plan.body.trim()}
            </div>
          </CardContent>
        ) : null}
      </Card>

      {intake ? (
        <Card>
          <CardHeader>
            <CardTitle>Intake</CardTitle>
            <CardDescription>
              Your answers in <code>fitness/intake.yaml</code>, asked once and
              reused every time the plan is revised
              {intake.updated ? ` (last confirmed ${intake.updated})` : ""}. Tell{" "}
              <code>/fitness</code> what changed to update them.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            <div className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-xs">
              <span>Level: {intake.level}</span>
              <span>{intake.daysPerWeek} days a week available</span>
              {intake.sessionMinutes ? <span>{intake.sessionMinutes} min a session</span> : null}
              {intake.timeOfDay ? <span>Trains {intake.timeOfDay}</span> : null}
              {intake.equipment.length > 0 ? (
                <span>Equipment: {intake.equipment.join(", ")}</span>
              ) : null}
            </div>
            {intake.limitations ? (
              <p>
                <span className="text-muted-foreground text-xs">
                  Limitations, in your words (the plan routes around these; only a
                  doctor or physiotherapist can clear them):
                </span>
                <br />
                {intake.limitations}
              </p>
            ) : null}
            {intake.wants ? <p>{intake.wants}</p> : null}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Adherence</CardTitle>
          <CardDescription>
            {daysPerWeek === 0 ? (
              <>
                No plan to measure against yet — adherence is the share of{" "}
                <em>planned</em> sessions you hit.
              </>
            ) : (
              <>
                {adherence.percent}% of the last {ADHERENCE_WEEKS} weeks&apos;{" "}
                {adherence.planned} planned sessions. A double week never buys
                back a missed one: each week counts at most what it planned, so
                the chart shows the cadence rather than a flattering average.
              </>
            )}
          </CardDescription>
        </CardHeader>
        {daysPerWeek > 0 ? (
          <CardContent>
            <AdherenceBars adherence={adherence} />
          </CardContent>
        ) : null}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Progress</CardTitle>
          <CardDescription>
            Charted from <code>fitness/measurements.yaml</code>. Progress photos,
            if you keep any, live in <code>vault/fitness/photos/</code> — which is
            gitignored and carries a permission deny rule, so no agent can open
            them and nothing about your body ends up in git history. Attach one in
            conversation when you want feedback on it.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6 md:grid-cols-2">
          <MetricTrend
            points={metricSeries(measurements, "weightKg")}
            label="Weight"
            unit="kg"
          />
          <MetricTrend
            points={metricSeries(measurements, "waistCm")}
            label="Waist"
            unit="cm"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Sessions</CardTitle>
          <CardDescription>
            What you actually did, in <code>fitness/workouts.yaml</code> — the
            dashboard&apos;s file. The skill never logs on your behalf; each entry
            here is one labeled commit.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <WorkoutLog
            workouts={workouts}
            sessions={plan?.sessions ?? []}
            today={today()}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Measurements</CardTitle>
          <CardDescription>
            Body metrics over time, in <code>fitness/measurements.yaml</code>.
            Weight and waist only — nutrition tracking is deliberately out of
            scope.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <MeasurementLog measurements={measurements} today={today()} />
        </CardContent>
      </Card>
    </>
  )
}
