---
name: validate-idea
description: Pressure-test a business idea with live web research — market, demand, competition, risks — then write a dated, cited verdict under ideas/. Use when the user wants to validate a business idea, asks "is this idea viable / should I pursue this". Approve-gated; never reads the diary or private notes.
model: opus
effort: high
argument-hint: [idea to validate]
---

# /validate-idea — pressure-test a business idea

Take a business idea the user is considering, research it against real-world
evidence (market, demand, competition, risks), and produce a dated, cited
verdict saved under `ideas/`. The point is an honest go / rethink / drop signal
*before* the idea becomes a goal or project — not a pitch deck. Default to
skeptical: a weak verdict backed by evidence is more useful than optimism.

## What you own (and what you must not touch)

- You write **exactly one thing**: a dated report under **`ideas/`** —
  `ideas/<YYYY-MM-DD>-<slug>.md` with `type: business`. Nothing else.
- You never write `goals.yaml`, `goal-status.yaml`, `tasks.yaml`, `quotes.yaml`,
  notes, projects, reviews, or `user.md`. A validation is a record the user acts
  on later; it does not edit the source data.
- If a report for the same idea and date already exists, update it rather than
  duplicating.

## Sources you MAY read

- `user.md` — who the user is and what they're working toward (fit matters).
- `goals.yaml` — whether this idea ladders up to an existing goal.
- `projects/*.md` — related project notes.
- `notes/*.md` **except** any note whose frontmatter has `type: private`.
- The **web** — this is a research skill; see below.

## Sources you must NEVER read — privacy wall (non-negotiable)

- **`diary/` is categorically off-limits.** Never open, read, summarize, or
  quote any file under `diary/`. No exceptions, not even to "check."
- **`type: private` notes are human-only.** Never read their bodies.
- Diary or private content must never enter a report or influence a verdict.

## Web research

This skill validates against outside evidence, not vibes.

- Fan out `WebSearch` across the idea's core assumptions (demand, market size,
  competitors, pricing, regulation). Run several angled searches, not one.
- `WebFetch` the most relevant sources to read them properly before citing.
- **Cite inline.** Every factual claim about the market ties to a source.
- **Adversarially sanity-check.** Actively look for disconfirming evidence and
  existing competitors. When evidence is thin or absent, say so and lower the
  verdict — do not fill gaps with optimism.

## Schema — the report

`ideas/<YYYY-MM-DD>-<slug>.md`:

```markdown
---
type: business
date: <YYYY-MM-DD>
title: <short idea title>
verdict: promising | mixed | weak
status: draft
---

# <title>

## Idea & pitch
<one-line pitch, then a short paragraph>

## Core assumptions
- <problem / who has it>
- <target customer>
- <market size & demand>
- <competition>
- <monetization>
- <moat / differentiation>

## Market & demand evidence
<what the research found, for and against — cited>

## Competition
<who already does this, how crowded — cited>

## Risks / red flags
<the things most likely to kill it>

## Verdict + confidence
<promising | mixed | weak>, and how confident you are and why.

## Sources
<numbered list of URLs actually used>

## Suggested next step
<smallest cheap test to de-risk it; and whether it should become a goal/project>
```

## Procedure

1. **Capture** the idea. If the one-line pitch is unclear, ask for it before
   researching.
2. **Extract assumptions** — problem, target customer, market/demand,
   competition, monetization, moat, key risks. Name them explicitly.
3. **Research** each assumption on the web; gather evidence for *and* against.
4. **Synthesize** a verdict with a confidence level, grounded in citations.
5. **Propose** the full report as a preview and walk the user through it. Invite
   pushback. Do **not** write anything yet.
6. **On approval only**, write `ideas/<date>-<slug>.md` — and nothing else.

## Boundaries

- Evidence-led — never invent market numbers or demand. Cite or flag as unknown.
- A validation is a record; it never sets goals or creates projects. If the idea
  is worth pursuing, say so and point the user at `/goals`.
