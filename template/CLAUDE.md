# Vault context

This file is auto-loaded by Claude Code at the start of every session in this
vault. It imports the user profile so every skill and conversation knows who the
user is, with no per-skill wiring.

@user.md

## The profile context database

`user.md` above is a **short summary**, and only that. The full picture lives in
`profile/`, which is read on demand — never imported here, so a trivial session
never pays for it:

- `profile/experience/<slug>.md` — one file per role (frontmatter + achievements)
- `profile/skills.yaml` — what the user can do, and at what level
- `profile/education.yaml`, `profile/preferences.yaml` — schooling; how they work best
- `profile/evidence.yaml` — append-only log of completed, skill-tagged work

Writers: the `/profile` skill owns every file under `profile/` **except**
`evidence.yaml`, which only the dashboard appends to. No skill writes evidence,
and the dashboard never writes `skills.yaml` — that split is what keeps a
claimed skill honest.

## Jobs

`jobs/<company>-<role>/` holds one application: `jd.md` (the description as
pasted), `fit.md` (which requirements the profile already backs, each cited, and
which it does not), `cv.md` (the tailored CV) and `cv.pdf` (derived, gitignored,
written by `npm run cv:pdf`).

- The `/cv` skill writes those three markdown files and nothing else.
  `jobs/applications.yaml` — the pipeline and its dates — is the **dashboard's**;
  `jobs/cv-template.md`, which decides the CV's sections and style, is **yours**.
- **The CV may contain only facts already in `profile/` and
  `profile/evidence.yaml`.** It re-orders, re-weights and re-words real
  experience against the job; it never invents. Anything the profile cannot back
  is a missing requirement in `fit.md`, not a line in the CV.
- Those missing requirements are what `/goals` reads when it looks for goals
  worth having.

## Learn

`learn/<topic>/` holds one thing being learned: `plan.md` (what it is, **why** —
the goal step or missing job requirement that demanded it — and an ordered
curriculum of tickable items) and `sessions/<date>.md`, one file per study
session.

- The `/teach` skill writes those two, and only those. It no longer creates
  loose `learning` notes; `/note` still owns `notes/`.
- `learn/status.yaml` — which curriculum items are ticked — is the
  **dashboard's**. Ticking an item is yours to do in the Learn tab, and a
  `skill:`-tagged item appends to `profile/evidence.yaml` when you do.
- A topic's progress is the share of its items ticked. There is no percentage to
  type anywhere, exactly as with goals; a `kind: learn` goal step can point at a
  topic with `topic: <slug>`.

## Fitness

`fitness/` holds one training program and what happened against it:
`intake.yaml` (the interview answers), `plan.md` (the program) — both the
`/fitness` skill's — and `workouts.yaml` and `measurements.yaml`, which are the
**dashboard's**. Logging a session is yours to do in the Fitness tab; the skill
never logs on your behalf.

- **The intake comes first.** `plan.md` is written only after `intake.yaml`
  exists, and may schedule no more days a week than the intake says you have.
  The write path enforces both, so a plan is never a generic program.
- **No medical or clinical advice, ever.** Injuries, pain, medications and
  health conditions are recorded in your own words and deferred to a doctor or
  physiotherapist. The skill builds general training programs and nothing more:
  it does not diagnose, does not rehabilitate, and does not clear you to train.
  If something hurts, that is a question for a professional, not for Claude.
- **Nutrition is out of scope in v1** — no macro tracking, no meal plans, no
  calorie targets. There is no field for any of it.
- **`fitness/photos/` is human-only**, exactly like `diary/`: gitignored *and*
  permission-denied. Never look for photos, never list that folder, never open
  one. If you want feedback on a photo, attach it in the conversation yourself.

## Privacy boundary (non-negotiable)

- `diary/` is categorically off-limits to every AI agent and skill — never read,
  summarize, or quote from it. No exceptions.
- `fitness/photos/` is off-limits on the same terms — body photos are the most
  sensitive thing in the vault, and git history is permanent.
- Notes with `type: private` are human-only; agents never read them.
- Diary content must never enter this file or `user.md`.
