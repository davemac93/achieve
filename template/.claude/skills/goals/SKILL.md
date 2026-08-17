---
name: goals
description: Find candidate goals in gaps in the user's own data, pressure-test them for feasibility, and decompose the chosen one into ordered learn/do steps in goals.yaml. Use when the user wants to set, refine, or restructure their goals. Approve-gated; never reads the diary or private notes.
model: opus
effort: high
---

# /goals — discover a goal worth having, then decompose it

Two phases, in order. **Discover** finds candidate goals in gaps the user's own
data already shows, each cited to the evidence that produced it. **Decompose**
breaks the one they pick into ordered `learn` and `do` steps. Between the two
sits your real job: **feasibility**. You write the structure; the dashboard
derives every number from ticked steps.

## The rule everything else follows: twelve months

`yearly` is a **hard ceiling**, not a default. Anything trackable fits inside
twelve months. Anything longer is a **direction** — a north star with no
status, no progress and no deadline, whose only purpose is to tell you whether
a twelve-month goal points somewhere the user actually wants to go.

So: never propose a goal that cannot finish within a year. Propose the
direction it belongs to, and the twelve-month goal that moves toward it.

## What you own (and what you must not touch)

- You write **exactly one file: `goals.yaml`**. Nothing else.
- `goal-status.yaml` is the **dashboard's** file (which steps are ticked).
  Never write it — that would put two writers on one concern.
- `profile/evidence.yaml` is the dashboard's too, append-only. Never write it.
- You never touch tasks, quotes, notes, projects, `user.md`, or the diary.

## Sources you MAY read

Everything here is fair game, and phase 1 depends on it:

- `goals.yaml` — the current tree, so you refine rather than clobber.
- `user.md` and `profile/` — skills (`skills.yaml`), experience, education,
  preferences, and the evidence log (`evidence.yaml`) read-only.
- `jobs/*/fit.md` — the gap analysis for saved job descriptions: which
  requirements are already satisfied and which are missing.
- `learn/*/plan.md` — topics being learned and why.
- `fitness/plan.md`, `fitness/measurements.yaml` — training plan and metrics.
- `investments.yaml`, `investments/strategy.md` — holdings and the strategy.
- `projects/*.md` — project notes.
- `notes/*.md` **except** any note whose frontmatter has `type: private`.

**Modules the user has not enabled simply are not there.** A missing `jobs/`,
`learn/` or `fitness/` is normal, not an error: skip that source silently and
work from what exists. Never invent a gap from a file you could not read.

## Sources you must NEVER read — privacy wall (non-negotiable)

- **`diary/` is categorically off-limits.** Never open, read, summarize, or
  quote any file under `diary/`. No exceptions, not even to "check."
- **`type: private` notes are human-only.** Never read their bodies.
- Diary or private content must never influence the goal tree or `goals.yaml`.

## Schema — `goals.yaml`

```yaml
goals:
  - id: <stable-kebab-slug>      # unique, stable across edits
    horizon: direction|yearly|monthly|weekly
    title: <short imperative>
    parent: <id of the goal one horizon coarser>   # optional
    orphan: true                  # only if intentionally unlinked
    kind: learn|do                # steps only — never on a direction
    after: [<id>, <id>]           # prerequisites — what must be done first
    skill: <skill name>           # optional; ticking it records evidence
    topic: <learn topic slug>     # `kind: learn` steps only — learn/<topic>/
```

Rules (this is the **soft tree** — keep it valid):

- Every `id` is unique and stable; reuse an existing id when refining a goal so
  the ticks in `goal-status.yaml` stay attached.
- `parent` must reference an existing goal **exactly one horizon coarser**
  (weekly → monthly → yearly → direction). A `direction` has no parent.
- A `direction` carries **no `kind`, no `after`, no `skill`** — it is not work.
- `kind: learn` acquires a capability; `kind: do` produces a result. Put a kind
  on every step you expect the user to tick.
- `after` is **sequence**, which `parent` cannot express: `parent` says what
  contains what, `after` says what waits on what. It must not cycle, and it
  must not point at a direction (a north star is never done, so nothing can
  wait on it).
- `skill:` names a skill from `profile/skills.yaml` where one fits. Ticking
  that step appends a dated record to the evidence log, which is what lets
  `/profile` promote a skill level honestly later. Tag only steps that really
  exercise the skill; an untagged step still ticks and still counts toward
  progress.
- `topic:` points a `kind: learn` step at the `learn/<topic>/` curriculum that
  actually builds the capability — the step says something is missing, the topic
  is the plan for getting it. Only on a `learn` step, never on a `do` step or a
  direction. Name a topic that exists (or one `/teach` is about to create); the
  Goals tab links straight to it.
- Your output must pass `validateGoalTree()` in `lib/dashboard/goal-tree.ts`
  (well-formed entries, unique ids, correct parent references, no `after`
  cycles). Mentally run it before proposing.

**Never write a progress number anywhere.** There is no field for one. A goal's
progress is the share of its leaf steps ticked, computed by the dashboard and
rolled up weekly → monthly → yearly. That is deliberate: a percentage you can
type is a percentage you can move without doing the work.

## Phase 1 — Discover

Do not ask "what are your goals?" The user's own data already shows where the
gaps are; your job is to name them and let the user pick. Read the sources
above and look for:

| Gap | Where it shows up |
|---|---|
| A skill a job wants that the profile does not have | `jobs/*/fit.md` missing requirements vs `profile/skills.yaml` |
| A skill claimed at a level with no recent evidence | `profile/skills.yaml` `lastUsed` vs `profile/evidence.yaml` |
| Income now vs the income the user says they want | `user.md`, `investments/strategy.md`, `investments.yaml` |
| A topic being learned with no goal above it | `learn/*/plan.md` vs `goals.yaml` |
| Fitness with measurements but no plan | `fitness/` |
| A direction with no live goal beneath it | `goals.yaml` |
| A project that has stalled with no next step | `projects/*.md` vs `goals.yaml` |

Present **3–6 candidates, each with its evidence cited by file**, like:

> **Get to working-level Kubernetes** — `jobs/acme-platform-engineer/fit.md`
> lists Kubernetes as a missing requirement in two of your three saved roles,
> and `profile/skills.yaml` has no entry for it at all.

A candidate with nothing behind it is not a candidate. If a gap comes from your
own inference rather than a file, say so in those words. Then ask the user to
pick one — or to name their own, which goes through phase 2 the same way.

## Phase 2 — Feasibility, before decomposition

Judge the chosen goal against the twelve-month ceiling and against what the
data says about the user's starting point. Push back plainly; a goal that
cannot happen is worse than no goal, because failing it teaches the wrong
lesson.

**Unrealistic → name the direction instead.** "Buy a Porsche in 2 months" is
not a goal. Say why (the money is not there and cannot be within two months),
propose it as a `direction`, and offer the twelve-month goal that actually
moves toward it — the income or savings step it requires.

**Big but real → a prerequisite chain, not a leap.** A large ambition gets
broken into steps that each make the next one *decidable*, with the
irreversible step last and `after` pointing at everything that justifies it.
Opening a restaurant becomes:

```yaml
- { id: restaurant, horizon: direction, title: Run my own restaurant }
- { id: restaurant-viable, horizon: yearly, parent: restaurant,
    title: Decide whether to open a restaurant, and be ready if yes }
- { id: rsrch-demand, horizon: monthly, parent: restaurant-viable, kind: learn,
    title: Research whether the city needs another restaurant like this }
- { id: define-concept, horizon: monthly, parent: restaurant-viable, kind: do,
    title: Define the concept and menu, after: [rsrch-demand] }
- { id: find-location, horizon: monthly, parent: restaurant-viable, kind: do,
    title: Find and cost three viable locations, after: [rsrch-demand] }
- { id: commit-lease, horizon: monthly, parent: restaurant-viable, kind: do,
    title: Sign the lease, after: [define-concept, find-location] }
```

Note what the chain buys: `commit-lease` is not tickable in the dashboard until
both prerequisites are done, and the research step can send the whole thing back
to the drawing board before a złoty is spent. **No irreversible step may come
before the steps that justify it.** Money, contracts, resignations and
relocations are irreversible.

The point of pushing back is not to say no. It is to turn "someday" into a
first step the user can take this week.

## Phase 3 — Decompose

Break the approved goal into `monthly` goals and `weekly` steps:

- **Steps are things you can tick**, small enough to finish in their horizon
  and concrete enough that "done" is not a judgment call.
- Give each a `kind`. Alternate honestly: a `do` step that needs a capability
  the user lacks gets a `learn` step before it, with `after`.
- Add `after` **only where order really matters**. Ordering everything is a
  false constraint that blocks work that could have started.
- Tag with `skill:` where the step exercises a named skill from
  `profile/skills.yaml`.
- For a `learn` step, add `topic:` when a `learn/<topic>/` curriculum covers it
  (or offer `/teach` to open one). "Learn Kubernetes" as a lone checkbox is a
  wish; the topic is where it becomes a sequence of things to do.
- Aim for a handful of steps per goal, not a project plan. If it needs thirty,
  the goal is too big for twelve months — go back to feasibility.

## Procedure

1. **Gather** the sources you may read. Note which modules are absent.
2. **Discover**: present 3–6 candidates, each citing its evidence. Ask the user
   to pick, or to name their own.
3. **Feasibility**: check the twelve-month ceiling and the starting point. Push
   back where needed; name directions for anything longer.
4. **Decompose** into `monthly`/`weekly` steps with `kind`, `after` and
   `skill:` where each applies.
5. **Propose** the full updated `goals.yaml` as a preview and walk the user
   through the tree and the sequence. Invite edits. Do **not** write anything
   yet.
6. **Iterate** until the user approves. Never write without approval.
7. **On approval**, write `goals.yaml` (and only `goals.yaml`).

## Migrating a vault written before this schema

A vault whose `goals.yaml` still has `3yr` goals, or whose `goal-status.yaml`
still has typed `progress` percentages, needs one migration. It is a script, so
the conversion is mechanical and reviewable rather than retyped by you:

```bash
npm run migrate-goals            # preview — writes nothing
npm run migrate-goals -- --write # after the user approves
```

Show the preview, walk the user through it — especially any status entry it
reports dropping — and run `--write` only on explicit approval. It preserves
every id, so ticks and task links stay attached. Afterwards, offer to add
`kind`, `after` and `skill:` to the migrated steps through the normal flow; the
migration deliberately does not guess at those.

## Boundaries

- Definitions only — never invent status or progress; both are derived from
  ticked steps, and neither has a field you could write.
- Don't delete goals the user still wants; restructure by editing `parent`.
- Don't turn a direction into a to-do list. It has no steps of its own; the
  goal beneath it does.
