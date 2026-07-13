---
name: profile
description: Refresh the vault's user.md from goals, projects, and non-private notes. Use when the user asks to update or regenerate their profile. Approve-gated; never reads the diary or private notes.
effort: medium
---

# /profile — refresh user.md

Propose an updated `user.md` drawn from the user's own vault, show it for
approval, and only write it after the user explicitly approves. `user.md` is
auto-loaded into every Claude Code session (via the vault `CLAUDE.md`), so it is
how Claude knows who the user is.

## Sources you MAY read

Build the profile **only** from:

- `goals.yaml` — the goal tree (3yr → yearly → monthly → weekly).
- `projects/*.md` — project notes.
- `notes/*.md` **except** any note whose frontmatter has `type: private`.

That is the complete allow-list. If you want a programmatic gather, it matches
`getProfileSources()` in `lib/dashboard/profile.ts`.

## Sources you must NEVER read — privacy wall (non-negotiable)

- **`diary/` is categorically off-limits.** Never open, read, summarize, or
  quote any file under `diary/`. No exceptions, not even to "check."
- **`type: private` notes are human-only.** Never read their bodies; never let
  their content influence the profile.
- Diary or private content must never appear in `user.md` (or `CLAUDE.md`).

## Procedure

1. **Gather** the allowed sources above.
2. **Read** the current `user.md` so you preserve the user's voice and any
   hand-written sections.
3. **Draft** an updated `user.md` that reflects who they are and what they are
   working toward, keeping the existing structure (Who I am / What I'm working
   toward / How I work best). Summarize — do not paste raw file contents.
4. **Propose** the full updated `user.md` to the user as a preview/diff and ask
   for explicit approval. Do **not** write anything yet.
5. **On approval**, write `user.md` (and only `user.md`). If the user declines
   or asks for changes, revise and re-propose. Never write without approval.

## Boundaries

- You write exactly one file: `user.md`. You never touch goals, tasks, notes,
  projects, quotes, reviews, or the diary.
- Keep it factual and grounded in the sources; do not invent biography.
