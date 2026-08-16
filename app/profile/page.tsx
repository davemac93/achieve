import { ProfileEditor } from "@/components/profile/profile-editor"
import { EvidenceList } from "@/components/profile/evidence-list"
import { ExperienceList } from "@/components/profile/experience-list"
import { SkillsList } from "@/components/profile/skills-list"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { getRecentEvidence } from "@/lib/dashboard/evidence"
import { getExperience, getProfile, getSkills } from "@/lib/dashboard/profile"

/** Same empty-state shape as the cards above, without pulling in a component. */
function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-muted-foreground text-sm">{children}</p>
}

export default async function ProfilePage() {
  const [content, skills, experience, evidence] = await Promise.all([
    getProfile(),
    getSkills(),
    getExperience(),
    getRecentEvidence(),
  ])

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Skills</CardTitle>
          <CardDescription>
            From <code>profile/skills.yaml</code>, written by the{" "}
            <code>/profile</code> skill. Levels are promoted only from the
            evidence log below, and only with your approval — the dashboard
            never writes this file.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {skills.length > 0 ? (
            <SkillsList skills={skills} />
          ) : (
            <Empty>
              No skills yet. Run <code>/profile</code> in Claude Code — it can
              also migrate what your <code>user.md</code> already says, shown as
              a preview first.
            </Empty>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Experience</CardTitle>
          <CardDescription>
            One file per role under <code>profile/experience/</code> — the
            narrative achievements a CV draws on. Read-only here.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {experience.length > 0 ? (
            <ExperienceList roles={experience} />
          ) : (
            <Empty>
              No roles yet. <code>/profile</code> writes them from what you tell
              it, after you approve.
            </Empty>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent evidence</CardTitle>
          <CardDescription>
            <code>profile/evidence.yaml</code> — append-only, written by the
            dashboard when you tick a step tagged with a skill. Every level
            claimed above has a dated trail here.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {evidence.length > 0 ? (
            <EvidenceList evidence={evidence} />
          ) : (
            <Empty>
              No evidence yet. Tick a skill-tagged step and it lands here.
            </Empty>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Summary (user.md)</CardTitle>
          <CardDescription>
            The short summary auto-loaded into every Claude Code session via the
            vault’s <code>CLAUDE.md</code> — deliberately brief, since the full
            database above is read only when a skill needs it. Edit it here, or
            run <code>/profile</code> to regenerate it (approve-gated; never
            your diary).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ProfileEditor content={content} />
        </CardContent>
      </Card>
    </>
  )
}
