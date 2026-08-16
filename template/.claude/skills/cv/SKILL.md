---
name: cv
description: Save a job description, analyse the gap between it and your profile, and fill your CV template with facts you already have — never invented ones. Use when the user pastes a job ad, wants a CV tailored to a role, or asks how they measure up against a job. Approve-gated; never reads the diary or private notes.
argument-hint: "[paste the job description, or jobs/<company>-<role>]"
model: opus
effort: high
---

# /cv — one job, one honest CV

Three documents, in order: the **job description** as it was given, the **fit**
between it and the user, and only then a **CV**. The order is the method — you
cannot tailor honestly until you know exactly what is being asked and exactly
what the user's own files can back.

## The rule everything else follows: you have no facts of your own

**Every fact in the CV must already exist in `profile/` or
`profile/evidence.yaml`.** You re-order, re-weight, re-word and leave out. You
never add.

Concretely — allowed:

- Putting the role the job cares about first, and cutting one it doesn't.
- Rewriting an achievement in the job's vocabulary, when the achievement is
  already recorded and the meaning does not change.
- Choosing which of a role's real bullets appear, and how few.
- Naming a skill from `profile/skills.yaml` at exactly the level recorded there.

Never, under any framing, including when the user asks:

- A company, title, date, degree, certification, tool or language that is not in
  `profile/`.
- A number — headcount, percentage, revenue, "40+ services" — that is not
  already written down. If the profile says "several", the CV says "several".
- A skill the profile does not list, or a level above the one it records.
- "Familiar with X" for an X the user has no recorded contact with.
- Softening an absence into a half-claim ("exposure to Kubernetes") to make a
  requirement look met.

A CV is a document the user signs and is interviewed against. A line they cannot
defend is worse than a gap they can explain. **If a requirement is not in the
profile, it belongs in `fit.md` under missing — never in `cv.md`.**

If the user tells you a fact in conversation that is not in `profile/` (a phone
number, a course they finished last week), you may use it **only after saying
where it will come from**, and you offer to run `/profile` so it is recorded
where the next CV can find it. Their own statement about themselves is not
invention — yours would be.

Before you propose a CV, run this check on your own draft: **take each line and
name the file it came from.** Any line you cannot attribute, delete. Say how
many you deleted.

## What you own (and what you must not touch)

You write exactly three files, all inside `jobs/<company>-<role>/`:

- `jd.md` — the job description, as given.
- `fit.md` — the gap analysis.
- `cv.md` — the tailored CV.

Never write anything else. In particular:

- **`jobs/applications.yaml` is the dashboard's** — status and dates are set in
  the Jobs tab. Never edit it, not even to add a new row; a folder with no row
  shows as `saved` on its own.
- **`jobs/cv-template.md` is the user's.** You read it and fill it. If the
  format is wrong, say so and let them change it — never edit it yourself.
- **`profile/` is `/profile`'s.** If the work turns up something the profile
  should record, say so and suggest `/profile`; never write it.
- `cv.pdf` is produced by `npm run cv:pdf`, never by you.

## Sources you MAY read

The **only** sources of fact for the CV:

- `profile/experience/*.md` — roles, dates, tech, achievements.
- `profile/skills.yaml` — skills and their recorded levels.
- `profile/education.yaml`, `profile/preferences.yaml`.
- `profile/evidence.yaml` — the dated trail behind a claimed skill.

Plus, for shape rather than substance:

- `jobs/cv-template.md` — the format the CV must follow.
- the job description the user pastes, and the files already in this
  application's folder.
- `user.md` — orientation and tone only. It is a summary *generated from*
  `profile/`, so it is never the origin of a claim: if a fact is in `user.md`
  but not in `profile/`, it goes in the CV only after `/profile` records it.

That is the whole list. `notes/`, `projects/`, `goals.yaml`, `ideas/` and
`investments/` are **not** CV sources — a CV built from scattered context is a
CV nobody can defend, and the profile database exists precisely so there is one
place the claims come from.

## Sources you must NEVER read — privacy wall (non-negotiable)

- **`diary/` is categorically off-limits.** Never open, read, summarize, or
  quote any file under `diary/`. No exceptions, not even to "check".
- **`type: private` notes are human-only.** Never read their bodies.
- Nothing from either may reach `fit.md`, `cv.md`, or the conversation.

## Procedure

### 1. Take the job description

Ask for it if it was not pasted. Identify the company and the role, and agree
the folder name with the user: `jobs/<company>-<role>/`, kebab-case
(`jobs/acme-platform-engineer/`). If that folder already exists, you are
refreshing an application — read what is there and update rather than duplicate.

Write `jd.md` **as given**, with frontmatter and no editorializing:

```markdown
---
company: Acme
role: Platform Engineer
source: https://example.com/jobs/123   # or "pasted by hand"
saved: 2026-08-16
---

<the description, verbatim>
```

Then extract the requirements — everything the description actually asks for,
including the ones buried in prose — and show the list. Getting this list wrong
poisons everything downstream, so let the user correct it before you go on.

### 2. Analyse the fit

For each requirement, look for evidence in the sources above. **Cite the file.**
A requirement is met only when you can point at something already written down;
"probably fine" is missing.

Write `fit.md` in exactly this shape — the headings are load-bearing, because
the `/goals` discovery phase reads the missing list to propose goals worth
having, and the dashboard counts it:

```markdown
---
company: Acme
role: Platform Engineer
assessed: 2026-08-16
---

# Fit — Acme, Platform Engineer

## Requirements met

- **Kubernetes in production** — `profile/experience/acme-platform-engineer.md`:
  ran the cluster migration; `profile/evidence.yaml` records it on 2026-05-02.
- **Python** — `profile/skills.yaml`: strong, last used 2026-06.

## Requirements missing

- **Terraform** — nothing in `profile/skills.yaml` and no evidence record.
- **Team leadership** — `profile/experience/...` shows mentoring one junior,
  which is not the "led a team of 5" the description asks for.

## Verdict

<two or three sentences: where the user stands, what would move the needle
most, and whether it is worth applying now.>
```

Rules for that file:

- One bullet per requirement, **bold requirement first, then an em dash**, then
  the citation or the gap. Nothing else at the top level of those two sections.
- Partly met counts as **missing**, with the partial evidence named — that is
  what makes the gap actionable instead of comfortable.
- Never invent a citation. If you cannot find the file, the requirement is
  missing.
- Say plainly when the honest answer is that the role is a stretch.

### 3. Fill the CV template

Read `jobs/cv-template.md` and follow it exactly: its sections, its order, its
wording style. The template is the user's; your job is to fill it, not to design
it. Placeholders and `<!-- -->` comments are instructions to you and never
appear in the output. A section with nothing honest to put in it is dropped, not
padded.

Within that fixed structure, tailoring is *selection and emphasis*: the
experience the job asks for first, the bullets that speak to its requirements,
the vocabulary of the description where it genuinely describes the same work.
Length is the template's business; if it says one page, cut rather than shrink.

### 4. Propose, then write

Show the complete `jd.md`, `fit.md` and `cv.md` as a preview, with the
attribution check for the CV ("every line traces to a file; I dropped N that
did not"). Walk through the missing requirements explicitly — they are the most
useful thing in the pack. Invite edits. Do **not** write anything yet.

Iterate until the user approves. **On approval**, write the three files, one
labeled commit each.

### 5. Then, and only then, the PDF

```bash
npm run cv:pdf jobs/<company>-<role>
```

It prints the approved markdown with an installed Chrome, Edge, Brave or
Chromium — no dependency to install. If the user has none of those, it says so
and points at the dashboard's print view (`/jobs/<company>-<role>/cv`, then
Cmd-P), which produces the same document. `cv.pdf` is gitignored: `cv.md` is the
version that stays in the vault's history.

Never run the command yourself without being asked, and never hand-write a PDF.

## Afterwards

- The gaps in `fit.md` are the point. Offer `/goals`, which reads them and
  proposes goals that close real ones.
- If the fit analysis showed the profile is thin or out of date, suggest
  `/profile`.
- Status and dates live in the Jobs tab. Tell the user to move the application
  there when they send it — you never touch `applications.yaml`.

## Boundaries

- No invented facts, ever — the whole skill rests on this.
- No cover letters that claim more than the CV does; the same rule applies to
  every word you write for this application.
- Don't guess at salary, notice period, or visa status. Ask, or leave it out.
- Don't judge the person by the gap list. A missing requirement is a next step,
  not a verdict.
