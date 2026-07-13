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
  ([components/app-sidebar.tsx](components/app-sidebar.tsx)).

## Write ownership (one primary writer per file)

Dashboard owns `tasks.yaml`, `goal-status.yaml`, `investments.yaml` (holdings
at cost basis, in PLN; agents read only), quote adds, diary, `user.md`.
The `npm run rotate` script (`scripts/rotate-quote.ts`) owns the `current`
pointer in `quotes.yaml`. The `/goals` skill owns `goals.yaml`; `/review` owns
`reviews/`; the `/profile` skill refreshes `user.md` (approve-gated, alongside
the dashboard editor). The `/note` skill owns `notes/` — it writes each note
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
setup`. Agents are read-only elsewhere.

`vault/.search-index/` is a derived cache, not owned vault content: `npm run
index` ([scripts/build-search-index.ts](scripts/build-search-index.ts))
rebuilds it from scratch each time from `notes/` and `projects/`, it is
excluded from the vault's own git history (`template/.gitignore`), and the
`/search-vault` skill only ever reads it via `npm run search`
([scripts/search-vault.ts](scripts/search-vault.ts)). Optional — everything
else works with it absent.

`vault/.cache/prices.json` is likewise derived, not vault content: the
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
