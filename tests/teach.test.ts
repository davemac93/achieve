import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))

async function teachSkill(): Promise<string> {
  return fs.readFile(
    path.join(repoRoot, 'template', '.claude', 'skills', 'teach', 'SKILL.md'),
    'utf8',
  )
}

/**
 * The Teach skill is Claude-read prose, not code we can intercept — so its hard
 * contracts are guarded at the text level, the same way /note and /cv are: the
 * privacy wall, the sanctioned write path, and the two things it must *not*
 * write (loose `learning` notes, and the dashboard's tick file).
 */
describe('the /teach skill declares its privacy wall', () => {
  it('marks diary and private notes off-limits, in body and description', async () => {
    const skill = await teachSkill()
    expect(skill).toMatch(/`diary\/` is categorically off-limits/i)
    expect(skill).toMatch(/`type: private` notes are human-only/i)
    expect(skill).toMatch(/Never reads the diary or private notes/i)
  })
})

describe('the /teach skill writes topics, not loose notes', () => {
  it('owns learn/<topic>/plan.md and sessions/, through the write script', async () => {
    const skill = await teachSkill()
    expect(skill).toMatch(/learn\/<topic>\/plan\.md/)
    expect(skill).toMatch(/learn\/<topic>\/sessions\//)
    expect(skill).toMatch(/scripts\/write-learn\.ts/)
    expect(skill).toMatch(/never hand-edit `learn\/`/i)
  })

  it('says in so many words that it no longer writes `learning` notes', async () => {
    const skill = await teachSkill()
    expect(skill).toMatch(/no longer write `learning` notes/i)
    // The old write path is gone — a session must not become a note again.
    expect(skill).not.toMatch(/scripts\/write-note\.ts/)
    expect(skill).not.toMatch(/"type":\s*"learning"/)
  })

  it('leaves ticking (and therefore evidence) to the user in the dashboard', async () => {
    const skill = await teachSkill()
    expect(skill).toMatch(/`learn\/status\.yaml` is the dashboard's/i)
    expect(skill).toMatch(/[Nn]ever tick a curriculum item/)
    expect(skill).toMatch(/never write evidence/i)
  })

  it('requires a reason for every topic, and no typed progress', async () => {
    const skill = await teachSkill()
    expect(skill).toMatch(/\*\*`why` is required\*\*/)
    expect(skill).toMatch(/[Nn]ever write a progress number/)
  })
})
