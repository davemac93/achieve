import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))

async function researchSkill(): Promise<string> {
  return fs.readFile(
    path.join(repoRoot, 'template', '.claude', 'skills', 'research-company', 'SKILL.md'),
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
 * /teach and /invest-strategy pattern): privacy wall, single-writer rule,
 * approve-gate, the strategy prerequisite, the fixed report framework, and the
 * fit-not-orders boundary.
 */
describe('the /research-company skill frontmatter', () => {
  it('pins the strongest model for heavy reasoning (tiering policy)', async () => {
    const fm = frontmatter(await researchSkill())
    expect(fm.model).toBe('opus')
    expect(fm.effort).toBe('high')
    expect(fm['argument-hint']).toBeTruthy()
  })
})

describe('the /research-company skill declares its privacy wall', () => {
  it('marks diary and private notes off-limits, in body and description', async () => {
    const skill = await researchSkill()
    expect(skill).toMatch(/`diary\/` is categorically off-limits/i)
    expect(skill).toMatch(/`type: private` notes are human-only/i)
    expect(skill).toMatch(/never reads the diary or private notes/i)
  })

  it('keeps vault content away from research subagents', async () => {
    const skill = await researchSkill()
    expect(skill).toMatch(/never vault content/i)
  })
})

describe('the /research-company skill ownership and gating', () => {
  it('writes only dated reports under investments/research/', async () => {
    const skill = await researchSkill()
    expect(skill).toMatch(/investments\/research\/<YYYY-MM-DD>-<ticker>\.md/)
    expect(skill).toMatch(/never write `investments\/strategy\.md`/i)
  })

  it('updates same-ticker-same-date reports instead of duplicating', async () => {
    const skill = await researchSkill()
    expect(skill).toMatch(/updates?\*?\*?[\s\S]{0,60}instead of duplicating/i)
  })

  it('is approve-gated and requires a strategy to exist first', async () => {
    const skill = await researchSkill()
    expect(skill).toMatch(/on approval/i)
    expect(skill).toMatch(/do\s+\*\*not\*\* write anything yet/i)
    expect(skill).toMatch(/\/invest-strategy/)
    expect(skill).toMatch(/write nothing/i)
  })
})

describe('the /research-company skill orchestration and framework', () => {
  it('fans out the five research dimensions in parallel', async () => {
    const skill = await researchSkill()
    expect(skill).toMatch(/five research subagents in parallel/i)
    for (const dimension of ['Business', 'Financials', 'Valuation', 'Moat', 'Risks']) {
      expect(skill).toContain(dimension)
    }
  })

  it('fixes the report framework with frontmatter scores and verdict enum', async () => {
    const skill = await researchSkill()
    expect(skill).toMatch(/verdict: fits-strategy \| mixed \| doesn't-fit \| avoid/)
    for (const key of ['business:', 'financials:', 'valuation:', 'moat:', 'risks:']) {
      expect(skill).toContain(key)
    }
    expect(skill).toMatch(/## TL;DR/)
    expect(skill).toMatch(/## Scorecard/)
    expect(skill).toMatch(/## Strategy fit/)
    expect(skill).toMatch(/## Sources/)
  })

  it('demands citations and skepticism, and forbids buy/sell calls', async () => {
    const skill = await researchSkill()
    expect(skill).toMatch(/inline citation/i)
    expect(skill).toMatch(/disconfirming evidence/i)
    expect(skill).toMatch(/thin evidence lowers/i)
    expect(skill).toMatch(/never\s+says "buy" or "sell"/i)
  })
})
