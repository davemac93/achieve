# achieve — Personal OS

A local-first, open-source **personal operating system**. Your data lives as plain files on your
own disk (the "vault"); AI agents you run through **Claude Code** help you set goals, review
progress weekly, and keep a profile of who you are so every session has context. A local Next.js
dashboard is the visual window — and the place you handle quick human actions (ticking tasks,
writing diary entries, adding quotes, editing your profile).

Core principles:

- **Local-first.** Source of truth is plain files on disk in a `vault/`. No database brain.
- **Private by default.** Your `diary/` is categorically off-limits to every AI agent and skill,
  and `type: private` notes are human-only.
- **Trivial setup.** Clone, run one setup script to scaffold a blank vault — no database, no API keys.
- **Open.** MIT-licensed; anyone can clone and use it.

## Quick start

```bash
npm install
npm run setup   # scaffolds vault/ from template/ on first run (its own git repo)
npm run dev     # dashboard at http://localhost:3000
```

That's it — no database to provision, no credentials to paste. Your real content lives in `vault/`,
which is gitignored and never published. The skills below run inside Claude Code from within the
vault.

## What's inside

### Dashboard (Next.js)

A read-mostly window over your vault, with the simple human write actions built in:

- **Dashboard** — to-do list (add / complete / delete, optionally linked to a weekly goal), quote
  of the day, your goal tree, and a banner when a weekly review is due.
- **Goals** — your 3-year → yearly → monthly → weekly tree, read-only; click a status chip to
  advance not-started → in-progress → done.
- **Diary** — write dated entries. This is yours alone (see Privacy below).
- **Notes** / **Projects** — surfaced from the vault's `notes/` and `projects/` directories.
- **Profile** — edit `user.md`, the file Claude loads at the start of every session.

Every write goes through a server action into the vault I/O layer — the browser never touches disk,
and each change is one atomic write plus one labeled git commit.

### Skills (run in Claude Code)

- **`/goals`** — from a high-level vision, proposes a 3yr → yearly → monthly → weekly decomposition
  for you to approve or edit, then writes `goals.yaml`.
- **`/review`** — walks your progress against the goal tree and the week's tasks, then writes a
  dated review under `reviews/weekly/`.
- **`/profile`** — refreshes `user.md` from your goals, projects, and non-private notes
  (approve-gated).
- **`/note`** — turns raw input into a summarized, categorized note under `notes/`, written through
  the vault I/O path as one labeled commit.
- **`/teach`** — runs an active-recall learning session grounded in your `learning` notes and
  `user.md`, then captures what stuck as a new `learning` note (via the `/note` write path).

Skills are approve-gated, never write outside the one file they own, and never read your diary or
`type: private` notes. They ship in `template/.claude/skills/` and are copied into each vault by
`npm run setup`.

### Scripts

- `npm run rotate` — advance the quote-of-the-day pointer (run on a daily schedule or by hand).
- `npm run review-due` — print whether a weekly review is due; exits 0 (due) / 1 (not due), so a
  cron wrapper can branch on it. Read-only.

## The vault

`npm run setup` scaffolds this blank structure (the committed `template/` is the source):

```
vault/
  CLAUDE.md          # auto-loaded by Claude Code; imports user.md
  user.md            # your profile
  tasks.yaml         # to-do items (dashboard-owned)
  goals.yaml         # goal tree definitions (/goals-owned)
  goal-status.yaml   # volatile goal status/progress (dashboard-owned)
  quotes.yaml        # quotes + rotation pointer
  notes/             # markdown notes
  projects/          # project notes
  diary/             # dated entries — human-only, never read by AI
  reviews/weekly/    # dated weekly reviews (/review-owned)
  reviews/monthly/
```

Each file has exactly one primary writer, so no two writers ever contend on the same file.

### Note types

Every note in `notes/` declares a `type` in its frontmatter, drawn from a small,
**validated enum** — the `/note` write path rejects anything outside it, so the
vocabulary stays consistent instead of drifting. Membership reflects observed
usage rather than being invented up front:

| `type` | For |
| --- | --- |
| `working` | active work — ideas, meeting notes, todos-in-prose |
| `learning` | things being learned or studied (the Teach skill reads these) |
| `validation` | evidence and findings while checking something out |
| `private` | **human-only** — agents never read the body |

`private` is load-bearing: it is the note-level half of the privacy boundary
below, and every AI-facing surface filters it out. The set can grow as real
usage warrants, but each addition is a deliberate, documented change here and in
`NOTE_TYPES` (`lib/dashboard/note-content.ts`).

## Privacy boundary (non-negotiable)

- **`diary/` is categorically off-limits to every AI agent and skill.** It is never read,
  summarized, or quoted, and its content never enters `CLAUDE.md` or `user.md`. The dashboard is the
  only thing that touches it — because it's your own writing tool.
- **`type: private` notes are human-only** — agents never read their bodies.

These contracts are enforced in code (sanctioned-writer modules) and guarded by tests.

## Architecture

- **Source of truth = files on disk** in `vault/` (its own git repo, gitignored from this one).
- A **vault I/O layer** mediates every read/write: atomic writes (temp → fsync → rename) plus one
  labeled git commit per mutation.
- The **dashboard** is Next.js (App Router) + shadcn/ui. Reads are `server-only`; writes go through
  server actions that call the vault layer server-side.

See [CLAUDE.md](CLAUDE.md) for the full developer context (architecture, write ownership, and the
privacy boundary).

## Documentation

- [Product spec / PRD (v1)](docs/personal-os-prd.md) — problem, solution, user stories, v1 scope.
- [v2 roadmap](docs/personal-os-prd-v2.md) · [v3 roadmap](docs/personal-os-prd-v3.md) — what's next.
- [Implementation issues](docs/personal-os-issues.md) — the v1 vertical slices.
- [Design handoff](docs/personal-os-handoff.md) — locked design decisions; do not reopen.

## Status

**v1 complete** — vault I/O layer, dashboard, the `/goals`, `/review`, and `/profile` skills, and
the quote-rotation and review-due scripts are all shipped. Next work is scoped in the v2 and v3
roadmaps above.

## License

[MIT](LICENSE).
