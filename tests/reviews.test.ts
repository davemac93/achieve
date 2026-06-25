import { execFileSync } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { getReviewStatus } from '../lib/dashboard/reviews.ts'
import {
  daysBetween,
  isWeeklyReviewDue,
  todayKey,
} from '../lib/dashboard/review-schedule.ts'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))
const SCRIPT = path.join(repoRoot, 'scripts', 'review-due.ts')
const SKILL = path.join(repoRoot, 'template', '.claude', 'skills', 'review', 'SKILL.md')

async function makeVault(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'achieve-review-'))
}

async function writeReview(dir: string, date: string): Promise<void> {
  const full = path.join(dir, 'reviews', 'weekly')
  await fs.mkdir(full, { recursive: true })
  await fs.writeFile(path.join(full, `${date}.md`), `# Weekly review — ${date}\n`, 'utf8')
}

function runScript(dir: string): { code: number; stdout: string } {
  try {
    const stdout = execFileSync('node', [SCRIPT], {
      cwd: repoRoot,
      env: { ...process.env, ACHIEVE_VAULT_DIR: dir },
      encoding: 'utf8',
    })
    return { code: 0, stdout }
  } catch (err) {
    const e = err as { status?: number; stdout?: string }
    return { code: e.status ?? 1, stdout: e.stdout ?? '' }
  }
}

describe('isWeeklyReviewDue', () => {
  it('is due when there has never been a review', () => {
    expect(isWeeklyReviewDue(null, '2026-06-25')).toBe(true)
  })

  it('is not due the day a review was logged', () => {
    expect(isWeeklyReviewDue('2026-06-25', '2026-06-25')).toBe(false)
  })

  it('is not due before the cadence elapses', () => {
    expect(isWeeklyReviewDue('2026-06-19', '2026-06-25')).toBe(false) // 6 days
  })

  it('is due once the cadence is reached or passed', () => {
    expect(isWeeklyReviewDue('2026-06-18', '2026-06-25')).toBe(true) // 7 days
    expect(isWeeklyReviewDue('2026-06-01', '2026-06-25')).toBe(true)
  })

  it('treats a malformed last date as never-reviewed (fails safe)', () => {
    expect(isWeeklyReviewDue('not-a-date', '2026-06-25')).toBe(true)
  })

  it('counts whole days across a month boundary', () => {
    expect(daysBetween('2026-05-31', '2026-06-07')).toBe(7)
  })
})

describe('getReviewStatus reads reviews/weekly', () => {
  let dir: string
  const now = new Date(2026, 5, 25) // 2026-06-25 local

  beforeEach(async () => {
    dir = await makeVault()
    process.env.ACHIEVE_VAULT_DIR = dir
  })

  afterEach(async () => {
    delete process.env.ACHIEVE_VAULT_DIR
    await fs.rm(dir, { recursive: true, force: true })
  })

  it('reports due with no last date when no review exists', async () => {
    expect(await getReviewStatus(now)).toEqual({ lastReviewDate: null, due: true })
  })

  it('uses the newest review and reports not-due when it is recent', async () => {
    await writeReview(dir, '2026-06-01')
    await writeReview(dir, '2026-06-20')
    expect(await getReviewStatus(now)).toEqual({ lastReviewDate: '2026-06-20', due: false })
  })

  it('reports due when the newest review is older than a week', async () => {
    await writeReview(dir, '2026-06-10') // 15 days before "now"
    expect(await getReviewStatus(now)).toEqual({ lastReviewDate: '2026-06-10', due: true })
  })
})

describe('review-due script', () => {
  let dir: string

  beforeEach(async () => {
    dir = await makeVault()
  })

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true })
  })

  it('exits 0 and reports DUE when no review exists', () => {
    const { code, stdout } = runScript(dir)
    expect(code).toBe(0)
    expect(stdout).toMatch(/DUE/)
  })

  it('exits 1 when a review was logged today', async () => {
    // A review dated today is always within the cadence, regardless of run date.
    await writeReview(dir, todayKey())
    const { code, stdout } = runScript(dir)
    expect(code).toBe(1)
    expect(stdout).toMatch(/not due/i)
  })
})

describe('/review skill definition declares its contract', () => {
  it('ships a SKILL.md scaffolded into the vault', async () => {
    expect(await fs.stat(SKILL).then((s) => s.isFile())).toBe(true)
  })

  it('writes only reviews/weekly, references tasks and goals, and never reads the diary', async () => {
    const skill = await fs.readFile(SKILL, 'utf8')
    // Output location.
    expect(skill).toMatch(/reviews\/weekly\/<YYYY-MM-DD>\.md/)
    // Grounded in goals + tasks.
    expect(skill).toMatch(/goals\.yaml/)
    expect(skill).toMatch(/tasks\.yaml/)
    // Privacy wall — does not read the diary.
    expect(skill).toMatch(/`diary\/` is categorically off-limits/i)
    expect(skill).toMatch(/`type: private` notes are human-only/i)
  })
})
