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
 * The Teach skill is Claude-read prose, not code we can intercept — so we guard
 * its two hard contracts at the text level, the same way the /note skill is
 * guarded: it must declare the privacy wall, and it must write through the
 * shared /note write path rather than inventing a second writer.
 */
describe('the /teach skill declares its privacy wall', () => {
  it('marks diary and private notes off-limits, in body and description', async () => {
    const skill = await teachSkill()
    expect(skill).toMatch(/`diary\/` is categorically off-limits/i)
    expect(skill).toMatch(/`type: private` notes are human-only/i)
    expect(skill).toMatch(/Never reads the diary or private notes/i)
  })

  it('is grounded in learning notes + user.md, not other note types', async () => {
    const skill = await teachSkill()
    expect(skill).toMatch(/`learning`/)
    expect(skill).toMatch(/user\.md/)
  })
})

describe('the /teach skill reuses the /note write path', () => {
  it('writes new learning notes via scripts/write-note.ts with type: learning', async () => {
    const skill = await teachSkill()
    expect(skill).toMatch(/scripts\/write-note\.ts/)
    expect(skill).toMatch(/"type":\s*"learning"/)
    // It must not claim to hand-edit notes/ directly.
    expect(skill).toMatch(/never hand-edit/i)
  })
})
