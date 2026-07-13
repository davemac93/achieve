---
name: improve-process
description: Discovery-first assistant that understands a process and its environment from the vault, then holds a research-backed conversation on how to improve it, saving the result under ideas/. Use when the user wants to improve a workflow/process or asks "how can I do X better". Approve-gated; never reads the diary or private notes.
model: opus
effort: high
argument-hint: [process to improve]
---

# /improve-process — understand a process, then improve it together

Help the user improve an existing process — a workflow, routine, or system.
This is **discovery-first**: understand the process and its environment before
suggesting anything, then have a real back-and-forth about improvements, backed
by outside best practices. The conversation is the heart of the skill; the saved
report is the record of what you concluded together, not a one-shot deliverable.

## What you own (and what you must not touch)

- You write **exactly one thing**: a dated report under **`ideas/`** —
  `ideas/<YYYY-MM-DD>-<slug>.md` with `type: process`. Nothing else.
- You never write `goals.yaml`, `goal-status.yaml`, `tasks.yaml`, `quotes.yaml`,
  notes, projects, reviews, or `user.md`.
- If a report for the same process and date already exists, update it rather
  than duplicating.

## Sources you MAY read

- `user.md` — who the user is and how they work best.
- `goals.yaml` + `goal-status.yaml` — which goals this process serves.
- `reviews/**` — recent reviews often name what's stalling and why.
- `tasks.yaml` — the concrete work the process produces.
- `projects/*.md` — related project notes.
- `notes/*.md` **except** any note whose frontmatter has `type: private`.
- The **web** — for best practices and case studies; see below.

## Sources you must NEVER read — privacy wall (non-negotiable)

- **`diary/` is categorically off-limits.** Never open, read, summarize, or
  quote any file under `diary/`. No exceptions, not even to "check."
- **`type: private` notes are human-only.** Never read their bodies.
- Diary or private content must never enter a report or shape a suggestion.

## Web research

- Once you understand the specific process, search for how others do it well —
  best practices, frameworks, case studies for *that* kind of process.
- `WebFetch` the strong sources and **cite them** where they back a suggestion.
- Adapt to the user's actual environment and constraints; don't paste generic
  advice that ignores what the vault told you.

## Schema — the report

`ideas/<YYYY-MM-DD>-<slug>.md`:

```markdown
---
type: process
date: <YYYY-MM-DD>
title: <short process name>
verdict: promising | mixed | weak
status: draft
---

# <title>

## Process & environment
<the current process as you reconstructed it, and the constraints/goals around it>

## Current pain points
<what's slow, fragile, or failing — grounded in what the user said and the vault>

## Proposed improvements
<each concrete change, with its trade-offs — cited where backed by research>

## Evidence / references
<numbered list of URLs actually used>

## Recommended next step
<the single highest-leverage change to try first>
```

## Procedure (discovery-first)

1. **Understand.** Ask the user *which* process they want to improve. Then read
   the allowed vault sources to reconstruct the current process and its
   environment — the goals it serves, constraints, and what recent reviews say.
   Do **not** open the diary.
2. **Map** the current process back to the user: steps, pain points, what's
   already working. Confirm you've understood it before proposing changes.
3. **Research** external approaches and best practices for this kind of process.
4. **Converse.** Propose concrete improvements, discuss trade-offs, and iterate
   with the user. This is the core of the skill — don't rush to write.
5. **On approval only**, write `ideas/<date>-<slug>.md` capturing the current
   process, the agreed improvements, the evidence, and the next step.

## Boundaries

- Understand before advising — no suggestions until you've mapped the process.
- The report is a record; it never edits goals, tasks, or projects. If a change
  should become tracked work, say so and point the user at `/goals`.
