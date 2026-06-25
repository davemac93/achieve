# PRD — Personal OS (v1)

**Status:** Ready for agent
**Date:** 2026-06-25
**Source:** Synthesized from the locked design (see `/tmp/personal-os-handoff.md`). Greenfield — no existing codebase, ADRs, or glossary.

---

## Problem Statement

I want to run my life — goals, daily tasks, notes, a diary, the projects I'm working on — with an AI that actually knows who I am and helps me think, not just a set of static lists. Today my long-term vision and my daily actions live in separate places, so my day-to-day work drifts away from what I'm actually trying to achieve over months and years. Existing tools either lock my data in someone else's cloud, can't reason about my context, or require me to re-explain myself every time. I also want this to be something other people can clone and use, so it has to run locally, keep my private writing private, and be trivial to set up without provisioning databases or pasting API keys.

## Solution

A local-first personal operating system. My data lives as plain files on my own disk (the "vault"). I talk to AI agents through Claude Code — they help me set goals across a 3-year → yearly → monthly → weekly hierarchy, review my progress with me every week, and maintain a profile of who I am so every session has context. A local Next.js dashboard gives me a visual window into everything and lets me handle the simple human actions (ticking tasks, writing diary entries, adding quotes, editing my profile). My diary is categorically off-limits to all AI. The whole thing is MIT-licensed and starts from a setup script that scaffolds a blank vault, so anyone can clone and go without a database or credentials.

## User Stories

1. As a user, I want my data stored as plain files on my own machine, so that I own it and nothing private leaves my disk unless I choose.
2. As a user, I want to run the whole system after a clone with no database and no API keys, so that setup is trivial.
3. As a new user, I want a setup script to scaffold a blank vault for me, so that I start from a clean structure instead of someone else's content.
4. As a user, I want my real vault content excluded from version control, so that I never accidentally publish my goals, notes, or diary.
5. As a user, I want to add a task from the dashboard, so that I can capture something to do quickly.
6. As a user, I want to mark a task done from the dashboard, so that I can track completion.
7. As a user, I want to delete a task from the dashboard, so that I can remove things that no longer matter.
8. As a user, I want to optionally link a task to a weekly goal, so that my daily actions trace up to my long-term vision.
9. As a user, I want to write a dated diary entry from the dashboard, so that I can keep a private journal.
10. As a user, I want my diary to be invisible to every AI agent and skill, so that my most private writing is never read or summarized by a model.
11. As a user, I want a quote of the day that rotates automatically, so that I get fresh inspiration each day.
12. As a user, I want to add my own quotes, so that the rotation reflects what matters to me.
13. As a user, I want to edit a profile of myself, so that the AI knows who I am.
14. As a user, I want every Claude Code session to automatically load my profile, so that I never have to re-explain my context.
15. As a user, I want to set goals with an agent across 3-year, yearly, monthly, and weekly horizons, so that I have a coherent plan.
16. As a user, I want the goals agent to propose a decomposition from a high-level vision that I then approve or edit, so that I get leverage from the AI rather than typing every level myself.
17. As a user, I want goals to form a hierarchy where lower goals can trace to a parent, so that I can see how this week serves this year.
18. As a user, I want to be allowed to keep a goal without a parent when life doesn't ladder neatly, so that the structure guides without constraining.
19. As a user, I want to see my goals in the dashboard, so that I have a visual overview even though they're set by the agent.
20. As a user, I want to toggle a goal's status/progress from the dashboard, so that I can update state without a full agent session.
21. As a user, I want a weekly review session with an agent, so that I reflect on progress against my goals.
22. As a user, I want the system to flag when a weekly review is due, so that I keep the ritual.
23. As a user, I want the review agent to read my tasks and goals for the period, so that the review is grounded in what actually happened.
24. As a user, I want each review saved as a dated document, so that I can look back on how I've progressed.
25. As a user, I want every change (by me or an agent) committed to git automatically, so that I have an audit trail and can revert mistakes.
26. As a user, I want writes to be atomic, so that a file is never left half-written if something interrupts.
27. As a user, I want each file to have a single primary writer, so that the dashboard and agents don't clobber each other.
28. As a contributor, I want the project under a permissive MIT license, so that I can fork, self-host, and build on it freely.
29. As a contributor, I want a committed template of the blank vault, so that I can see and review the expected structure without any personal data in the repo.
30. As a developer, I want all reads and writes to go through one vault layer, so that atomicity and git behavior are consistent and testable.

## Implementation Decisions

**Source of truth & runtime.** Files on disk in a `vault/` are the single source of truth. Claude Code is the agent runtime (hard dependency) and reads the vault via native file tools. No database in v1; no vector index in v1 (retrieval is Claude Code navigating a frontmatter-tagged file tree).

**Vault layout.** Prose as markdown (`notes/`, `diary/`, `projects/`), structured state as YAML. Goal data is split into definitions (`goals.yaml`, agent-owned) and volatile status/progress (`goal-status.yaml`, dashboard-owned) so no file has two writers. Tasks live in `tasks.yaml` with an optional `goal` reference to a weekly goal id. Reviews are dated markdown under `reviews/`. Quotes in `quotes.yaml` with a daily-rotated current pointer. User profile in `user.md`.

**User-context delivery.** `CLAUDE.md` at the vault root is auto-loaded by Claude Code every session and imports `user.md`. This guarantees every skill and session has user context without per-skill wiring. Diary content must never enter `CLAUDE.md` or `user.md`.

**Vault I/O module.** A single module mediates all reads/writes. It performs atomic writes (write temp → fsync → rename) and an auto git-commit after each mutation with a labeled message (e.g. dashboard vs which skill). This is the highest test seam; everything depends on it. No file locking in v1.

**Write ownership.** One primary writer per file: dashboard owns tasks, diary, goal-status, quotes (add), user.md; the `/goals` skill owns goal definitions; the `/review` skill owns reviews; scripts own quote rotation and the review-due flag. Agents read-only elsewhere.

**Dashboard.** Next.js (App Router) + shadcn/ui, localhost. All writes go through server-side route handlers / server actions calling the vault I/O module via `fs`; the browser never touches disk directly. Dashboard scope for v1: Tasks (add/check/delete, optional goal link), Diary (dated human entry), Quote (view rotated + add), User profile editor, Goals (read-only view + status toggle).

**Skills (Claude Code SKILL.md files; differ only by cadence).**
- `/goals` — on-demand. Given a high-level vision, proposes a 3yr→yearly→monthly→weekly decomposition; user approves/edits; writes `goals.yaml`. Strict tree softly enforced (optional `parent`, orphans allowed with a flag).
- `/review` — weekly. Surfaced by a review-due script. Reads the goal tree and tasks for the period (NOT diary — diary is off-limits); walks progress with the user; writes a dated review under `reviews/weekly/`.
- `/profile` — refreshes `user.md` from goals, projects, and non-private notes. Approve-gated. Never reads `diary/` or `private` notes.

**Scripts (not agents).** Daily quote rotation (advances the current pointer) and the review-due flag (surfaces "a review is due" state to the dashboard). Plain scripts over vault state.

**Privacy boundaries.** `diary/` is categorically off-limits to all AI/skills. `private`-type notes are human-only and never read by agents. README states both.

**Distribution.** MIT license. `.gitignore` excludes all credentials and all personal vault content. A committed `template/` directory (placeholder/empty files, no personal data) plus a setup script copies it to the user's gitignored `vault/` on first run. The repo ships code + skills + setup script + template only — zero personal data.

## Testing Decisions

Good tests assert **external behavior**, not implementation details — what lands in the files and what git records, given an input vault state. Tests drive real modules against a temporary vault directory and assert on resulting file contents and commit history; no mocking of the filesystem internals.

Modules to test, by seam (highest first):
- **Vault I/O layer (highest seam).** Atomic-write behavior (interrupted write never leaves a half-written file; readers never see partial state), and that each mutation produces exactly one labeled git commit. This is the most valuable seam because all other components route through it.
- **Dashboard server actions / route handlers.** Drive the request and assert the file effect (e.g. add-task request → `tasks.yaml` contains the task; check-task → its `done` flips; status toggle → `goal-status.yaml` updates). React rendering is not tested.
- **Skill file-effect contracts.** Given an input vault and an approved interaction, assert the resulting files: `/goals` produces a schema-valid `goals.yaml` with correct parent refs; `/review` writes a correctly dated review referencing the period's tasks/goals; `/profile` produces an updated `user.md`. **Explicit privacy test: `/profile` and `/review` never read `diary/` (and `/profile` never reads `private` notes)** — assert no diary content can appear in their outputs or in `user.md`/`CLAUDE.md`.
- **Scripts as pure functions.** Quote rotation advances the pointer deterministically over a given `quotes.yaml`; review-due computes the correct flag from the last review date.

Prior art: none — greenfield. The vault I/O tests establish the pattern (drive against a temp dir, assert files + git) that the other suites follow.

## Out of Scope (v1)

- Any database, including Supabase (reconsidered only for multi-device sync, v3+).
- Vector/embedding-based RAG and any local vector index (v3).
- The `/note` skill, Notes views, and note-type enum hardening (v2).
- Projects views and the Teach skill (v2).
- The Idea/future-product validator skill (v3).
- Obsidian integration polish (v3); Obsidian remains an optional external viewer with no v1 work.
- Multi-device sync, mobile/phone access, multi-user/hosted versions.
- File locking or a write queue (single-user assumption makes single-writer + atomic-rename + git sufficient).

## Further Notes

- Roadmap context (documented for contributors, not built in v1): **v2** = `/note` skill + Notes views + note-type hardening, Projects views, Teach skill. **v3** = Idea-validator, optional local vector index, Obsidian polish, Supabase iff real multi-device demand.
- Note `type` is intentionally a fluid frontmatter tag (seeded `learning`, `validation`, `working`, `private`) to be hardened into an enum once real usage reveals the taxonomy — deferred to v2.
- Minor build-time decisions left open: whether tasks live in one `tasks.yaml` or per-day files; the eventual vector index tech (sqlite-vec vs LanceDB, v3).
- No sensitive data appeared in the design conversation; nothing required redaction. The user owns a Supabase account but no credentials were ever shared.
