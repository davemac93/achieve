---
name: teach
description: Run an interactive learning session grounded in your `learning` notes and user.md — active recall and Socratic questioning, not a lecture — then capture what was learned as a new learning note. Use when the user wants to study, review, be quizzed on, or learn a topic they've taken notes on. Never reads the diary or private notes.
---

# /teach — learn from your own notes, then write back what stuck

Run a focused learning session built from the user's existing `learning` notes
and their profile. The mode is **active recall and Socratic dialogue**, not
lecture: draw the answer out of the user, surface gaps, and only explain to fill
a gap the user couldn't close. At the end, capture what was learned or clarified
as a **new `learning` note**, so each session compounds.

## What you own (and what you must not touch)

- You create **new `learning` notes** — and you do it through the **`/note`
  write path**, not a separate writer: compose the payload and run
  `node scripts/write-note.ts <payload.json>` with `"type": "learning"`. That
  gives the atomic write + one labeled commit for free, and keeps a single
  writer for `notes/`.
- You never edit the user's existing notes, and never write `goals.yaml`,
  `tasks.yaml`, `reviews/`, `projects/`, `ideas/`, or `user.md`.

## Sources you MAY read

- `notes/*.md` whose frontmatter `type` is **`learning`** — the material for the
  session. Skip every other type; you do not need them.
- `user.md` — what the user is working toward and how they learn best, to pitch
  the session at the right level.

## Sources you must NEVER read — privacy wall (non-negotiable)

- **`diary/` is categorically off-limits.** Never open, read, summarize, or
  quote any file under `diary/`. No exceptions, not even to "check."
- **`type: private` notes are human-only.** Never read their bodies — including
  when scanning `notes/` for `learning` material; filter them out first.
- Diary or private content must never enter a session or a note you write.

## Procedure

1. **Gather** the material: read the `learning` notes (skip private/other types)
   and `user.md`. If there are none yet, say so and offer to capture a first
   learning note via `/note` instead.
2. **Pick a focus** with the user — a topic, a note, or "quiz me on everything."
3. **Run the session — active recall first:**
   - Ask questions that make the user retrieve, connect, or apply the idea;
     don't restate the note back to them.
   - Follow up Socratically on thin or shaky answers. Only explain to close a
     gap the user genuinely couldn't, then re-ask to confirm it stuck.
   - Track what was solid, what was shaky, and what was new.
4. **Consolidate:** summarize what was reinforced and what to revisit next time.
5. **Write it back** — propose a new `learning` note (title, tags, a concise
   body: what was covered, what's now solid, what to revisit). On approval,
   write it via the `/note` write path (`type: learning`, one labeled commit),
   then confirm the created path.

## Boundaries

- Teach, don't tell: default to eliciting; explanation is the exception.
- Ground every question in the user's own notes and level — never quiz on
  material that isn't in their `learning` notes.
- One new note per session, through the shared write path — never hand-edit
  `notes/`.
