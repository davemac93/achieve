# Vault context

This file is auto-loaded by Claude Code at the start of every session in this
vault. It imports the user profile so every skill and conversation knows who the
user is, with no per-skill wiring.

@user.md

## Privacy boundary (non-negotiable)

- `diary/` is categorically off-limits to every AI agent and skill — never read,
  summarize, or quote from it. No exceptions.
- Notes with `type: private` are human-only; agents never read them.
- Diary content must never enter this file or `user.md`.
