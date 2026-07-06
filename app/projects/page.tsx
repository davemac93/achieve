import { getProjects } from "@/lib/dashboard/projects"
import { ProjectList } from "@/components/projects/project-list"
import { SectionPlaceholder } from "@/components/section-placeholder"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

export default async function ProjectsPage() {
  const projects = await getProjects()

  if (projects.length === 0) {
    return (
      <SectionPlaceholder
        title="Projects"
        description="The projects you’re working on, from the vault’s projects/ directory."
        note="No projects yet. Add a markdown file under projects/ (with a status: working or private) and it shows up here."
      />
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Projects</CardTitle>
        <CardDescription>
          From projects/*.md — human-authored, read-only here. Click to read.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ProjectList projects={projects} />
      </CardContent>
    </Card>
  )
}
