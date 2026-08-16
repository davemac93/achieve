import { getApplications } from "@/lib/dashboard/jobs"
import { PipelineTable } from "@/components/jobs/pipeline-table"
import { SectionPlaceholder } from "@/components/section-placeholder"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

export default async function JobsPage() {
  const applications = await getApplications()

  if (applications.length === 0) {
    return (
      <SectionPlaceholder
        title="Jobs"
        description="Saved job descriptions, the gaps between them and your profile, and the CV you tailored for each."
        note="No applications yet. Run the /cv skill in Claude Code and paste a job description: it saves the description, writes a fit analysis citing your own evidence, and fills your CV template — using only facts already in your profile."
      />
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Pipeline</CardTitle>
        <CardDescription>
          One folder per application under <code>vault/jobs/</code>, written by
          the /cv skill. The stage and its date are the only thing the dashboard
          writes here — the gaps in each fit analysis are what /goals reads to
          propose goals worth having.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <PipelineTable applications={applications} />
      </CardContent>
    </Card>
  )
}
