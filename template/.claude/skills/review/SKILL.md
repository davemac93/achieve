---
name: review
description: Run a weekly review — walk progress against the goal tree and the period's tasks, then write a dated review under reviews/weekly/. Use when a review is due or the user asks to reflect on the week. Never reads the diary or private notes.
---

# /review — weekly review

Help the user reflect on the past week: read the goal tree and the tasks from
the review period, talk through what moved and what stalled, and capture it as a
dated markdown review under `reviews/weekly/`. The dashboard surfaces a
"review is due" flag (computed from the most recent review's date) — this skill
is how that flag gets cleared.

## What you own (and what you must not touch)

- You write **only** dated files under **`reviews/weekly/`** —
  `reviews/weekly/<YYYY-MM-DD>.md`, named for today's date.
- You never write `goals.yaml`, `goal-status.yaml`, `tasks.yaml`, notes,
  projects, quotes, or `user.md`. The review is a record, not an edit to the
  source data.

## Sources you MAY read

- `goals.yaml` and `goal-status.yaml` — the goal tree and where each goal stands.
- `tasks.yaml` — the period's tasks (done and still open), and their goal links.
- `projects/*.md` — project notes.
- `notes/*.md` **except** any note whose frontmatter has `type: private`.
- `user.md` — for context on what the user is working toward.

## Sources you must NEVER read — privacy wall (non-negotiable)

- **`diary/` is categorically off-limits.** Never open, read, summarize, or
  quote any file under `diary/`. No exceptions, not even to "check." A weekly
  review draws only on goals and tasks — never the diary.
- **`type: private` notes are human-only.** Never read their bodies.
- Diary or private content must never appear in a review.

## The review period

A weekly review covers the **7 days ending today**. Today's date is the review
date and the filename. Reference tasks created or completed in that window and
the current status/progress of the goals they ladder up to.

## Procedure

1. **Determine the date** — today, as `YYYY-MM-DD`. That is both the review date
   and the filename: `reviews/weekly/<date>.md`.
2. **Gather** the allowed sources: the goal tree with status, and the period's
   tasks (with their `goal` links). Do **not** open the diary.
3. **Walk** the week with the user: what got done, what slipped, how each active
   goal progressed, and what to focus on next week. Ask, don't assume.
4. **Draft** the review (see format) and show it to the user.
5. **On confirmation**, write `reviews/weekly/<date>.md` — and nothing else. If
   a file for today already exists, update it rather than duplicating.

## Review format

```markdown
---
date: <YYYY-MM-DD>
period: weekly
range: <start YYYY-MM-DD> .. <YYYY-MM-DD>
---

# Weekly review — <YYYY-MM-DD>

## Progress against goals
- <goal title> — <where it stands / what moved>

## What got done
- <completed tasks this period>

## What slipped
- <open or carried-over tasks, blockers>

## Focus next week
- <intentions, grounded in the goal tree>
```

## Boundaries

- Ground every line in goals and tasks — never invent progress.
- The review is yours to write; the goal status stays the dashboard's to set.
