import { getGoalTreeView } from "@/lib/dashboard/goals"
import { GoalList } from "@/components/goals/goal-list"
import { SectionPlaceholder } from "@/components/section-placeholder"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

export default async function GoalsPage() {
  const goals = await getGoalTreeView()

  if (goals.length === 0) {
    return (
      <SectionPlaceholder
        title="Goals"
        description="A direction to aim at, and goals of twelve months or less beneath it."
        note="No goals yet. Run the /goals skill in Claude Code: it finds candidates in your own data, checks them for feasibility, and breaks the one you pick into ordered steps."
      />
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Goals</CardTitle>
        <CardDescription>
          Decomposed with the /goals skill — definitions read-only; tick a step
          to move the progress it rolls up into.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <GoalList goals={goals} />
      </CardContent>
    </Card>
  )
}
