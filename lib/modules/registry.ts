/**
 * Module registry — the single source of truth for what a module *is*.
 *
 * A module used to touch six independent places (sidebar, header titles, Guide
 * steps, vault seed files, the skills `npm run setup` installs, and the docs)
 * and they drifted apart. Here each module is declared once, and every one of
 * those places derives from this table intersected with the vault's enabled
 * list (`vault/config.yaml`, read by
 * [lib/dashboard/config.ts](../dashboard/config.ts)).
 *
 * Deliberately dependency-free plain data: this file is imported by the browser
 * bundle (sidebar, header), by `server-only` data modules, *and* by
 * `scripts/setup.mjs` running under plain node. Icons are therefore declared by
 * name and bound to components in [icons.ts](./icons.ts).
 *
 * Auto-discovery by folder convention was considered and rejected — implicit
 * magic that cannot express dependencies.
 */

export type ModuleId =
  | "home"
  | "profile"
  | "goals"
  | "tasks"
  | "quotes"
  | "diary"
  | "notes"
  | "projects"
  | "investments"
  | "jobs"
  | "learn"
  | "fitness"
  | "ideas"
  | "guide"

/** A checklist step on the Guide tab; the flag it ticks off lives in
 * [lib/dashboard/guide.ts](../dashboard/guide.ts), the prose in the Guide page. */
export type GuideStepKey =
  | "vaultReady"
  | "profileFilled"
  | "hasSkills"
  | "hasGoals"
  | "hasTasks"
  | "hasQuote"
  | "hasDiaryEntry"
  | "hasNotes"
  | "hasProjects"
  | "hasHoldings"
  | "hasStrategy"
  | "hasResearch"
  | "hasApplication"
  | "hasTopic"
  | "hasTrainingPlan"
  | "hasWorkout"

/** Names of the lucide icons modules may use — bound to components in
 * [icons.ts](./icons.ts), which the type keeps exhaustive in both directions. */
export type ModuleIconName =
  | "LayoutDashboard"
  | "NotebookPen"
  | "BookText"
  | "Target"
  | "FolderKanban"
  | "TrendingUp"
  | "Compass"
  | "UserRound"
  | "ListTodo"
  | "Quote"
  | "Lightbulb"
  | "Briefcase"
  | "GraduationCap"
  | "Dumbbell"

/**
 * How the `create-achieve` picker treats a module.
 *
 * - `core` — installed always, never offered as a toggle. Home owns `/` and
 *   Guide is how a fresh vault explains itself; a picker able to remove both
 *   would land the user on a 404 with nothing to read.
 * - `recommended` — pre-ticked. The spine everyone gets value from on day one.
 * - `optional` — starts unticked: useful, but only to someone who wants it.
 */
export type ModulePreset = "core" | "recommended" | "optional"

export interface ModuleDefinition {
  id: ModuleId
  /** Human label — sidebar entry and page title. */
  label: string
  /** One line for the install picker: what this module is for. */
  description: string
  icon: ModuleIconName
  /** Dashboard route it owns, or null for modules that render inside another
   * page (Tasks and Quotes are home cards) or have no UI yet (Ideas). */
  route: string | null
  /**
   * Position in the sidebar nav; null means no sidebar entry — either the
   * module has no route, or it is reached another way (Profile hangs off the
   * user menu). Separate from the array order below, which is the Guide's
   * onboarding sequence: what you set up first is not what you visit most.
   */
  sidebarOrder: number | null
  /** Vault paths the module owns (a trailing `/` marks a directory). */
  vaultPaths: string[]
  /** Skill directories under `template/.claude/skills/` it installs. */
  skills: string[]
  /** Template-relative paths `npm run setup` scaffolds for it. */
  seedFiles: string[]
  /** Guide steps it contributes, in the order they should be walked. */
  guideSteps: GuideStepKey[]
  /** Modules that must be enabled alongside it — enabled automatically. */
  dependsOn: ModuleId[]
  /** Whether the install picker forces, pre-ticks or merely offers it. */
  preset: ModulePreset
}

/**
 * Every module that ships today, in **onboarding order** (the Guide walks the
 * list top to bottom). `tests/modules.test.ts` asserts this table stays
 * complete in both directions: nothing ships undeclared, no stale entry
 * survives.
 */
export const MODULES: ModuleDefinition[] = [
  {
    id: "home",
    label: "Dashboard",
    description: "The daily view — to-dos, the quote of the day and your goal tree in one place.",
    icon: "LayoutDashboard",
    route: "/",
    sidebarOrder: 0,
    // The home page composes other modules' cards; it owns no store of its own.
    vaultPaths: [],
    skills: [],
    seedFiles: [],
    guideSteps: ["vaultReady"],
    dependsOn: [],
    preset: "core",
  },
  {
    id: "profile",
    label: "Profile",
    description:
      "Who you are: skills, experience, and the short summary Claude loads at the start of every session.",
    icon: "UserRound",
    route: "/profile",
    sidebarOrder: null,
    // `user.md` is the short auto-loaded summary; `profile/` is the context
    // database behind it (evidence.yaml inside it is dashboard-owned).
    vaultPaths: ["user.md", "profile/"],
    skills: ["profile"],
    seedFiles: ["user.md", "profile"],
    guideSteps: ["profileFilled", "hasSkills"],
    dependsOn: [],
    preset: "recommended",
  },
  {
    id: "goals",
    label: "Goals",
    description:
      "A direction → yearly → monthly → weekly tree whose progress is ticked step by step, never typed.",
    icon: "Target",
    route: "/goals",
    sidebarOrder: 3,
    vaultPaths: ["goals.yaml", "goal-status.yaml"],
    skills: ["goals"],
    seedFiles: ["goals.yaml", "goal-status.yaml"],
    guideSteps: ["hasGoals"],
    dependsOn: [],
    preset: "recommended",
  },
  {
    id: "tasks",
    label: "Tasks",
    description: "A to-do list on the home page, each item optionally tied to a weekly goal.",
    icon: "ListTodo",
    route: null, // the To-do card on the home page
    sidebarOrder: null,
    vaultPaths: ["tasks.yaml"],
    skills: [],
    seedFiles: ["tasks.yaml"],
    guideSteps: ["hasTasks"],
    dependsOn: [],
    preset: "recommended",
  },
  {
    id: "quotes",
    label: "Quotes",
    description: "A quote of the day, drawn from a pool you curate yourself — nothing generated.",
    icon: "Quote",
    route: null, // the quote-of-the-day card on the home page
    sidebarOrder: null,
    vaultPaths: ["quotes.yaml"],
    skills: [], // rotation and import are scripts (`npm run rotate`, `quotes:import`), not skills
    seedFiles: ["quotes.yaml"],
    guideSteps: ["hasQuote"],
    dependsOn: [],
    preset: "recommended",
  },
  {
    id: "diary",
    label: "Diary",
    description: "Dated entries only you can read — no agent or skill ever opens this folder.",
    icon: "BookText",
    route: "/diary",
    sidebarOrder: 2,
    vaultPaths: ["diary/"],
    skills: [], // none, ever — the privacy wall
    seedFiles: ["diary"],
    guideSteps: ["hasDiaryEntry"],
    dependsOn: [],
    preset: "recommended",
  },
  {
    id: "notes",
    label: "Notes",
    description: "Markdown notes, summarized, tagged and filed for you by the /note skill.",
    icon: "NotebookPen",
    route: "/notes",
    sidebarOrder: 1,
    vaultPaths: ["notes/"],
    // `/teach` moved to the Learn module: it writes topics now, not notes.
    skills: ["note"],
    seedFiles: ["notes"],
    guideSteps: ["hasNotes"],
    dependsOn: [],
    preset: "recommended",
  },
  {
    id: "projects",
    label: "Projects",
    description: "One markdown file per project, with its status surfaced on the dashboard.",
    icon: "FolderKanban",
    route: "/projects",
    sidebarOrder: 4,
    vaultPaths: ["projects/"],
    skills: [],
    seedFiles: ["projects"],
    guideSteps: ["hasProjects"],
    dependsOn: [],
    preset: "recommended",
  },
  {
    id: "investments",
    label: "Investments",
    description:
      "Holdings at cost basis, a living strategy document, and cited research — never buy/sell calls.",
    icon: "TrendingUp",
    route: "/investments",
    sidebarOrder: 5,
    vaultPaths: ["investments.yaml", "investments/"],
    skills: ["invest-strategy", "research-company"],
    seedFiles: ["investments.yaml"],
    guideSteps: ["hasHoldings", "hasStrategy", "hasResearch"],
    dependsOn: [],
    preset: "optional",
  },
  {
    id: "jobs",
    label: "Jobs",
    description:
      "One folder per application: the job description, a gap analysis, and a CV built only from your own evidence.",
    icon: "Briefcase",
    route: "/jobs",
    sidebarOrder: 6,
    // One folder per application (jd/fit/cv, /cv-owned) plus the pipeline index
    // and the user's CV template. `cv.pdf` is derived and gitignored.
    vaultPaths: ["jobs/"],
    skills: ["cv"],
    seedFiles: ["jobs"],
    guideSteps: ["hasApplication"],
    // The CV skill may use no facts but the ones in `profile/` and its evidence
    // log, so Jobs without Profile would be a CV with nothing honest to say.
    dependsOn: ["profile"],
    preset: "optional",
  },
  {
    id: "learn",
    label: "Learn",
    description:
      "One folder per topic: why you are learning it, an ordered curriculum, and every /teach session.",
    icon: "GraduationCap",
    route: "/learn",
    sidebarOrder: 7,
    // One folder per topic (plan.md + sessions/, /teach-owned) plus the ticked
    // curriculum items, which are the dashboard's.
    vaultPaths: ["learn/"],
    skills: ["teach"],
    seedFiles: ["learn"],
    guideSteps: ["hasTopic"],
    dependsOn: [],
    preset: "optional",
  },
  {
    id: "fitness",
    label: "Fitness",
    description:
      "An intake-driven training plan, logged sessions and measurements — no medical advice, no nutrition.",
    icon: "Dumbbell",
    route: "/fitness",
    sidebarOrder: 8,
    // The intake and the plan are the `/fitness` skill's; the two logged series
    // are the dashboard's. `fitness/photos/` is declared because the module owns
    // it, and for no other reason: it is gitignored and carries a permission
    // deny rule (`template/.claude/settings.json`), exactly like `diary/`, so no
    // code here — or anywhere else — may open it.
    vaultPaths: [
      "fitness/intake.yaml",
      "fitness/plan.md",
      "fitness/workouts.yaml",
      "fitness/measurements.yaml",
      "fitness/photos/",
    ],
    skills: ["fitness"],
    seedFiles: ["fitness"],
    guideSteps: ["hasTrainingPlan", "hasWorkout"],
    dependsOn: [],
    preset: "optional",
  },
  {
    id: "ideas",
    label: "Ideas",
    description:
      "Dated, cited write-ups from /validate-idea and /improve-process (no dashboard tab yet).",
    icon: "Lightbulb",
    route: null, // skill-only for now
    sidebarOrder: null,
    vaultPaths: ["ideas/"],
    skills: ["validate-idea", "improve-process"],
    seedFiles: ["ideas"],
    guideSteps: [],
    dependsOn: [],
    preset: "optional",
  },
  {
    id: "guide",
    label: "Guide",
    description: "An onboarding checklist that ticks itself as your vault fills up.",
    icon: "Compass",
    route: "/guide",
    sidebarOrder: 9,
    vaultPaths: [], // every checkmark is derived from other modules' stores
    skills: [],
    seedFiles: [],
    guideSteps: [],
    dependsOn: [],
    preset: "core",
  },
]

/**
 * Template files every vault gets regardless of the modules picked: the
 * session context Claude Code auto-loads, its permission rules (the diary deny
 * rule among them), the vault's own gitignore, and the Obsidian settings.
 */
export const BASE_SEED_FILES = [
  "CLAUDE.md",
  ".claude/settings.json",
  ".gitignore",
  ".obsidian",
]

/** The vault file listing the enabled module ids. Absent means "all enabled". */
export const CONFIG_FILE = "config.yaml"

const BY_ID = new Map(MODULES.map((m) => [m.id, m]))

export function isModuleId(value: unknown): value is ModuleId {
  return typeof value === "string" && BY_ID.has(value as ModuleId)
}

export function moduleById(id: ModuleId): ModuleDefinition {
  const found = BY_ID.get(id)
  if (!found) throw new Error(`Unknown module id: ${id}`)
  return found
}

/**
 * Resolve the enabled set from a vault's configured ids.
 *
 * - `null`/`undefined` (no `config.yaml`) means every module is enabled.
 * - Unknown ids are dropped, so a config naming a module this build doesn't
 *   have yet (or no longer has) degrades instead of breaking the dashboard.
 *   `npm run setup` is stricter — a typo there is worth failing on.
 * - `dependsOn` is closed over transitively: a module is never enabled without
 *   the modules it reads.
 *
 * Returns registry order, so callers get a stable, declaration-ordered list.
 */
export function resolveEnabledModules(
  ids: readonly string[] | null | undefined,
): ModuleId[] {
  if (ids == null) return MODULES.map((m) => m.id)

  const enabled = new Set<ModuleId>()
  const add = (id: ModuleId): void => {
    if (enabled.has(id)) return
    enabled.add(id)
    for (const dep of moduleById(id).dependsOn) add(dep)
  }
  for (const id of ids) if (isModuleId(id)) add(id)

  return MODULES.filter((m) => enabled.has(m.id)).map((m) => m.id)
}

/**
 * What the `create-achieve` picker offers as a toggle — everything but the
 * `core` modules, which it installs without asking.
 */
export function pickableModules(): ModuleDefinition[] {
  return MODULES.filter((m) => m.preset !== "core")
}

/** Modules installed whether or not the user picks them. */
export function coreModuleIds(): ModuleId[] {
  return MODULES.filter((m) => m.preset === "core").map((m) => m.id)
}

/** The picker's pre-ticked set: core plus the recommended spine, registry order. */
export function defaultModuleIds(): ModuleId[] {
  return MODULES.filter((m) => m.preset !== "optional").map((m) => m.id)
}

/** The enabled modules themselves, in registry order. */
export function enabledModules(ids: readonly ModuleId[]): ModuleDefinition[] {
  const enabled = new Set(ids)
  return MODULES.filter((m) => enabled.has(m.id))
}

/** A module that claims a sidebar slot, and so must have somewhere to go. */
export type NavModule = ModuleDefinition & { route: string; sidebarOrder: number }

/** Sidebar entries: enabled modules that claim a slot, in sidebar order. */
export function sidebarModules(ids: readonly ModuleId[]): NavModule[] {
  return enabledModules(ids)
    .filter((m): m is NavModule => m.sidebarOrder !== null && m.route !== null)
    .sort((a, b) => a.sidebarOrder - b.sidebarOrder)
}

/** Route → page title, for the site header. */
export function routeTitles(ids: readonly ModuleId[]): Record<string, string> {
  const titles: Record<string, string> = {}
  for (const m of enabledModules(ids)) if (m.route) titles[m.route] = m.label
  return titles
}

/** The Guide's checklist, in onboarding order. */
export function guideStepsFor(ids: readonly ModuleId[]): GuideStepKey[] {
  return enabledModules(ids).flatMap((m) => m.guideSteps)
}
