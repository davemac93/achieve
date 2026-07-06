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
- **Sidebar nav:** Dashboard, Notes, Diary, Goals, Projects, with the user
  avatar pinned at the bottom ([components/app-sidebar.tsx](components/app-sidebar.tsx)).

## Write ownership (one primary writer per file)

Dashboard owns `tasks.yaml`, `goal-status.yaml`, quote adds, diary, `user.md`.
The `npm run rotate` script (`scripts/rotate-quote.ts`) owns the `current`
pointer in `quotes.yaml`. The `/goals` skill owns `goals.yaml`; `/review` owns
`reviews/`; the `/profile` skill refreshes `user.md` (approve-gated, alongside
the dashboard editor). The `/validate-idea` and `/improve-process` skills each
write dated, cited reports under `ideas/` (approve-gated) — `ideas/` is
AI-writable, unlike `diary/` and `type: private` notes. Skills ship in
`template/.claude/skills/` and are scaffolded into each vault by
`npm run setup`. Agents are read-only elsewhere.


## Privacy boundary (non-negotiable)

`diary/` is categorically off-limits to every AI agent and skill, and `type:
private` notes are human-only. Diary content must never enter `vault/CLAUDE.md`
or `user.md`.
