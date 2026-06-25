# Personal OS — v1 Issues (vertical slices)

Repo: https://github.com/davemac93/achieve
Source PRD: `/tmp/personal-os-prd.md`. Slices ordered by dependency.

---

## 1. Vault I/O foundation + setup script
**Type:** AFK · **Blocked by:** None — can start immediately
**User stories:** 1–4, 25–27, 29–30

**What to build**
The foundational vault layer that all reads/writes route through. Atomic writes (temp → fsync → rename) so a reader never sees a half-written file, and exactly one labeled git commit per mutation as the audit trail. Plus a committed `template/` directory (placeholder/empty files, no personal data) and a setup script that copies it into the user's gitignored `vault/` on first run.

**Acceptance criteria**
- [ ] Running setup on a fresh clone produces a blank vault with the full structure.
- [ ] A write through the module lands atomically; an interrupted write never leaves a partial file.
- [ ] Each mutation produces exactly one git commit with a labeled message.
- [ ] `.gitignore` excludes all credentials and all personal vault content; `template/` (no personal data) is committed.

---

## 2. Project scaffold: Next.js + shadcn + CLAUDE.md wiring
**Type:** HITL (initial architecture / design-review checkpoint) · **Blocked by:** #1
**User stories:** 14, 28 (sets up 13)

**What to build**
The localhost app skeleton: Next.js (App Router) + shadcn/ui, `CLAUDE.md` at vault root that imports `user.md` so every Claude Code session auto-loads user context, MIT license file. Establishes that all dashboard writes go through server-side route handlers/server actions calling the vault layer — the browser never touches disk.

**Acceptance criteria**
- [ ] App runs on localhost and renders a shadcn-based shell.
- [ ] `CLAUDE.md` auto-loads and imports `user.md`; no diary content can enter either file.
- [ ] MIT LICENSE present; server-side write path wired to the vault I/O module.

---

## 3. Tasks end-to-end
**Type:** AFK · **Blocked by:** #2
**User stories:** 5–7

**What to build**
Add, check, and delete a task from the dashboard, flowing through a server action to `tasks.yaml` via the vault layer. The optional goal-link field is present but inert until slice #7.

**Acceptance criteria**
- [ ] Adding a task from the UI persists it to `tasks.yaml`.
- [ ] Checking a task flips its done state; deleting removes it.
- [ ] Server-action tests assert the file effect, not React rendering.

---

## 4. Diary end-to-end + privacy wall
**Type:** AFK · **Blocked by:** #2
**User stories:** 9, 10

**What to build**
A dated diary entry written from the dashboard into `diary/`. Enforce and test the categorical boundary: no skill or agent reads `diary/`.

**Acceptance criteria**
- [ ] A diary entry is saved as a dated file.
- [ ] Test confirms no skill/agent path reads `diary/` and no diary content reaches `user.md`/`CLAUDE.md`.

---

## 5. Quote of the day
**Type:** AFK · **Blocked by:** #2
**User stories:** 11, 12

**What to build**
A daily-rotation script advancing a current-quote pointer over `quotes.yaml`, and dashboard surfaces to view the rotated quote and add new ones.

**Acceptance criteria**
- [ ] Rotation script advances the pointer deterministically over a given `quotes.yaml`.
- [ ] Dashboard displays the current quote and can add a new one (persisted).

---

## 6. User profile editor + /profile skill
**Type:** AFK · **Blocked by:** #2
**User stories:** 13, 14

**What to build**
Dashboard editing of `user.md`, plus the `/profile` skill that refreshes `user.md` from goals, projects, and non-private notes — approve-gated, never reading `diary/` or `private` notes.

**Acceptance criteria**
- [ ] Editing the profile in the UI persists to `user.md`.
- [ ] `/profile` proposes an updated profile that the user approves before write.
- [ ] Privacy test: `/profile` never reads `diary/` or `private` notes.

---

## 7. /goals skill + goals view + task-to-goal link
**Type:** HITL (decomposition-interaction design review) · **Blocked by:** #3, #6
**User stories:** 8, 15–20

**What to build**
On-demand `/goals` skill that, from a high-level vision, proposes a 3yr→yearly→monthly→weekly decomposition for the user to approve/edit, writing definitions to `goals.yaml`. Dashboard renders goals read-only and toggles status/progress in `goal-status.yaml`. Tasks gain the working optional link to a weekly goal id. Strict tree softly enforced (optional parent, orphans allowed with a flag).

**Acceptance criteria**
- [ ] `/goals` produces a schema-valid `goals.yaml` with correct parent references after approval.
- [ ] Dashboard shows goals read-only and toggles status via `goal-status.yaml` (no two writers on one file).
- [ ] A task can be linked to a weekly goal id.

---

## 8. /review skill + review-due flag
**Type:** AFK · **Blocked by:** #7
**User stories:** 21–24

**What to build**
A review-due script that surfaces "a weekly review is due" to the dashboard, and the `/review` skill that reads the goal tree and the period's tasks (not diary), walks progress with the user, and writes a dated review under `reviews/weekly/`.

**Acceptance criteria**
- [ ] Review-due flag computes correctly from the last review date.
- [ ] `/review` writes a correctly dated review referencing the period's tasks/goals.
- [ ] `/review` does not read `diary/`.
