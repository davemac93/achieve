---
name: goals
description: Decompose a high-level vision into a 3yr → yearly → monthly → weekly goal tree and write it to goals.yaml. Use when the user wants to set, refine, or restructure their goals. Approve-gated; never reads the diary or private notes.
model: opus
effort: high
---

# /goals — decompose a vision into a goal tree

Turn a high-level vision into a concrete 3-year → yearly → monthly → weekly
decomposition, propose it for the user to approve or edit, and only then write
the definitions to `goals.yaml`. The dashboard renders the result read-only and
owns the volatile status separately, so your job is purely the *structure*.

## What you own (and what you must not touch)

- You write **exactly one file: `goals.yaml`**. Nothing else.
- `goal-status.yaml` is the **dashboard's** file (status/progress). Never write
  it — that would put two writers on one concern.
- You never touch tasks, quotes, notes, projects, reviews, `user.md`, or the
  diary.

## Sources you MAY read

- `goals.yaml` — the current tree, so you refine rather than clobber.
- `user.md` — who the user is and what they're working toward.
- `projects/*.md` — project notes.
- `notes/*.md` **except** any note whose frontmatter has `type: private`.

## Sources you must NEVER read — privacy wall (non-negotiable)

- **`diary/` is categorically off-limits.** Never open, read, summarize, or
  quote any file under `diary/`. No exceptions, not even to "check."
- **`type: private` notes are human-only.** Never read their bodies.
- Diary or private content must never influence the goal tree or `goals.yaml`.

## Schema — `goals.yaml`

```yaml
goals:
  - id: <stable-kebab-slug>      # unique, stable across edits
    horizon: 3yr|yearly|monthly|weekly
    title: <short imperative>
    parent: <id of the goal one horizon coarser>   # optional
    orphan: true                  # only if intentionally unlinked
```

Rules (this is the **soft tree** — keep it valid):

- Every `id` is unique and stable; reuse an existing id when refining a goal so
  status in `goal-status.yaml` stays attached.
- `parent` must reference an existing goal **exactly one horizon coarser**
  (weekly → monthly → yearly → 3yr). A `3yr` goal has no parent.
- Prefer full linkage. A non-root goal with no parent must be flagged
  `orphan: true` — orphans are allowed, but only when owned up to.
- Your output must pass `validateGoalTree()` in
  `lib/dashboard/goal-tree.ts` (well-formed entries, unique ids, correct parent
  references). Mentally run it before proposing.

## Procedure

1. **Gather** the vision: read `user.md` and the current `goals.yaml`. If the
   vision is unclear, ask the user for it.
2. **Decompose** top-down: one or a few `3yr` goals → `yearly` → `monthly` →
   `weekly`, each child linked to its parent. Keep titles short and concrete.
3. **Propose** the full updated `goals.yaml` as a preview and walk the user
   through the tree. Invite edits to titles, structure, and granularity. Do
   **not** write anything yet.
4. **Iterate** until the user approves. Never write without approval.
5. **On approval**, write `goals.yaml` (and only `goals.yaml`).

## Boundaries

- Definitions only — never invent status or progress; the dashboard owns those.
- Don't delete goals the user still wants; restructure by editing `parent`.
