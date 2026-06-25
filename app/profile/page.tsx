import { ProfileEditor } from "@/components/profile/profile-editor"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { getProfile } from "@/lib/dashboard/profile"

export default async function ProfilePage() {
  const content = await getProfile()

  return (
    <Card>
      <CardHeader>
        <CardTitle>Profile</CardTitle>
        <CardDescription>
          Your <code>user.md</code> — auto-loaded into every Claude Code session
          via the vault’s <code>CLAUDE.md</code>. Edit it here, or run the{" "}
          <code>/profile</code> skill to refresh it from your goals, projects,
          and non-private notes (approve-gated; never your diary).
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ProfileEditor content={content} />
      </CardContent>
    </Card>
  )
}
