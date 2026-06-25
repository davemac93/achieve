import "server-only"

import { openVault } from "@/lib/vault"
import { getGoals } from "@/lib/dashboard/goals"
import { getProjects } from "@/lib/dashboard/projects"
import { getPublicNotes } from "@/lib/dashboard/notes"
import type { Goal, Note, Project } from "@/lib/dashboard/types"

const REL = "user.md"

/** Read `user.md`. Returns an empty string if it does not exist yet. */
export async function getProfile(): Promise<string> {
  const vault = openVault()
  if (!(await vault.exists(REL))) return ""
  return vault.read(REL)
}

/**
 * Save `user.md`. The dashboard editor (human) and the `/profile` skill (after
 * approval) are the two sanctioned writers; this is the human path.
 */
export async function saveProfile(content: string): Promise<void> {
  const body = content.replace(/\r\n/g, "\n").trimEnd()
  if (!body) throw new Error("Profile must not be empty.")
  const vault = openVault()
  await vault.write(REL, `${body}\n`, { message: "dashboard: edit profile" })
}

/**
 * The complete set of vault material the `/profile` skill is allowed to draw on
 * when refreshing `user.md`: goals, projects, and non-private notes.
 *
 * It deliberately excludes the two protected sources — diary entries and
 * private notes are never gathered here, so they can never reach the profile.
 * The privacy test asserts exactly that.
 */
export interface ProfileSources {
  goals: Goal[]
  projects: Project[]
  notes: Note[]
}

export async function getProfileSources(): Promise<ProfileSources> {
  const [goals, projects, notes] = await Promise.all([
    getGoals(),
    getProjects(),
    getPublicNotes(),
  ])
  return { goals, projects, notes }
}
