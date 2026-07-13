import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))
const skillsDir = path.join(repoRoot, 'template', '.claude', 'skills')

/**
 * The skill model/effort tiering policy: heavy-reasoning skills pin the
 * strongest model; mechanical skills run cheap. `model: undefined` means the
 * skill inherits the session model on purpose. Every skill in the template
 * must appear here — a new skill without a deliberate tier fails the suite.
 */
const TIERING: Record<string, { model?: string; effort: string }> = {
  'validate-idea': { model: 'opus', effort: 'high' },
  'improve-process': { model: 'opus', effort: 'high' },
  goals: { model: 'opus', effort: 'high' },
  'invest-strategy': { model: 'opus', effort: 'high' },
  review: { effort: 'medium' },
  teach: { effort: 'medium' },
  profile: { effort: 'medium' },
  note: { model: 'sonnet', effort: 'low' },
  'search-vault': { effort: 'low' },
  'research-company': { model: 'opus', effort: 'high' },
}

/** Skills that take an argument and must hint it in the / menu. */
const NEEDS_ARGUMENT_HINT = ['note', 'teach', 'validate-idea', 'improve-process']

/** Skills whose sanctioned write path is pre-approved, and nothing else. */
const WRITE_NOTE_ALLOWED = ['note', 'teach']

async function skillNames(): Promise<string[]> {
  const entries = await fs.readdir(skillsDir, { withFileTypes: true })
  return entries.filter((e) => e.isDirectory()).map((e) => e.name).sort()
}

async function frontmatter(name: string): Promise<Record<string, unknown>> {
  const text = await fs.readFile(path.join(skillsDir, name, 'SKILL.md'), 'utf8')
  const block = text.match(/^---\n([\s\S]*?)\n---/)?.[1]
  expect(block, `${name}/SKILL.md must start with frontmatter`).toBeTruthy()
  return parse(block!) as Record<string, unknown>
}

describe('skill model/effort tiering', () => {
  it('every template skill has a deliberate tier in the policy table', async () => {
    const names = await skillNames()
    // Both directions: no untiered skill ships, no stale table entry lingers.
    expect(names.filter((n) => !(n in TIERING))).toEqual([])
    expect(Object.keys(TIERING).filter((n) => !names.includes(n))).toEqual([])
  })

  it('each skill frontmatter matches its tier', async () => {
    for (const name of await skillNames()) {
      const fm = await frontmatter(name)
      const tier = TIERING[name]!
      expect(fm.model, `${name}: model`).toBe(tier.model)
      expect(fm.effort, `${name}: effort`).toBe(tier.effort)
    }
  })
})

describe('skill frontmatter polish', () => {
  it('argument-taking skills hint their arguments', async () => {
    for (const name of NEEDS_ARGUMENT_HINT) {
      const fm = await frontmatter(name)
      expect(fm['argument-hint'], `${name}: argument-hint`).toBeTruthy()
    }
  })

  it('note and teach pre-approve exactly the write-note script', async () => {
    for (const name of await skillNames()) {
      const fm = await frontmatter(name)
      if (WRITE_NOTE_ALLOWED.includes(name)) {
        expect(fm['allowed-tools']).toBe('Bash(node scripts/write-note.ts *)')
      } else {
        // No other skill gets pre-approved tools — approval friction is the
        // safety mechanism everywhere else.
        expect(fm['allowed-tools'], `${name}: allowed-tools`).toBeUndefined()
      }
    }
  })
})

describe('the diary privacy wall is enforced, not just prose', () => {
  it('template settings.json denies reading diary/ for every agent', async () => {
    const raw = await fs.readFile(
      path.join(repoRoot, 'template', '.claude', 'settings.json'),
      'utf8',
    )
    const settings = JSON.parse(raw) as {
      permissions?: { deny?: string[] }
    }
    expect(settings.permissions?.deny).toContain('Read(./diary/**)')
  })
})
