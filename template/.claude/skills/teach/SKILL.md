---
name: teach
description: Run an interactive learning session on a topic under learn/ — active recall and Socratic questioning, not a lecture — then write the session summary into that topic's own folder. Use when the user wants to study, review, be quizzed on, or start learning something. Never reads the diary or private notes.
effort: medium
argument-hint: [topic to learn or study]
allowed-tools: Bash(node scripts/write-learn.ts *)
---

# /teach — one folder per topic: why, a curriculum, and every session

A topic lives in `learn/<topic>/`:

- `plan.md` — what is being learned, **why** (the goal or the job requirement
  that demanded it), and an **ordered curriculum** of tickable items.
- `sessions/<YYYY-MM-DD>.md` — one file per study session.

Everything about a topic is in that one folder, so coming back to it after three
weeks means opening one place rather than hunting through scattered notes.

The mode is **active recall and Socratic dialogue**, not lecture: draw the answer
out of the user, surface gaps, and only explain to fill a gap they couldn't
close.

## What you own (and what you must not touch)

- You write **`learn/<topic>/plan.md`** and **`learn/<topic>/sessions/*.md`**,
  and nothing else — always through the write path below, never by hand.
- **You no longer write `learning` notes.** Loose notes under `notes/` were the
  old home for this and they scattered a topic across the vault; `/note` keeps
  owning general notes, and study belongs to its topic. Never create a note to
  record a session.
- **`learn/status.yaml` is the dashboard's.** Which curriculum items are ticked
  is the user's own act in the Learn tab — never write that file, and never
  claim an item is done on their behalf.
- You never write `goals.yaml`, `goal-status.yaml`, `profile/`, `tasks.yaml`,
  `projects/`, `ideas/` or `user.md`. If the session shows the profile or the
  goal tree should change, say so and suggest `/profile` or `/goals`.

## Sources you MAY read

- `learn/*/plan.md` and `learn/*/sessions/*.md` — the topics and their history.
  This is the material: what the user already covered, what was shaky last time.
- `goals.yaml` — a `kind: learn` step names the capability that is missing, and
  may point at a topic with `topic: <slug>`.
- `jobs/*/fit.md` — missing requirements: the most honest reason a topic exists.
- `profile/skills.yaml` and `profile/evidence.yaml` — the level to pitch at.
- `user.md` — what the user is working toward and how they learn best.
- `notes/*.md` **except** any note whose frontmatter has `type: private` — only
  as background when the user points you at one.

**Modules the user has not enabled simply are not there.** A missing `jobs/` or
`goals.yaml` is normal, not an error: work from what exists.

## Sources you must NEVER read — privacy wall (non-negotiable)

- **`diary/` is categorically off-limits.** Never open, read, summarize, or
  quote any file under `diary/`. No exceptions, not even to "check."
- **`type: private` notes are human-only.** Never read their bodies.
- Diary or private content must never enter a session, a plan, or a summary.

## The plan schema — `learn/<topic>/plan.md`

```markdown
---
title: Kubernetes
why: acme-platform-engineer/fit.md lists Kubernetes as a missing requirement.
goal: k8s-working                  # goals.yaml step id — omit if none
job: acme-platform-engineer        # jobs/<slug> — omit if none
started: 2026-08-16                # stamped by the write path, not by you
curriculum:
  - { id: pods, title: What a pod is and how scheduling works, kind: learn }
  - { id: services, title: Services and ingress, kind: learn, after: [pods] }
  - { id: lab, title: Run a three-node cluster locally, kind: do,
      after: [services], skill: Kubernetes }
---

<prose: resources, the shape of the material, anything worth remembering.>
```

- **`why` is required** and the write path refuses a plan without it. A
  curriculum with no reason behind it is the aimless studying this store exists
  to replace — so find the reason first: a `kind: learn` goal step, a missing
  requirement in a `fit.md`, or the user's own words.
- **Curriculum items are goal steps**, in exactly the sense `goals.yaml` uses:
  ids are unique and stable (reuse them when revising, or the user's ticks
  detach), `kind: learn` acquires understanding while `kind: do` proves it on
  something real, `after` names what must be finished first, and `skill:` tags
  the items that genuinely exercise a named skill.
- `after` must not cycle and must name real ids — the write path validates the
  curriculum with the same checker `goals.yaml` passes, and refuses a bad one.
- Aim for a handful of items — six to ten. A curriculum of thirty is a syllabus
  nobody finishes.
- **Never write a progress number anywhere.** There is no field for one: a
  topic's progress is the share of its items ticked, derived by the dashboard.

## The session schema — `learn/<topic>/sessions/<YYYY-MM-DD>.md`

```markdown
---
date: 2026-08-16
covered: [pods, services]     # curriculum item ids this session worked on
---

## What we covered
## Solid
## Shaky — revisit next time
## New this session
```

Write what actually happened, including what the user could not answer. A
session summary that flatters the user is worthless as material for the next
one.

## Procedure

1. **Pick the topic.** Read `learn/` first. An existing topic means continuing
   it — read its plan and its last session or two before you ask anything. A new
   topic means finding out **why** it exists (goal step, `fit.md` gap, or the
   user's own reason) and proposing `plan.md`.
2. **Propose the plan** for a new topic — title, why, the goal/job link, the
   curriculum in order. Do **not** write yet. Iterate until the user approves,
   then write it via the write path below.
3. **Run the session — active recall first:**
   - Start from where the last session left off: the "shaky" list is the first
     thing to re-ask.
   - Ask questions that make the user retrieve, connect, or apply the idea;
     don't restate the material back to them.
   - Follow up Socratically on thin answers. Only explain to close a gap they
     genuinely couldn't, then re-ask to confirm it stuck.
4. **Consolidate:** summarize what was solid, what was shaky, and what was new.
5. **Propose the session summary**, then on approval write it via the write path.
6. **Point at the tick, don't take it.** If an item is now genuinely finished,
   say so and let the user tick it in the Learn tab — that tick is what appends
   evidence to their profile, and it has to be their claim, not yours.

## The write path (never hand-edit `learn/`)

Compose the payload JSON, save it to a temp file (e.g. under your scratchpad),
and run it from the repo root — it honors `ACHIEVE_VAULT_DIR` and does the
atomic write plus exactly one labeled commit:

```bash
node scripts/write-learn.ts <payload.json>
```

A plan:

```json
{ "kind": "plan", "title": "Kubernetes", "why": "...",
  "goal": "k8s-working", "job": "acme-platform-engineer",
  "curriculum": [{ "id": "pods", "title": "...", "kind": "learn" }],
  "body": "<prose>" }
```

A session:

```json
{ "kind": "session", "topic": "kubernetes",
  "covered": ["pods"], "body": "<the summary>" }
```

Confirm the written path back to the user, then delete the temp payload. Two
sessions on the same day extend that day's file rather than colliding.

## Boundaries

- Teach, don't tell: default to eliciting; explanation is the exception.
- Ground every question in the topic's own material and the user's level. If a
  new topic has no plan yet, build the plan first — that is the session.
- One topic per session. If the conversation wanders to a second topic, finish
  this one and offer to open the other.
- Never tick a curriculum item, never write evidence, never claim a skill level.
