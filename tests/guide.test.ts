import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { getGuideProgress } from '../lib/dashboard/guide.ts'

/** Write a vault-relative file, creating parent dirs. Reads never commit, so
 * the throwaway vault doesn't need to be a git repo. */
async function put(dir: string, rel: string, content: string): Promise<void> {
  const abs = path.join(dir, rel)
  await fs.mkdir(path.dirname(abs), { recursive: true })
  await fs.writeFile(abs, content)
}

describe('guide progress derives from what exists in the vault', () => {
  let dir: string

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'achieve-guide-'))
    process.env.ACHIEVE_VAULT_DIR = dir
  })

  afterEach(async () => {
    delete process.env.ACHIEVE_VAULT_DIR
    await fs.rm(dir, { recursive: true, force: true })
  })

  it('an empty vault has every step unchecked (and does not crash)', async () => {
    const progress = await getGuideProgress()
    expect(Object.values(progress).every((v) => v === false)).toBe(true)
  })

  it('the untouched template profile counts as vault-ready but not filled', async () => {
    await put(dir, 'user.md', '# User profile\n\n_A few lines: name, what you do._\n')
    const progress = await getGuideProgress()
    expect(progress.vaultReady).toBe(true)
    expect(progress.profileFilled).toBe(false)
  })

  it('a personalized profile counts as filled', async () => {
    await put(dir, 'user.md', '# User profile\n\nDawid — building a personal OS.\n')
    const progress = await getGuideProgress()
    expect(progress.profileFilled).toBe(true)
  })

  it('each artifact flips exactly its own flag', async () => {
    await put(
      dir,
      'goals.yaml',
      'goals:\n  - id: g1\n    horizon: weekly\n    title: Ship it\n',
    )
    await put(
      dir,
      'tasks.yaml',
      'tasks:\n  - id: t1\n    title: Do it\n    done: false\n    created: 2026-07-13T00:00:00Z\n',
    )
    await put(dir, 'quotes.yaml', 'quotes:\n  - text: Onward\ncurrent: 0\n')
    await put(dir, 'diary/2026-07-13.md', 'human-only\n')
    await put(dir, 'notes/first.md', '---\ntitle: First\ntype: working\n---\n\nBody.\n')
    await put(dir, 'projects/os.md', '# Personal OS\n')
    await put(
      dir,
      'investments.yaml',
      'holdings:\n  - id: h1\n    ticker: VWCE.DE\n    name: Vanguard\n    assetType: etf\n    account: IKE\n    shares: 1\n    avgCost: 500\n    quoteCurrency: EUR\n',
    )
    await put(dir, 'investments/strategy.md', '# Strategy\n')
    await put(dir, 'investments/research/2026-07-13-vwce.md', '# VWCE\n')
    await put(dir, 'reviews/weekly/2026-07-13.md', '# Review\n')

    const progress = await getGuideProgress()
    expect(progress).toEqual({
      vaultReady: false, // no user.md written in this case
      profileFilled: false,
      hasGoals: true,
      hasTasks: true,
      hasQuote: true,
      hasDiaryEntry: true,
      hasNotes: true,
      hasProjects: true,
      hasHoldings: true,
      hasStrategy: true,
      hasResearch: true,
      hasReview: true,
    })
  })
})
