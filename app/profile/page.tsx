import { SectionPlaceholder } from "@/components/section-placeholder"

export default function ProfilePage() {
  return (
    <SectionPlaceholder
      title="Profile"
      description="Who you are — the context every Claude Code session auto-loads."
      note="Your profile lives in the vault’s user.md and is auto-loaded via CLAUDE.md. The in-dashboard editor lands in a later v1 issue; for now edit user.md directly or use the /profile skill."
    />
  )
}
