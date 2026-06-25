import { getGoalsWithStatus } from "@/lib/dashboard/goals"
import { SectionPlaceholder } from "@/components/section-placeholder"
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

export default async function GoalsPage() {
  const goals = await getGoalsWithStatus()

  if (goals.length === 0) {
    return (
      <SectionPlaceholder
        title="Goals"
        description="Your 3-year → yearly → monthly → weekly goal tree."
        note="No goals yet. Run the /goals skill in Claude Code to decompose a vision into a goal tree; it renders here read-only."
      />
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Goals</CardTitle>
        <CardDescription>
          Set with the /goals skill — shown here read-only.
        </CardDescription>
      </CardHeader>
      <CardContent>
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
      </CardContent>
    </Card>
  )
}
