import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))

async function cvSkill(): Promise<string> {
  return fs.readFile(
    path.join(repoRoot, 'template', '.claude', 'skills', 'cv', 'SKILL.md'),
    'utf8',
  )
}

function frontmatter(skill: string): Record<string, unknown> {
  const block = skill.match(/^---\n([\s\S]*?)\n---/)?.[1]
  expect(block, 'SKILL.md must start with a frontmatter block').toBeTruthy()
  return parse(block!) as Record<string, unknown>
}

/**
 * Claude-read prose, so the hard contracts are guarded at the text level (the
 * /research-company and /invest-strategy pattern). The one that matters most
 * here is the honesty rule: a CV is a document the user signs, so "only facts
 * already in profile/" must be stated, must be unambiguous, and must not be
 * quietly widened by a later edit adding another source.
 */
describe('the /cv skill frontmatter', () => {
  it('pins the strongest model for heavy reasoning (tiering policy)', async () => {
    const fm = frontmatter(await cvSkill())
    expect(fm.model).toBe('opus')
    expect(fm.effort).toBe('high')
    expect(fm['argument-hint']).toBeTruthy()
    // Nothing pre-approved: approval friction is the safety mechanism here.
    expect(fm['allowed-tools']).toBeUndefined()
  })
})

describe('the /cv skill declares its privacy wall', () => {
  it('marks diary and private notes off-limits, in body and description', async () => {
    const skill = await cvSkill()
    expect(skill).toMatch(/`diary\/` is categorically off-limits/i)
    expect(skill).toMatch(/`type: private` notes are human-only/i)
    expect(skill).toMatch(/never reads the diary or private notes/i)
  })
})

describe('the no-invention rule is stated, and the source list is closed', () => {
  it('states that every fact must already exist in the profile database', async () => {
    const skill = await cvSkill()
    expect(skill).toMatch(
      /every fact in the CV must already exist in `profile\/` or\s+`profile\/evidence\.yaml`/i,
    )
    expect(skill).toMatch(/you re-order, re-weight, re-word and leave out/i)
    expect(skill).toMatch(/you\s+never add/i)
  })

  it('enumerates the transformations allowed, and the fabrications refused', async () => {
    const skill = await cvSkill()
    // The refusals are specific, because vagueness is what a CV drifts through.
    for (const forbidden of [
      /never, under any framing, including when the user asks/i,
      /a number — headcount, percentage, revenue/i,
      /a skill the profile does not list, or a level above the one it records/i,
      /"?Familiar with X"? for an X the user has no recorded contact with/i,
      /softening an absence into a half-claim/i,
    ]) {
      expect(skill).toMatch(forbidden)
    }
  })

  it('routes an unmet requirement into fit.md instead of the CV', async () => {
    const skill = await cvSkill()
    expect(skill).toMatch(
      /if a requirement is not in the\s+profile, it belongs in `fit\.md` under missing — never in `cv\.md`/i,
    )
  })

  it('makes the check mechanical: name the file, or delete the line', async () => {
    const skill = await cvSkill()
    expect(skill).toMatch(/name the file it came from/i)
    expect(skill).toMatch(/any line you cannot attribute, delete/i)
  })

  it('reads no sources beyond the profile database and this application', async () => {
    const skill = await cvSkill()
    const section = skill
      .split('## Sources you MAY read')[1]!
      .split('## Sources you must NEVER read')[0]!

    // Exactly the profile stores, the template, and the job at hand.
    for (const allowed of [
      'profile/experience/*.md',
      'profile/skills.yaml',
      'profile/education.yaml',
      'profile/evidence.yaml',
      'jobs/cv-template.md',
    ]) {
      expect(section, allowed).toContain(allowed)
    }

    // And nothing else: the stores a CV must not be assembled from are named
    // and excluded, so "just this once" has no gap to slip through.
    expect(section).toMatch(/that is the whole list/i)
    for (const excluded of ['notes/', 'projects/', 'goals.yaml', 'ideas/', 'investments/']) {
      expect(section, excluded).toContain(excluded)
    }
    expect(section).toMatch(/are \*\*not\*\* CV sources/i)
    // user.md is derived from profile/, so it may orient but never originate.
    expect(section).toMatch(/never the origin of a claim/i)
  })
})

describe('the /cv skill ownership and gating', () => {
  it('writes exactly the three documents in the application folder', async () => {
    const skill = await cvSkill()
    expect(skill).toMatch(/you write exactly three files, all inside `jobs\/<company>-<role>\/`/i)
    for (const file of ['`jd.md`', '`fit.md`', '`cv.md`']) {
      expect(skill).toContain(file)
    }
  })

  it('leaves applications.yaml to the dashboard and the template to the user', async () => {
    const skill = await cvSkill()
    expect(skill).toMatch(/`jobs\/applications\.yaml` is the dashboard's\*\*/i)
    expect(skill).toMatch(/never edit it, not even to add a new row/i)
    expect(skill).toMatch(/`jobs\/cv-template\.md` is the user's\.\*\* You read it and fill it/i)
    expect(skill).toMatch(/`profile\/` is `\/profile`'s/i)
    expect(skill).toMatch(/`cv\.pdf` is produced by `npm run cv:pdf`, never by you/i)
  })

  it('proposes first and writes only on approval', async () => {
    const skill = await cvSkill()
    expect(skill).toMatch(/do \*\*not\*\* write anything yet/i)
    expect(skill).toMatch(/on approval\*\*, write the three files/i)
  })

  it('keeps the format in the template, not in the skill', async () => {
    const skill = await cvSkill()
    expect(skill).toMatch(/follow it exactly: its sections, its order, its\s+wording style/i)
    expect(skill).toMatch(/your job is to fill it, not to design\s+it/i)
  })
})

describe('the /cv skill hands the gaps to goals, and the PDF to the script', () => {
  it('writes fit.md with the headings the goals discovery phase reads', async () => {
    const skill = await cvSkill()
    expect(skill).toContain('## Requirements met')
    expect(skill).toContain('## Requirements missing')
    expect(skill).toMatch(/the headings are load-bearing/i)
    expect(skill).toMatch(/partly met counts as \*\*missing\*\*/i)
    expect(skill).toMatch(/never invent a citation/i)
  })

  it('is the shape the /goals skill says it will read', async () => {
    const goals = await fs.readFile(
      path.join(repoRoot, 'template', '.claude', 'skills', 'goals', 'SKILL.md'),
      'utf8',
    )
    // Both halves must agree that fit.md's missing list is the hand-off point.
    expect(goals).toMatch(/`jobs\/\*\/fit\.md`/)
    expect(goals).toMatch(/missing requirements/i)
    expect(await cvSkill()).toMatch(/\/goals.*(reads|discovery)/is)
  })

  it('sends the user to npm run cv:pdf, after approval, never before', async () => {
    const skill = await cvSkill()
    expect(skill).toMatch(/npm run cv:pdf jobs\/<company>-<role>/)
    expect(skill).toMatch(/then, and only then, the PDF/i)
    expect(skill).toMatch(/`cv\.pdf` is gitignored/i)
    expect(skill).toMatch(/never hand-write a PDF/i)
  })
})
