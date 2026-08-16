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

## Privacy boundary (non-negotiable)

- `diary/` is categorically off-limits to every AI agent and skill — never read,
  summarize, or quote from it. No exceptions.
- Notes with `type: private` are human-only; agents never read them.
- Diary content must never enter this file or `user.md`.
