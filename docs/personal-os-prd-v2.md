# PRD — Personal OS (v2)

**Status:** Roadmap-level — depends on v1 shipping first
**Date:** 2026-06-25
**Source:** Roadmap in `/tmp/personal-os-prd.md` (v1 PRD) and `/tmp/personal-os-handoff.md`. Builds on the v1 foundation; does not restate v1 architecture.

> Fidelity note: v1 was fully grilled. v2 was scoped at the roadmap level, so several decisions are intentionally open and flagged below. Run a focused design pass (e.g. `grill-me`) on the note-type taxonomy and the Teach interaction before building those.

---

## Problem Statement

After v1, I can set goals, review weekly, track tasks, keep a diary, and the AI knows who I am. But the knowledge side is still thin: notes only exist as files I write by hand, with no help capturing or organizing them, and the projects I'm working on aren't surfaced anywhere in the dashboard. I also have no way to actively learn — the system records my life but doesn't help me grow against my learning goals. v2 turns the vault from a record into a knowledge system.

## Solution

Three additions on top of v1, all using the established patterns (files-as-truth, skills via Claude Code, dashboard reads via server-side `fs`, atomic-write + git-commit, diary off-limits):
1. A `/note` skill that takes raw note content, summarizes it, assigns a category, and saves it to `notes/` — plus dashboard Notes views to browse and read them.
2. Hardening the note-type taxonomy from a fluid frontmatter tag into a documented enum, once real usage has revealed the recurring categories.
3. Projects views in the dashboard so the project knowledge I hold is visible alongside everything else.
4. A Teach skill that runs learning sessions grounded in my learning notes and profile, writing new learning notes back.

## User Stories

1. As a user, I want to hand raw note content to a `/note` skill and have it summarized, so that my notes are concise without manual effort.
2. As a user, I want the `/note` skill to assign a category to each note, so that notes are organized as they're created.
3. As a user, I want notes saved to `notes/` with proper frontmatter, so that they're consistent with the vault structure and retrievable by Claude Code.
4. As a user, I want to browse my notes in the dashboard, so that I have a visual index of my knowledge.
5. As a user, I want to read a note's content in the dashboard, so that I can review it without opening files manually.
6. As a user, I want to filter notes by type, so that I can separate working, learning, and reference material.
7. As a user, I want `private` notes excluded from all AI access, so that the privacy boundary established in v1 holds for notes too.
8. As a user, I want the note-type set hardened into a documented enum based on how I've actually used it, so that the taxonomy reflects reality rather than a guess.
9. As a user, I want to see my projects in the dashboard, so that the project knowledge I hold is surfaced alongside goals and tasks.
10. As a user, I want to distinguish private vs working projects in the view, so that I can manage them appropriately.
11. As a user, I want a Teach skill that runs a learning session, so that the system helps me grow, not just record.
12. As a user, I want Teach to draw on my learning notes and profile, so that sessions build on what I already know and who I am.
13. As a user, I want Teach to write new learning notes, so that what I learn is captured for next time.
14. As a user, I want Teach to never read my diary, so that the privacy wall is respected.

## Implementation Decisions

Reuse all v1 infrastructure unchanged: the vault I/O module (atomic write + one git commit per mutation), the server-side dashboard write path, the `CLAUDE.md` → `user.md` context mechanism, and the privacy boundaries (`diary/` off-limits to all AI; `private` notes human-only/agent-excluded).

**`/note` skill.** A Claude Code SKILL.md, invoked on-demand. Input: raw note content. Behavior: summarize → assign a `type` from the current set → write to `notes/<slug>.md` with frontmatter (`type`, `tags`, `project`, `created`). Owns `notes/` writes per the ownership table. Distinct from `/profile` (which maintains `user.md`, not notes).

**Note-type hardening.** Promote the fluid frontmatter `type` tag into a documented enum. Seed set was `learning`, `validation`, `working`, `private`. The actual enum is decided from observed v1+early-v2 usage — OPEN until there's real data. This is a small schema/validation change plus README documentation, not new infrastructure.

**Notes views (dashboard).** Read-only browse/read/filter over `notes/`, via server-side `fs`. Respects `private` exclusion in any AI-assisted surface (the human can still read their own private notes in the dashboard; AI cannot).

**Projects views (dashboard).** Read-mostly rendering of `projects/*.md`, distinguishing `status: private|working` from frontmatter. Whether the dashboard can also create/edit projects, or projects stay human-authored in markdown/Obsidian, is OPEN — default recommendation: read-only in v2, matching how goals were handled in v1.

**Teach skill.** A Claude Code SKILL.md. Reads `notes` of type `learning` + `user.md`; runs an interactive learning session; writes new learning notes (via the same `/note` write path or its own scoped write). Never reads `diary/` or `private` notes. The exact pedagogy/interaction shape is OPEN — recommend a focused design pass before building.

## Testing Decisions

Same philosophy as v1: assert external behavior (resulting files, git history) against a temp vault; never implementation details. New suites:
- **`/note` file-effect contract.** Given raw input, asserts a schema-valid note lands in `notes/` with correct frontmatter and an assigned type; one labeled commit results.
- **Notes/Projects dashboard server actions.** Assert read behavior and any filtering; if projects become writable, assert the file effect.
- **Note-type enum validation.** Once hardened, assert notes validate against the enum and invalid types are rejected.
- **Teach privacy + file-effect.** Assert Teach writes learning notes correctly AND never reads `diary/` or `private` notes (extends the v1 privacy test).

## Out of Scope (v2)

- Idea/future-product validator skill (v3).
- Any vector/embedding index (v3).
- Supabase, multi-device sync, mobile/multi-user (v3+ / demand-gated).
- Obsidian integration polish (v3).
- Changing v1 behaviors (tasks, diary, quote, goals, review) beyond what notes/projects/Teach require.

## Open Decisions (resolve before building the affected slice)

- **Note-type enum membership** — decide from real usage data, not up front.
- **Whether Projects views are read-only or editable** in the dashboard (recommend read-only).
- **Teach's interaction/pedagogy model** — run a focused design pass.
- **Whether Teach reuses the `/note` write path or has its own scoped writer** for learning notes.
