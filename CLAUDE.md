# achieve — developer context

This is the **code repository** for achieve, a local-first personal OS. (Not to
be confused with `vault/CLAUDE.md`, which is auto-loaded inside a user's vault
and imports their `user.md`.)

## Run the dashboard

```bash
npm install
npm run setup   # scaffolds vault/ from template/ on first run
npm run dev     # localhost:3000
```

`npm run build` for a production build; `npm test` / `npm run typecheck` for checks.

Set `ACHIEVE_VAULT_DIR` to point the vault layer at a vault outside the repo
(tests use it to write to a throwaway git repo).

## Architecture

- **Source of truth = files on disk** in `vault/` (gitignored). The committed
  `template/` holds the blank structure; `npm run setup` copies it to `vault/`.
- **Vault I/O layer** ([lib/vault/index.ts](lib/vault/index.ts)) mediates every
  read/write: atomic writes (temp → fsync → rename) + one labeled git commit per
  mutation. All vault access goes through it.
- **Dashboard** = Next.js App Router + shadcn/ui (Tailwind v4). The browser
  never touches disk: every write goes through a **server action**
  ([app/actions.ts](app/actions.ts)) that calls the vault layer server-side.
  Read-side data access lives in [lib/dashboard/](lib/dashboard) and is marked
  `server-only`.
- **Sidebar nav:** Dashboard, Notes, Diary, Goals, Projects, Investments,
  Guide (an onboarding checklist with checkmarks derived read-only from the
  vault — [lib/dashboard/guide.ts](lib/dashboard/guide.ts)), with the user
  avatar pinned at the bottom
  ([components/app-sidebar.tsx](components/app-sidebar.tsx)). Membership and
  order come from the module registry, not from a list in the component.

## Module registry (single source of truth)

[lib/modules/registry.ts](lib/modules/registry.ts) declares every module once —
`id`, `label`, `icon`, `route`, `sidebarOrder`, `vaultPaths`, `skills`,
`seedFiles`, `guideSteps`, `dependsOn`. The sidebar, the header titles, the
Guide checklist and what `npm run setup` scaffolds are all derived from
**registry × enabled modules**; none of them keeps its own list. Adding a
module means adding a registry entry (plus its page and stores), not editing
six places.

- **Enabled set:** `vault/config.yaml` lists the enabled ids and is read
  server-side by [lib/dashboard/config.ts](lib/dashboard/config.ts). A missing
  file means *all enabled*, so vaults scaffolded before v2 behave exactly as
  before; an explicit empty list means none.
- **`dependsOn` is closed over transitively** — a module is never enabled
  without the modules it reads.
- **Install subset:** `ACHIEVE_MODULES=notes,goals npm run setup` scaffolds
  only those modules' seed files and skills, plus the base files, and records
  the resolved list in `config.yaml`. Setup *rejects* an unknown id (a typo at
  install time is worth stopping for); the dashboard reader *ignores* one (a
  stale config must never break a running vault).
- The registry is plain, import-free data so plain node
  (`scripts/setup.mjs`), the server and the browser bundle can all read it;
  icon names bind to lucide components in
  [lib/modules/icons.ts](lib/modules/icons.ts).
- [tests/modules.test.ts](tests/modules.test.ts) asserts completeness **in both
  directions** — no shipped skill, template file, route or Guide step is
  undeclared, and no stale declaration survives what it described.

## Write ownership (one primary writer per file)

Dashboard owns `tasks.yaml`, `goal-status.yaml`, `investments.yaml` (holdings
at cost basis, in PLN; agents read only), quote adds, diary, `user.md`, and
`profile/evidence.yaml`.
The `npm run rotate` script (`scripts/rotate-quote.ts`) owns the `current`
pointer in `quotes.yaml`. The `/goals` skill owns `goals.yaml`; the `/profile`
skill owns the profile database (see below) and refreshes `user.md`
(approve-gated, alongside the dashboard editor). The `/note` skill owns `notes/` — it writes each note
through `scripts/write-note.ts` (the vault I/O path: atomic write + one labeled
commit), never by hand; `/teach` creates new `learning` notes through that same
`/note` write path (not a second writer). The `/validate-idea` and
`/improve-process` skills each write dated, cited reports under `ideas/`
(approve-gated) — `ideas/` is AI-writable, unlike `diary/` and `type: private`
notes. The `/invest-strategy` skill owns `investments/strategy.md` — an
approve-gated **living** strategy document (revised in place, never duplicated)
that reads goals, holdings, and cited web research (IKE/IKZE limits), and never
gives buy/sell orders on specific securities. The `/research-company` skill
owns dated, cited, scored reports under `investments/research/` — an
orchestrator fans out parallel per-dimension research subagents (which never
see vault content) and judges strategy fit itself; verdicts are fit-based
(`fits-strategy | mixed | doesn't-fit | avoid`), never buy/sell calls, and the
skill refuses to run without `investments/strategy.md`. Skills ship in
`template/.claude/skills/` and are scaffolded into each vault by `npm run
setup` — which also writes `config.yaml` (the enabled module list) once, after
which the user owns it. Agents are read-only elsewhere.

## Profile context database

`user.md` is a **short summary**, and only that: `template/CLAUDE.md` imports it
into *every* session, so a trivial `/note` call must not pay for the user's
whole history. The full picture lives in `profile/`, read on demand:

| Store | Holds | Writer |
|---|---|---|
| `profile/experience/<slug>.md` | one role: frontmatter (`company`, `title`, `start`, `end`, `tech[]`) + narrative achievements | `/profile` |
| `profile/skills.yaml` | `skill`, `level` (`basic → working → strong → expert`), `evidenceCount`, `lastUsed` | `/profile` |
| `profile/education.yaml`, `profile/preferences.yaml` | schooling; work style, constraints, energy patterns | `/profile` |
| `profile/evidence.yaml` | **append-only** log of completed, skill-tagged work | **dashboard** |
| `user.md` | the auto-loaded summary, generated from the above | `/profile` + the dashboard editor |

The evidence split is the point: ticking a step tagged with a skill appends a
record (what, when, which skill, and the source it came from) through
[lib/dashboard/evidence.ts](lib/dashboard/evidence.ts) — atomic write, one
labeled commit, idempotent on `(source, skill)` so a re-tick never inflates a
count. `/profile` *reads* that log and proposes level promotions in
`skills.yaml`, approve-gated. One writer per file survives, and every claimed
skill has a dated trail behind it. The tagging that produces evidence lands with
the goals redesign (#77); until then `recordEvidenceAction` in
[app/actions.ts](app/actions.ts) is the API waiting for it.

Migration for vaults written before the database:
[scripts/migrate-profile.ts](scripts/migrate-profile.ts) parses `user.md` into a
proposal and, by default, **writes nothing** — `/profile` shows the preview,
and only `--write` (after approval) lands it. It never overwrites an existing
experience file or a store that already holds records, and never touches
`user.md`; regenerating the summary is its own approved step. Parsing and the
file builders live in
[lib/dashboard/profile-content.ts](lib/dashboard/profile-content.ts), which —
like `note-content.ts` — is framework-free so the script, the server and the
tests can share it.

`vault/.cache/prices.json` is derived, not vault content: the
dashboard's prices layer ([lib/dashboard/prices.ts](lib/dashboard/prices.ts))
fetches quotes and FX from Yahoo Finance per page view (in-memory TTL cache),
overwrites the snapshot after each successful fetch with a plain atomic write —
never a vault commit — and serves it as the fallback when live quotes are
unavailable, degrading to cost basis when neither exists. Excluded from the
vault's git history (`template/.gitignore` plus a self-written
`.cache/.gitignore` for vaults scaffolded earlier).

## Skill model tiering

Every template skill declares `model`/`effort` frontmatter by reasoning
weight — heavy-reasoning skills (goals decomposition, research-backed verdicts,
investment strategy) pin `model: opus` + `effort: high`; conversational skills
inherit the session model at `effort: medium`; mechanical ones run cheap
(`sonnet`/`low`). The authoritative table lives in
[tests/skill-hardening.test.ts](tests/skill-hardening.test.ts), which fails on
any untiered skill. Caveat: a skill's model override applies only for the rest
of the invocation turn — later conversational turns resume the session model,
so long interview sessions still benefit from a strong session model.

## Privacy boundary (non-negotiable)

`diary/` is categorically off-limits to every AI agent and skill, and `type:
private` notes are human-only. Diary content must never enter `vault/CLAUDE.md`
or `user.md`. This is enforced, not just prose: `template/.claude/settings.json`
(scaffolded into every vault) carries a permissions deny rule for
`Read(./diary/**)`. `type: private` notes cannot be path-denied — privacy lives
in their frontmatter — so they remain guarded by skill instructions alone.
