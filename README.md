# achieve — Personal OS

A local-first, open-source **personal operating system**. Your data lives as plain files on your
own disk (the "vault"); AI agents you run through **Claude Code** help you set goals, capture what
you learn, and keep a profile of who you are so every session has context. A local Next.js
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
  of the day, and your goal tree.
- **Goals** — your direction → yearly → monthly → weekly tree, read-only apart from one checkbox
  per leaf step. Progress is derived from what you tick and rolls up the tree; a step whose
  prerequisites are unfinished shows as blocked and cannot be ticked.
- **Diary** — write dated entries. This is yours alone (see Privacy below).
- **Notes** / **Projects** — surfaced from the vault's `notes/` and `projects/` directories.
- **Profile** — your skills, experience and recent evidence, plus the `user.md` summary Claude
  loads at the start of every session.
- **Jobs** — the application pipeline (`saved → applied → interview → offer | rejected`, with the
  date of each stage), the gap analysis behind each saved job, and a print view of the CV you
  tailored for it.
- **Learn** — one folder per topic: why you are learning it, an ordered curriculum whose items tick
  like goal steps (progress derived from what you tick, never typed), and every study session
  `/teach` has written on it.
- **Fitness** — the training plan `/fitness` cut for you, your logged sessions and measurements,
  weekly adherence (a double week never buys back a missed one) and a progress chart.

Every write goes through a server action into the vault I/O layer — the browser never touches disk,
and each change is one atomic write plus one labeled git commit.

### Skills (run in Claude Code)

- **`/goals`** — finds candidate goals in gaps your own data already shows (each cited to the file
  it came from), pushes back on the infeasible, and decomposes the one you pick into ordered
  `learn`/`do` steps under a direction → yearly → monthly → weekly tree, then writes `goals.yaml`.
  Twelve months is a hard ceiling for anything trackable; anything longer is a *direction* — a
  north star with no status, progress or deadline. Progress is never typed: it is the share of leaf
  steps ticked, rolled up the tree.
- **`/profile`** — maintains the structured profile database (`profile/`: experience, skills,
  education, preferences), proposes skill promotions from the evidence log, and regenerates the
  short `user.md` summary (approve-gated).
- **`/note`** — turns raw input into a summarized, categorized note under `notes/`, written through
  the vault I/O path as one labeled commit.
- **`/teach`** — runs an active-recall learning session on a topic under `learn/<topic>/`: it works
  out *why* the topic exists (the goal step or missing job requirement that demanded it), proposes
  an ordered curriculum whose items tick exactly like goal steps, and writes each session's summary
  into `learn/<topic>/sessions/` — everything about a topic in one folder, not scattered notes.
- **`/fitness`** — interviews you first (training history, injuries, equipment, days a week, level,
  when you train), stores the answers in `fitness/intake.yaml` so it never asks twice, and only
  then proposes an approve-gated training plan built around them — never more days a week than you
  said you have. It builds **general training programs only**: injuries, pain, medications and
  health conditions go to a doctor or physiotherapist, and nutrition is deliberately out of scope.
- **`/cv`** — saves a job description under `jobs/<company>-<role>/`, writes a gap analysis citing
  your own profile evidence for what you already have (and naming what you don't), and fills
  **your** CV template (`jobs/cv-template.md`) for that role. It may use only facts already in
  `profile/`: it re-orders, re-weights and re-words real experience, and never invents — a CV is a
  document you sign. The missing requirements are what `/goals` reads to propose goals worth
  having.

Skills are approve-gated, never write outside the files they own, and never read your diary or
`type: private` notes. They ship in `template/.claude/skills/` and are copied into each vault by
`npm run setup`.

### Scripts

- `npm run rotate` — advance the quote-of-the-day pointer (run on a daily schedule or by hand).
- `npm run quotes:import <file>` — load a quote database **you** curate into the pool. CSV, JSON or
  YAML, with `text` and `author` fields plus optional `source` and `tags`; CSV headers may be in any
  order (and a `quote` column counts as `text`). Nothing is fetched and nothing is generated — a
  machine-written line attributed to a real person is a fake quote. Safe to re-run: entries already
  in the pool are skipped, quotes you added in the dashboard are never touched, and a file with a
  bad row is rejected whole, leaving the pool as it was.
- `npm run migrate-profile` — parse an older hand-written `user.md` into the `profile/` stores.
- `npm run cv:pdf jobs/<company>-<role>` — print an approved `cv.md` to `cv.pdf` using a browser you
  already have (Chrome, Edge, Brave or Chromium — no 300 MB dependency). With none installed it says
  so and points you at the dashboard's print view, which produces the same document. The PDF is
  gitignored; `cv.md` is the version that stays in your history.
- `npm run migrate-goals` — move a vault off the old `3yr` horizon and typed `progress` percentages
  (preview by default; `-- --write` after you approve).
  Prints a preview and writes nothing until you pass `--write`; never overwrites existing content.

## The vault

`npm run setup` scaffolds this blank structure (the committed `template/` is the source):

```
vault/
  CLAUDE.md          # auto-loaded by Claude Code; imports user.md
  config.yaml        # which modules this vault runs (delete it to enable all)
  user.md            # the short profile summary Claude auto-loads (/profile + dashboard)
  profile/           # the profile context database, read on demand
    experience/      #   one markdown file per role (/profile-owned)
    skills.yaml      #   skill levels (/profile-owned)
    education.yaml   #   schooling (/profile-owned)
    preferences.yaml #   how you work best (/profile-owned)
    evidence.yaml    #   append-only log of skill-tagged work (dashboard-owned)
  tasks.yaml         # to-do items (dashboard-owned)
  goals.yaml         # goal tree definitions (/goals-owned)
  goal-status.yaml   # which leaf steps are ticked (dashboard-owned)
  quotes.yaml        # quotes + rotation pointer
  notes/             # markdown notes
  projects/          # project notes
  jobs/              # one folder per application: jd.md, fit.md, cv.md (/cv-owned)
    applications.yaml #  the pipeline and its dates (dashboard-owned)
    cv-template.md   #   your CV's sections and style — you own this file
  diary/             # dated entries — human-only, never read by AI
```

Each file has exactly one primary writer, so no two writers ever contend on the same file.

Which parts land there is a choice: every feature is a **module** declared once in
`lib/modules/registry.ts` (sidebar entry, vault paths, skills, seed files, guide steps,
dependencies), and `vault/config.yaml` lists the ones this vault runs. Install a subset with
`ACHIEVE_MODULES=notes,goals npm run setup`; modules a module depends on come along
automatically. No `config.yaml` means everything is enabled.

### Note types

Every note in `notes/` declares a `type` in its frontmatter, drawn from a small,
**validated enum** — the `/note` write path rejects anything outside it, so the
vocabulary stays consistent instead of drifting. Membership reflects observed
usage rather than being invented up front:

| `type` | For |
| --- | --- |
| `working` | active work — ideas, meeting notes, todos-in-prose |
| `learning` | things being learned or studied (structured study lives in `learn/` instead) |
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
- **`fitness/photos/` is off-limits on the same terms.** Body photos are the most sensitive thing in
  the vault and git history is effectively permanent, so they are **gitignored** *and* carry a
  permission deny rule. No agent goes looking; you attach a photo in the conversation on the rare
  occasion you want feedback on one.
- **`type: private` notes are human-only** — agents never read their bodies.

These contracts are enforced in code (sanctioned-writer modules), in the vault's shipped permission
deny rules, and guarded by tests.

## Obsidian (optional viewer)

The dashboard is the primary, source-of-truth interface — Obsidian is purely an optional way to
*browse* the same `vault/` folder with a nicer reading experience (backlinks, graph view, a
properties panel for frontmatter). It never changes what's true on disk; both just read/write the
same files.

**Setup:** open Obsidian → "Open folder as vault" → select your `vault/` directory. `npm run setup`
already ships sensible defaults under `vault/.obsidian/` (see below), so panes and plugins are
pre-configured on first open — no manual setup required.

**What's pre-configured:**
- Core plugins: Backlinks, Outgoing links, Graph view, Tag pane, Templates, Note composer, Outline,
  Quick switcher.
- Frontmatter (`type`, `tags`, `project`, `created`, `status`) renders natively as a **Properties**
  panel in modern Obsidian — no plugin required.
- Links use plain relative markdown links (`useMarkdownLinks: true`), matching how the dashboard and
  every skill already read note/project bodies as plain text — nothing Obsidian-specific leaks into
  file content.

**Recommended community plugin:** [Dataview](https://github.com/blacksmithgu/obsidian-dataview) —
lets you query frontmatter directly (e.g. list every `type: learning` note, or every project whose
`status` isn't `private`) without hand-maintaining an index. Not bundled (community plugins are
binaries we don't vendor); install it from Obsidian's Community Plugins browser if you want it.

**Note:** `project:`/`type:` frontmatter fields are plain strings, not `[[wikilinks]]` — Obsidian's
backlinks graph won't auto-connect a note to its project unless you rewrite the value as a wikilink
(e.g. `project: "[[streaming]]"`). Doing so is purely a human-side markup choice; every skill and the
dashboard already read the field as a string either way.

`vault/.obsidian/workspace.json` and any installed plugin binaries are gitignored (noisy,
machine-specific state) — only the meaningful settings (`app.json`, `core-plugins.json`,
`community-plugins.json`) are tracked in your vault's own git history.

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

**v1 complete** — vault I/O layer, dashboard, the `/goals` and `/profile` skills, and the
quote-rotation script are all shipped. Next work is scoped in the v2 and v3 roadmaps above.

## License

[MIT](LICENSE).
