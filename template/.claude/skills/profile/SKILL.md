---
name: profile
description: Maintain the structured profile database (experience, skills, education, preferences) and regenerate the short user.md summary from it, including skill promotions proposed from the evidence log. Use when the user asks to update, regenerate, or migrate their profile. Approve-gated; never reads the diary or private notes.
effort: medium
---

# /profile — maintain the profile context database

The user's profile is a small **database**, not one hand-written file:

| File | Holds | Writer |
|---|---|---|
| `profile/experience/<slug>.md` | one role: `company`, `title`, `start`, `end`, `tech[]` + narrative achievements | **you** |
| `profile/skills.yaml` | `skill`, `level`, `evidenceCount`, `lastUsed` | **you** |
| `profile/education.yaml` | schooling | **you** |
| `profile/preferences.yaml` | `workStyle`, `constraints`, `energyPatterns` | **you** |
| `profile/evidence.yaml` | append-only log of completed, skill-tagged work | **the dashboard — never you** |
| `user.md` | the short summary auto-loaded into every session | **you** (and the user, by hand) |

`user.md` is imported by the vault's `CLAUDE.md` into *every* session, so it
must stay a summary: a handful of lines per section, roughly 40 lines total.
The detail belongs in `profile/`, which is read only when something needs it.
Never move the database into `user.md`.

## Sources you MAY read

- `profile/**` — the stores above, including `evidence.yaml` (read-only).
- `goals.yaml` — the goal tree.
- `projects/*.md` — project notes.
- `notes/*.md` **except** any note whose frontmatter has `type: private`.

That is the complete allow-list. If you want a programmatic gather, it matches
`getProfileSources()` in `lib/dashboard/profile.ts`.

## Sources you must NEVER read — privacy wall (non-negotiable)

- **`diary/` is categorically off-limits.** Never open, read, summarize, or
  quote any file under `diary/`. No exceptions, not even to "check."
- **`type: private` notes are human-only.** Never read their bodies; never let
  their content influence the profile.
- Diary or private content must never appear in `user.md`, in `profile/`, or in
  `CLAUDE.md`.

## Ownership — what you may write

You write `profile/experience/*.md`, `profile/skills.yaml`,
`profile/education.yaml`, `profile/preferences.yaml` and `user.md`.

**You never write `profile/evidence.yaml`.** It is the dashboard's file, append
only, and it is what makes a claimed skill honest — a level with a dated trail
behind it. If evidence looks wrong, say so; do not edit it.

You never touch goals, tasks, notes, projects, quotes, or the diary.

## Procedure

1. **Gather** the allowed sources above, including the current `profile/` files
   and `user.md` (so you preserve the user's voice and hand-written sections).
2. **Update the database** where it is out of date — a new role, a new skill,
   a changed constraint. Ask before inventing anything; keep it factual and
   grounded in the sources. Do not invent biography.
3. **Propose skill promotions from evidence** (below).
4. **Regenerate the `user.md` summary** from the database: who they are, what
   they're working toward, how they work best — the headline version only.
5. **Propose** every file you would write, as a preview/diff, and ask for
   explicit approval. Do **not** write anything yet.
6. **On approval**, write exactly the approved files. If the user declines or
   asks for changes, revise and re-propose. Never write without approval.

## The shape you write into `user.md`

Keep the summary in the shape below. It is not decoration: it is the shape
`scripts/migrate-profile.ts` can read back, so a summary you regenerate today
can still be re-migrated tomorrow. Roles are a **bold line** — company, an
em-dash, the title, then the dates in brackets — with the achievements as
bullets under it, and the stack on a `Tech:` bullet.

```markdown
## Experience

**Acme — Senior Platform Engineer** (2021-03 – present)
- Ran the migration off self-hosted Kubernetes.
- Tech: Kubernetes, TypeScript, Terraform

**Initech — Backend Developer** (01/2018 – 2021)
- Built the billing service.
```

`08/2025` and `2025-08` are both read (and both stored as `2025-08`); an end of
`present` means the role is current and is stored as no `end` at all. A role
line with no date, or one where the company and title cannot be told apart, is
**reported as unparsed rather than guessed** — see below.

## Proposing skill promotions

Read `profile/evidence.yaml` and count records per skill since each skill's
last review (`evidenceCount` records what stood behind the current level).

- The ladder is `basic → working → strong → expert`. Propose **one rung at a
  time**, and only when new evidence has accumulated since the last review.
- Say what the evidence is, in numbers and dates: *"6 Kubernetes steps
  completed since March — move basic → working?"* Never propose a level with
  nothing dated behind it.
- On approval, update that skill's `level`, `evidenceCount` (the count you
  just cited) and `lastUsed` (the newest evidence date) in `skills.yaml`.
- A skill with no evidence is not a lie — it is just unpromoted. Leave it.

## Migrating an existing `user.md`

A vault written before the database existed keeps everything in `user.md`. The
migration is one-time, approve-gated, and never destructive.

1. Run the parse in preview mode — it writes nothing (from the repo root; it
   honors `ACHIEVE_VAULT_DIR`, like every other vault script):

   ```bash
   node scripts/migrate-profile.ts          # human-readable preview
   node scripts/migrate-profile.ts --json   # the same proposal, as JSON
   ```

2. **Show the preview to the user.** The parser reads free prose (which side of
   a dash is the company, what counts as a constraint); the user has the last
   word. Correct the JSON with them if anything is off.
   The preview ends with anything it **could not** read confidently — a role
   with no dates, or one where the company and title read as the same text.
   Those are never guessed into records. Ask the user about each one, put the
   answers into the proposal JSON, and write that.
3. **On approval**, write it:

   ```bash
   node scripts/migrate-profile.ts --write                 # the parsed proposal
   node scripts/migrate-profile.ts --write proposal.json   # a corrected one
   ```

   Existing experience files and YAML stores that already hold records are
   skipped, not overwritten; the command reports what it skipped.
4. `user.md` is **not** touched by the migration. Regenerating it as a summary
   is a separate, separately-approved step (procedure above) — so the user
   never loses the text they wrote before they have seen what replaces it.
