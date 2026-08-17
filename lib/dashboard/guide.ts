import "server-only"

import { openVault } from "@/lib/vault"
import { getGoals } from "@/lib/dashboard/goals"
import { getTasks } from "@/lib/dashboard/tasks"
import { getCurrentQuote } from "@/lib/dashboard/quotes"
import { listDiaryDates } from "@/lib/dashboard/diary"
import { getNotes } from "@/lib/dashboard/notes"
import { getProjects } from "@/lib/dashboard/projects"
import { getHoldings } from "@/lib/dashboard/investments"
import { getProfile, getSkills } from "@/lib/dashboard/profile"
import { getApplications } from "@/lib/dashboard/jobs"
import { getTopics } from "@/lib/dashboard/learn"
import type { GuideStepKey } from "@/lib/modules/registry"

/**
 * Read-only progress flags for the Guide tab's onboarding checklist. Each flag
 * is derived from what actually exists in the vault — the guide never writes
 * anything, so completing a step anywhere (dashboard or a skill) ticks it here.
 *
 * The keys are the registry's step keys, so a module declaring a step with no
 * flag behind it fails to compile. Every flag is computed whatever the enabled
 * set is; the Guide page renders only the enabled modules' steps.
 */
export type GuideProgress = Record<GuideStepKey, boolean>

/** The template ships user.md with italic placeholders; any of them still
 * present means the profile hasn't been made the user's own yet. */
const PROFILE_PLACEHOLDER = "_A few lines"

export async function getGuideProgress(): Promise<GuideProgress> {
  const vault = openVault()

  const [
    profile,
    skills,
    goals,
    tasks,
    quote,
    diaryDates,
    notes,
    projects,
    holdings,
    hasStrategy,
    research,
    applications,
    topics,
  ] = await Promise.all([
    getProfile(),
    getSkills(),
    getGoals(),
    getTasks(),
    getCurrentQuote(),
    listDiaryDates(),
    getNotes(),
    getProjects(),
    getHoldings(),
    vault.exists("investments/strategy.md"),
    vault.list("investments/research"),
    getApplications(),
    getTopics(),
  ])

  return {
    vaultReady: profile.trim() !== "",
    profileFilled:
      profile.trim() !== "" && !profile.includes(PROFILE_PLACEHOLDER),
    hasSkills: skills.length > 0,
    hasGoals: goals.length > 0,
    hasTasks: tasks.length > 0,
    hasQuote: quote !== null,
    hasDiaryEntry: diaryDates.length > 0,
    hasNotes: notes.length > 0,
    hasProjects: projects.length > 0,
    hasHoldings: holdings.length > 0,
    hasStrategy,
    hasResearch: research.length > 0,
    hasApplication: applications.length > 0,
    hasTopic: topics.length > 0,
  }
}
