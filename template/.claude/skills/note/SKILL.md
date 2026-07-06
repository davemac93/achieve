---
name: note
description: Turn raw note content into a summarized, categorized note under notes/ with frontmatter (type, tags, project, created), written through the vault I/O path as one labeled commit. Use when the user wants to capture, save, or file a note. Never reads the diary or private notes.
---

# /note — capture raw input as a filed note

Take raw note content the user hands you, summarize it, assign a `type`, and
write it to `notes/<slug>.md` with proper frontmatter. The write goes through
the vault I/O layer (atomic write + exactly one labeled commit) — you do not
write the file by hand. This skill is distinct from `/profile`, which maintains
`user.md`, not notes.

## What you own (and what you must not touch)

- You write **only** notes under **`notes/`** — one `notes/<slug>.md` per note.
- You never write `goals.yaml`, `goal-status.yaml`, `tasks.yaml`, `quotes.yaml`,
  `reviews/`, `projects/`, `ideas/`, or `user.md`.

## Sources you MAY read

- The raw content the user gives you (the note to file).
- `notes/*.md` **except** any note whose frontmatter has `type: private` — only
  to avoid slug clashes and understand existing tags/types.
- `user.md` — light context for summarizing in the user's voice.

## Sources you must NEVER read — privacy wall (non-negotiable)

- **`diary/` is categorically off-limits.** Never open, read, summarize, or
  quote any file under `diary/`. No exceptions, not even to "check."
- **`type: private` notes are human-only.** Never read their bodies.
- Diary or private content must never enter a note you write.

## The note schema

`notes/<slug>.md` — frontmatter then a summarized body:

```markdown
---
title: <short title>
type: <category>
tags: [<optional>, <tags>]      # omit if none
project: <optional-project-slug> # omit if none
created: <ISO-8601 timestamp>    # stamped by the write path, not by you
---

<summarized body>
```

**Type** — assign the best fit from the current set:

- `working` — active work, ideas, meeting notes, todos-in-prose.
- `learning` — things being learned or studied (the Teach skill reads these).
- `validation` — evidence / findings while checking something out.
- `private` — human-only; agents (including you, later) never read the body.

The set is fluid in v2; if none fit, pick the closest and say so. (Issue #41
hardens this into a validated enum.)

## Procedure

1. **Take** the raw content. If it's ambiguous what should be captured, ask.
2. **Summarize** it concisely — keep the signal, drop the noise. Preserve the
   user's meaning; don't invent.
3. **Categorize** — assign a `type` from the set above, plus any obvious `tags`
   and a `project` slug if it clearly belongs to one.
4. **Propose** the title, type, tags/project, and the summarized body to the
   user. Do not write yet.
5. **On approval**, write via the vault I/O path — never with a bare editor:
   - Compose the payload JSON `{ "title", "type", "tags"?, "project"?, "body" }`
     and save it to a temp file (e.g. under your scratchpad).
   - Run: `node scripts/write-note.ts <payload.json>` (from the repo root; it
     honors `ACHIEVE_VAULT_DIR`). This does the atomic write and the single
     labeled commit (`/note: add <slug>`).
   - Confirm the created path back to the user, then delete the temp payload.

## Boundaries

- One commit per note — always go through `scripts/write-note.ts`; never write
  `notes/<slug>.md` directly, which would skip the atomic-write + commit path.
- Summarize, never fabricate. If the input is thin, keep the note thin.
