# Handoff — Personal OS Project (post-grill, pre-spec)

**Date:** 2026-06-25
**Stage:** Design fully grilled and locked. Next step is writing the formal specification/PRD.
**Prior process:** A `grill-me` session walked the entire decision tree; every branch is resolved. No open design questions remain.

---

## What the next session should focus on

The user's immediate intent is to **produce the project specification document** from the locked design below. The decisions are settled — do **not** re-litigate them. Turn them into a spec/PRD with the v1/v2/v3 roadmap included.

---

## Product in one line

A local-first, open-source personal OS where AI agents (run via Claude Code) help the user set goals, review progress weekly, take notes, and later learn and validate ideas. A Next.js dashboard is a read-mostly window; the conversation with Claude Code is where the work happens.

---

## Locked decisions (do not reopen)

**Architecture**
- Source of truth = **files on disk** in a `vault/`. No database brain.
- Runtime = **Claude Code** (hard dependency). Reads the vault via native file tools.
- **No vector DB in v1.** Retrieval = Claude Code navigating a well-structured, frontmatter-tagged file tree. Optional local file-based index (e.g. sqlite-vec / LanceDB) deferred to v3.
- Obsidian = optional human viewer only, never the retrieval engine.
- **Supabase dropped from v1.** Reconsidered only for multi-device sync in v3+. (User has a Supabase account but it is not needed for v1.)

**On-disk layout** (prose = markdown, structured state = YAML)
```
vault/
  notes/          *.md   (frontmatter: type, tags, project, created)
  diary/          YYYY-MM-DD.md   (HUMAN-ONLY — see Privacy)
  projects/       <slug>.md   (frontmatter: status=private|working)
  goals.yaml      definitions: 3yr -> yearly -> monthly -> weekly, parent refs (agent-owned)
  goal-status.yaml  volatile status/progress (dashboard-owned)
  tasks.yaml      entries carry optional `goal: <weekly-goal-id>`
  reviews/        weekly/ monthly/  *.md (agent-generated)
  quotes.yaml     + a "current" pointer rotated daily by a script
  user.md         user-context profile (maintained by /profile)
  CLAUDE.md       auto-loaded by Claude Code; imports user.md
```
- Note `type` is a **fluid frontmatter tag**, seeded with `learning`, `validation`, `working`, `private`; hardened into an enum later after real usage reveals the taxonomy.

**Dashboard**
- Next.js (App Router) + shadcn/ui. Writes the vault via **server-side `fs`** (route handlers / server actions) — the browser never touches disk directly. Runs on localhost.

**Concurrency / safety**
- **One primary writer per file** (ownership table below).
- `goals.yaml` split into definitions (agent) + `goal-status.yaml` (dashboard) so nothing has two writers.
- **Atomic writes** everywhere (temp file -> fsync -> rename).
- **Auto git-commit** after each mutation (labeled messages) as audit trail + backstop. No file locking in v1.

Ownership table:
| Data | Primary writer | Others |
|---|---|---|
| tasks.yaml | Dashboard | agents read only |
| goals.yaml (definitions) | /goals skill | dashboard reads |
| goal-status.yaml | Dashboard | agents read |
| reviews/*.md | /review skill | dashboard reads |
| notes/*.md | /note skill | dashboard reads; human edits in Obsidian |
| diary/*.md | Dashboard (human) | NO AI access |
| quotes.yaml + pointer | script (daily) + dashboard (human add) | agents read only |
| user.md | /profile skill (approve-gated) + human | agents read |
| projects/*.md | Human | validator reads; may append |

**Agents** — all are `SKILL.md` files invoked in Claude Code; they differ only by *cadence*.
- `/goals` — **on-demand**. Proposes a 3yr->yearly->monthly->weekly decomposition; user approves. Strict tree **softly** enforced (optional `parent`, agent steers toward full linkage, orphans allowed with a flag). Tasks optionally link to a weekly goal id.
- `/review` — **weekly heartbeat**. Surfaced by a "review due" script (a dumb cron/script, not an agent). Walks the goal tree + tasks/diary range with the user, writes `reviews/weekly/YYYY-Www.md`.
- `/note` (v2) — summarize raw note -> assign category -> save to `notes/`.
- `/profile` — refreshes `user.md` from goals/projects/non-private notes. **Approve-gated. Diary excluded.**
- Teach (v2), Idea-validator (v3) — read-scoped per the table.
- Scheduled bits (daily quote rotation, "review due" flag) = plain scripts in `scripts/`, NOT agents.

**User-context mechanism**
- `CLAUDE.md` at vault root is auto-loaded by Claude Code on every session and `@import`s `user.md`. This is the "Claude always knows who the user is" solution. Diary content must never leak into either file.

**Privacy (state in README)**
- `diary/` is **categorically off-limits** to all AI/skills/agents — no exceptions.
- `private` notes are human-only; agents never read `type: private`.

**Distribution / open source**
- Licence = **MIT** (chosen after the user asked what it is; Apache 2.0 was the only alternative raised, declined).
- `.gitignore` excludes **all credentials and all personal vault content** (real goals/tasks/notes/diary/user.md/.env).
- A committed **`template/`** dir (placeholder/empty files, no personal data) + a **setup script** (`npm run setup`/init) copies it to the user's gitignored `vault/` on first run.
- Code repo ships **zero personal data** — code + skills + setup script + template only.

---

## Roadmap (must appear in the spec)

- **v1 (usable spine):** vault structure + atomic writes + auto-git-commit; dashboard for Tasks (add/check/delete), Diary (dated human entry), Quote (daily-rotate script + human add), User profile editor (`user.md`); `CLAUDE.md`->`user.md` wiring; `/goals` skill (goals rendered read-only in dashboard); `/review` skill.
- **v2:** `/note` skill + Notes views + note-type hardening; Projects views; Teach skill.
- **v3:** Idea-validator skill; optional local vector index; Obsidian integration polish; Supabase **iff** real multi-device demand.

---

## Open / deferred (not blocking the spec)

- Exact note-type enum — intentionally left to emerge from usage.
- Whether `tasks.yaml` is one file or `tasks/YYYY-MM-DD.yaml` — minor, decide at build time.
- Local vector index tech choice (sqlite-vec vs LanceDB) — v3 decision.

---

## Suggested skills for the next agent to invoke

- **`to-prd`** (`/mnt/skills/user/to-prd/SKILL.md`) — the natural next step: turn this locked design into a PRD and publish to the project issue tracker. This is the user's stated next action.
- **`to-issues`** (`/mnt/skills/user/to-issues/SKILL.md`) — after the PRD, break the v1 scope into independently-grabbable vertical-slice issues.
- **`frontend-design`** (`/mnt/skills/public/frontend-design/SKILL.md`) — when work reaches the Next.js + shadcn dashboard UI; covers this environment's design tokens/styling constraints.
- **`grill-me`** (`/mnt/skills/user/grill-me/SKILL.md`) — only if a *new* sub-design surfaces; the core design is already fully grilled, so do not re-run it on settled decisions.

---

## Notes

- No PRD/ADR/issue artifacts exist yet — this handoff is the sole written record of the design so far; nothing to cross-reference.
- No sensitive data (keys, passwords, PII) was shared in the conversation; nothing required redaction. The user mentioned owning a Supabase account but no credentials were exposed.
