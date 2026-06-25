# achieve — Personal OS

A local-first, open-source **personal operating system**. Your data lives as plain files on your
own disk (the "vault"); AI agents run via **Claude Code** help you set goals, review progress
weekly, take notes, and keep a profile of who you are so every session has context. A local
Next.js dashboard is a read-mostly window — the conversation with Claude Code is where the work
happens.

Core principles:

- **Local-first.** Source of truth is files on disk in a `vault/`. No database brain.
- **Private by default.** Your `diary/` is categorically off-limits to every AI agent and skill.
- **Trivial setup.** Clone, run a setup script to scaffold a blank vault — no database, no API keys.
- **Open.** MIT-licensed; anyone can clone and use it.

## Documentation

- [Product spec / PRD](docs/personal-os-prd.md) — problem, solution, user stories, v1 scope.
- [Implementation issues](docs/personal-os-issues.md) — the v1 vertical slices (tracked as GitHub issues).
- [Design handoff](docs/personal-os-handoff.md) — locked design decisions; do not reopen.

## Status

Greenfield — design locked, spec written. v1 build starts from the issues above.
