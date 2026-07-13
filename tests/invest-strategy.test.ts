import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))

async function strategySkill(): Promise<string> {
  return fs.readFile(
    path.join(repoRoot, 'template', '.claude', 'skills', 'invest-strategy', 'SKILL.md'),
    'utf8',
  )
}

function frontmatter(skill: string): Record<string, unknown> {
  const block = skill.match(/^---\n([\s\S]*?)\n---/)?.[1]
  expect(block, 'SKILL.md must start with a frontmatter block').toBeTruthy()
  return parse(block!) as Record<string, unknown>
}

/**
 * The skill is Claude-read prose, not code we can intercept — so its hard
 * contracts are guarded at the text level, like /teach and /note: the privacy
 * wall, the single-writer rule, the approve-gate, and the no-orders boundary.
 */
describe('the /invest-strategy skill frontmatter', () => {
  it('pins the strongest model for heavy reasoning (tiering policy)', async () => {
    const fm = frontmatter(await strategySkill())
    expect(fm.model).toBe('opus')
    expect(fm.effort).toBe('high')
    expect(fm['argument-hint']).toBeTruthy()
  })
})

describe('the /invest-strategy skill declares its privacy wall', () => {
  it('marks diary and private notes off-limits, in body and description', async () => {
    const skill = await strategySkill()
    expect(skill).toMatch(/`diary\/` is categorically off-limits/i)
    expect(skill).toMatch(/`type: private` notes are human-only/i)
    expect(skill).toMatch(/never reads the diary or private notes/i)
  })
})

describe('the /invest-strategy skill owns exactly one approve-gated file', () => {
  it('writes only investments/strategy.md, never the dashboard-owned holdings', async () => {
    const skill = await strategySkill()
    expect(skill).toMatch(/exactly one file: `investments\/strategy\.md`/i)
    expect(skill).toMatch(/`investments\.yaml` is the \*\*dashboard's\*\* file/i)
  })

  it('is approve-gated: proposes first, never writes without approval', async () => {
    const skill = await strategySkill()
    expect(skill).toMatch(/never write without approval/i)
    expect(skill).toMatch(/on approval/i)
  })

  it('is a living document: later runs revise rather than duplicate', async () => {
    const skill = await strategySkill()
    expect(skill).toMatch(/revise/i)
    expect(skill).toMatch(/never a second dated copy/i)
  })
})

describe('the /invest-strategy skill sets rules, not orders', () => {
  it('forbids buy/sell calls on specific securities and market timing', async () => {
    const skill = await strategySkill()
    expect(skill).toMatch(/never tell the user to buy or sell a specific security/i)
    expect(skill).toMatch(/market timing/i)
  })

  it('verifies IKE/IKZE limits on the live web with citations, not memory', async () => {
    const skill = await strategySkill()
    expect(skill).toMatch(/IKE and IKZE annual contribution limits/i)
    expect(skill).toMatch(/never from\s+model memory/i)
    expect(skill).toMatch(/cited/i)
  })
})
