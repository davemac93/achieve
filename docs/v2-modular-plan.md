# achieve v2 — modular personal OS: implementation plan

**Date:** 2026-07-15
**Stage:** Design fully grilled and locked in a `/grill-me` session. No open
design questions block implementation. This document is the handoff — the next
agent implements from it.
**Prior art:** `docs/personal-os-prd*.md` describe v1 (shipped). This plan
describes the changes *on top of* the current `main`.

---

## What v2 changes, in one paragraph

v1 is a fixed set of features. v2 turns achieve into a **modular** personal OS
installed with `npx create-achieve`: the user picks the modules they want, and
each module is a small store of context that lets the AI build a whole picture
of the user. Goals are redesigned around a hard 12-month ceiling with AI-led
feasibility checking and derived progress; a new Profile database, plus three
new modules (**Learn**, **Fitness**, **Jobs**), feed each other in a loop:
saved job descriptions expose skill gaps → gaps become learning goals → ticked
steps become evidence → evidence promotes profile skills → the next CV is
stronger.

---

## Locked decisions (do not reopen)

Each was resolved in the grill session; the rationale is included so the
implementer understands the constraint, not just the instruction.

### Foundation

1. **Install path: `npx create-achieve`.** The CLI asks which modules to
   enable and writes them to `vault/config.yaml`. Modules stay toggleable
   afterwards. *Not* a code generator — the app is a normal repo that upgrades
   with `git pull`, so a generated-codebase drift problem never appears.
2. **Module registry in code** (`lib/modules/registry.ts`) is the single
   source of truth. Each module declares: `id`, `label`, `icon`, `route`,
   `vaultPaths` (what it owns), `skills` (which skills it installs),
   `seedFiles`, `guideSteps`, `dependsOn`. Sidebar, header titles, Guide,
   `npm run setup`, skill scaffolding and the CLI picker all read the
   registry. A test asserts completeness in both directions (no undeclared
   module ships; no stale registry entry survives) — the same pattern that
   already guards the skill-tiering table in `tests/skill-hardening.test.ts`.
   Auto-discovery by folder convention was rejected as implicit magic.
3. **Storage format follows data nature** (the convention Investments already
   proves): **YAML** for tabular records the dashboard renders as tables and
   charts; **markdown + YAML frontmatter** for narrative content (and for
   future embedding — markdown chunks embed cleanly, YAML does not).

### Removals

4. **Reviews module is deleted**: `/review` skill, `reviews/`,
   `lib/dashboard/reviews.ts`, `lib/dashboard/review-schedule.ts`,
   `scripts/review-due.ts`, the "review is due" banner on the home page, its
   Guide step, and the `review-due` npm script.
5. **Search module is deleted outright**: `lib/search/`,
   `scripts/build-search-index.ts`, `scripts/search-vault.ts`, the
   `/search-vault` skill, the `index`/`search` npm scripts, and the three
   heavy dependencies (`better-sqlite3`, `sqlite-vec`,
   `@huggingface/transformers`). **Note for the implementer:** this code was a
   working local vector DB (sqlite-vec + on-device `all-MiniLM-L6-v2`
   embeddings, fully offline). The user was told this and chose deletion
   anyway; a vector layer may be rebuilt later against the v2 module stores.
   Do not silently keep it.

### Profile — the context database

6. **Structured `profile/` replaces the single hand-written file**:
   - `profile/experience/<slug>.md` — one file per role: frontmatter
     (`company`, `title`, `start`, `end`, `tech[]`) + narrative achievements.
   - `profile/skills.yaml` — `{ skill, level, evidenceCount, lastUsed }`.
   - `profile/education.yaml`, `profile/preferences.yaml` (how the user works
     best, constraints, energy patterns).
   - `user.md` remains, but becomes the **short auto-loaded summary generated
     from the above**. Rationale: `template/CLAUDE.md` imports `user.md` into
     *every* session — if the full context database lived there, a trivial
     `/note` call would pay for the user's entire fitness log.
7. **`profile/evidence.yaml` — append-only, dashboard-owned.** Ticking a step
   that carries a `skill:` tag appends an evidence record (what, when, which
   skill). The `/profile` skill reads evidence and proposes skill-level
   promotions in `profile/skills.yaml`, approve-gated. Rationale: preserves
   one-writer-per-file (dashboard owns evidence, `/profile` owns skills) and
   keeps the CV honest — claims have a dated trail behind them.
   Untagged steps still tick and still count toward goal progress; they just
   never touch the profile.

### Goals — redesigned

8. **12 months is a hard ceiling for anything trackable.** The `3yr` horizon
   is demoted to **`direction`**: a north star with no status, no progress, no
   deadline. Goals (`yearly` ≤ 12 months) hang off a direction.
   `HORIZONS` becomes `["direction", "yearly", "monthly", "weekly"]` with
   `direction` as root.
9. **`/goals` becomes two-phase**:
   - **Discover** — derive candidate goals from *gaps in the user's own data*
     (skills vs requirements in saved job descriptions, income now vs target,
     learning topics with no goal, fitness with no plan). Each candidate cites
     the evidence that produced it. The user picks.
   - **Decompose** — break the chosen goal into steps.
10. **Feasibility is the skill's job.** Unrealistic goals get pushed back
    ("Porsche in 2 months" is not a goal — name the direction it belongs to).
    Big-but-real ambitions get a **prerequisite chain** rather than a leap:
    the restaurant example must produce research → city → location → concept →
    commit, in order, before any irreversible step.
11. **Steps**: goal entries gain `kind: learn | do` and `after: [ids]`
    (prerequisites). `validateGoalTree` gains a **cycle check**. A `kind:
    learn` step may reference a Learn topic; any step may carry `skill:`.
    Rationale: hierarchy is not sequence — the current schema can express
    nesting but not "this must happen before that."
12. **Progress is derived, never typed.** A goal's progress = share of its
    leaf steps ticked, unweighted, rolled up weekly → monthly → yearly →
    direction. **Delete the manual `progress` field** from `goal-status.yaml`;
    it becomes done/not-done per step. Rationale: the user explicitly asked
    for a system that resists his own shortcut-seeking; a hand-set percentage
    is exactly that shortcut. Unweighted is deliberate — weights look precise
    and invite fiddling.

### Jobs (new module)

13. `jobs/<company>-<role>/` holds:
    - `jd.md` — the pasted job description.
    - `fit.md` — gap analysis: requirements satisfied (each cited to real
      profile evidence) vs missing. **This file is the hinge of the system**:
      its missing requirements feed the goals discovery phase.
    - `cv.md` — the tailored CV.
    - `cv.pdf` — **gitignored** (derived artifact, binary blobs bloat the
      vault's audit trail; regenerable in one command).
    - `jobs/applications.yaml` — tabular pipeline index (`saved → applied →
      interview → offer | rejected`, with dates), rendered by the dashboard.
14. **CV format is owned by the user, not the skill**: `jobs/cv-template.md`
    defines sections, order and wording style; the skill fills it. Format
    changes never require touching skill code, and multiple templates are
    possible (ATS-plain vs designed).
15. **The CV skill may only use facts present in `profile/` and
    `profile/evidence.yaml`.** It re-orders, re-weights and re-words real
    experience against the job description — it never invents. A CV is a
    document the user signs; fabrication must be structurally impossible.
16. **Flow: markdown first → user approves → PDF.** `npm run cv:pdf <path>`
    locates an installed Chrome/Edge/Brave and prints headlessly into
    `jobs/<...>/cv.pdf`. No npm dependency (Puppeteer's ~300 MB Chromium was
    rejected — `create-achieve` must stay lean). If no browser is found, print
    a clear message and fall back to the dashboard's print-styled view.

### Learn (new module)

17. `learn/<topic>/plan.md` — what is being learned, **why** (linked to the
    goal or job requirement that demanded it), and an **ordered curriculum**
    whose items are the same tickable steps as goals (`after` supported).
18. **`/teach` now writes session summaries into `learn/<topic>/sessions/`**,
    not loose `learning` notes — so the user can come back to a topic and find
    everything in one place. (This supersedes the v1 behavior of writing
    `learning` notes through the `/note` write path.)
19. Ticked curriculum items produce evidence exactly like goal steps → skills
    grow honestly. Topic progress is derived, same rule as goals.
    Spaced repetition (flashcards, SM-2 scheduling) is **out of scope**; it
    solves retention, and the first problem is direction.

### Fitness (new module)

20. **Intake interview first** — training history, injuries, equipment, days
    available, current level, time-of-day preference — so the plan is cut for
    the user rather than generic.
21. Stores: `fitness/plan.md` (approve-gated training plan),
    `fitness/workouts.yaml` (sessions), `fitness/measurements.yaml` (body
    metrics). Dashboard shows the plan, adherence, and charts.
22. **Boundaries, written into the skill** (same pattern as
    `/invest-strategy` refusing buy/sell orders):
    - **No medical or clinical advice.** Injuries, pain, medications and
      health conditions are deferred to a doctor or physiotherapist.
    - **Nutrition is out of v1** — highest data-entry burden in fitness, where
      health-advice risk concentrates, and the most common reason such logs
      are abandoned.
23. **Photos are human-only by default**: `fitness/photos/` is **gitignored**
    *and* covered by a permission deny rule, exactly like `diary/`. The AI
    never goes looking; the user attaches a photo in conversation when they
    want feedback. Rationale: body photos are the most sensitive data in the
    vault, and git history is effectively permanent. Same treatment for any
    other module media.

### Quotes

24. The daily quote pool comes from a **curated database the user supplies**
    (no API, no AI-generated quotes — attributing a generated line to a real
    person is fabrication). Build an importer accepting CSV / JSON / YAML
    (`text`, `author`, optional `source`, `tags`) that normalizes into
    `quotes.yaml`. `npm run rotate` stays fully offline.

---

## Resulting module list (13)

| Module | Store | Dashboard | Skills |
|---|---|---|---|
| Tasks | `tasks.yaml` | home card | — |
| Goals | `goals.yaml`, `goal-status.yaml` | Goals tab + home | `/goals` |
| Quotes | `quotes.yaml` | home card | `rotate` |
| Diary | `diary/` | Diary tab | *none (privacy wall)* |
| Notes | `notes/` | Notes tab + home | `/note` |
| Projects | `projects/` | Projects tab + home | — |
| Investments | `investments.yaml`, `strategy.md`, `research/` | Investments tab | `/invest-strategy`, `/research-company` |
| Profile | `profile/`, `user.md`, `evidence.yaml` | Profile tab | `/profile` |
| Ideas | `ideas/` | *(no UI — see open questions)* | `/validate-idea`, `/improve-process` |
| Guide | derived | Guide tab | — |
| **Learn** | `learn/<topic>/` | Learn tab | `/teach` |
| **Fitness** | `fitness/` | Fitness tab | `/fitness` |
| **Jobs** | `jobs/` | Jobs tab | `/cv` (or `/apply`) |

Removed: **Reviews**, **Search**.

---

## Implementation phases

Ordered by dependency. Each phase is one PR based on `main`, following the
repo's existing workflow (approval-gated, one issue at a time).

**Phase 1 — Module registry + config** *(foundation; everything depends on it)*
Registry module, `vault/config.yaml` schema, `lib/dashboard/config.ts` reader,
sidebar/header/Guide driven by the registry, completeness test. All existing
modules declared and enabled by default so nothing regresses.

**Phase 2 — Removals**
Delete Reviews and Search per decisions 4–5, including deps, scripts, skills,
Guide steps and CLAUDE.md sections. Migration note for existing vaults: leave
`reviews/` on disk (never delete user data); the app simply stops reading it.

**Phase 3 — Profile restructure + evidence log**
New `profile/` stores, `/profile` rewritten to maintain them and regenerate
the `user.md` summary, `evidence.yaml` append path, Profile tab rendering
skills and experience. **Migration:** a one-time, approve-gated pass that
parses the existing `user.md` into the structured files.

**Phase 4 — Goals redesign** *(largest single phase)*
`direction` horizon, `kind`/`after`/`skill` on steps, cycle check, derived
progress, deletion of manual `progress`, two-phase `/goals` with gap analysis
and feasibility pushback, dashboard rendering of ordered steps with blocked
states. **Migration:** existing `3yr` goals become `direction` entries,
children keep their ids so `goal-status.yaml` stays attached.

**Phase 5 — Jobs module + CV skill**
Store layout, `applications.yaml` pipeline view, `fit.md` gap analysis,
`cv-template.md`, the CV skill (evidence-only constraint), `npm run cv:pdf`
with Chrome detection and print-view fallback, PDF gitignore.

**Phase 6 — Learn module**
Topic stores and curricula, `/teach` rewritten to write into
`learn/<topic>/sessions/`, Learn tab with topic progress, wiring from
`kind: learn` goal steps to topics.

**Phase 7 — Fitness module**
Intake interview skill, plan/workouts/measurements stores, Fitness tab with
charts and adherence, medical-boundary and nutrition-scope rules, photo
privacy (gitignore + deny rule).

**Phase 8 — Quotes importer**
Import CSV/JSON/YAML into `quotes.yaml`; keep `rotate` offline.

**Phase 9 — `create-achieve` CLI package**
Interactive module picker reading the registry (with `dependsOn` handling),
scaffolds the project and writes `vault/config.yaml`. Last, because it can
only be honest once the registry is real.

---

## Cross-cutting rules the implementer must preserve

- **One primary writer per file.** Every new store names its writer in
  `CLAUDE.md`. The dashboard writes only through server actions → vault layer
  (atomic write + one labeled git commit per mutation).
- **The browser never touches disk**; read-side data access stays
  `server-only` in `lib/dashboard/`.
- **Privacy wall is non-negotiable and enforced, not merely documented**:
  `diary/` and `fitness/photos/` carry permission deny rules in
  `template/.claude/settings.json`; `type: private` notes stay prose-guarded
  (frontmatter privacy cannot be path-denied).
- **Derived data is never vault content**: PDFs, caches and indexes are
  gitignored and regenerable.
- **Skill model tiering applies to every new skill** — heavy reasoning (CV
  generation, goal discovery, fitness planning) pins `model: opus`,
  `effort: high`; see `tests/skill-hardening.test.ts`, which fails on any
  untiered skill.
- **Approve-gating**: every skill that writes user-facing content proposes
  first and writes only after explicit approval.
- Tests accompany each phase, following the existing patterns: data-layer
  tests against a throwaway vault via `ACHIEVE_VAULT_DIR`, and text-level
  contract tests for skills (privacy wall, ownership, gating).

---

## Open questions (non-blocking; ask the user when reached)

1. **Ideas has no dashboard view** (pre-existing gap). Worth a small tab in
   this pass, or leave skill-only?
2. **Should goal discovery propose fitness and learning goals too**, or do
   those modules own their own goal-setting? The plan assumes discovery spans
   all modules, since it is the only place with the whole picture.
3. **Quote database format** — the user will supply their curated DB; confirm
   columns before writing the importer.
4. **CV template contents** — the user's current CV structure (Personal
   Summary → Education → Experience → Technical Projects → Core Skills) is a
   sensible default for `cv-template.md`; confirm before shipping it.
