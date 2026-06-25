import { getGoalsWithStatus } from "@/lib/dashboard/goals"
import { orderGoalTree } from "@/lib/dashboard/goal-tree"
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

  const ordered = orderGoalTree(goals)
  const view = ordered.map((g) => goals.find((x) => x.id === g.id)!)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Goals</CardTitle>
        <CardDescription>
          Decomposed with the /goals skill — definitions read-only; click a
          status to advance it.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <GoalList goals={view} />
      </CardContent>
    </Card>
  )
}
