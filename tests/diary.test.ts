import { execFileSync } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Server actions revalidate the Next.js router cache; stub it for unit tests.
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))

import { saveDiaryEntryAction } from '../app/actions.ts'
import { getDiaryEntry, listDiaryDates, saveDiaryEntry } from '../lib/dashboard/diary.ts'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))

function git(cwd: string, args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' })
}

async function makeVaultRepo(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'achieve-diary-'))
  git(dir, ['init', '-q'])
  git(dir, ['config', 'user.name', 'test'])
  git(dir, ['config', 'user.email', 'test@localhost'])
  return dir
}

function form(fields: Record<string, string>): FormData {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) fd.set(k, v)
  return fd
}

function lastCommitSubject(dir: string): string {
  return git(dir, ['log', '-1', '--format=%s']).trim()
}

describe('diary entries are written as dated files', () => {
  let dir: string

  beforeEach(async () => {
    dir = await makeVaultRepo()
    process.env.ACHIEVE_VAULT_DIR = dir
  })

  afterEach(async () => {
    delete process.env.ACHIEVE_VAULT_DIR
    await fs.rm(dir, { recursive: true, force: true })
  })

  it('saves an entry as diary/<YYYY-MM-DD>.md with a labeled commit', async () => {
    await saveDiaryEntryAction(
      form({ date: '2026-06-25', content: 'A quiet, honest day.' }),
    )

    const onDisk = await fs.readFile(path.join(dir, 'diary', '2026-06-25.md'), 'utf8')
    expect(onDisk).toBe('A quiet, honest day.\n')
    expect(lastCommitSubject(dir)).toBe('dashboard: write diary entry')
    expect(await listDiaryDates()).toEqual(['2026-06-25'])
  })

  it('overwrites the same day and lists newest-first', async () => {
    await saveDiaryEntry('2026-06-24', 'first')
    await saveDiaryEntry('2026-06-25', 'second')
    await saveDiaryEntry('2026-06-24', 'edited')

    expect(await getDiaryEntry('2026-06-24')).toBe('edited\n')
    expect(await listDiaryDates()).toEqual(['2026-06-25', '2026-06-24'])
  })

  it('clearing the body removes that day’s file', async () => {
    await saveDiaryEntry('2026-06-25', 'to be deleted')
    await saveDiaryEntry('2026-06-25', '   ')

    expect(await getDiaryEntry('2026-06-25')).toBeNull()
    expect(lastCommitSubject(dir)).toBe('dashboard: delete diary entry')
  })

  it('rejects a date that is not YYYY-MM-DD (no path escapes)', async () => {
    await expect(saveDiaryEntry('../escape', 'x')).rejects.toThrow(/Invalid diary date/)
    await expect(saveDiaryEntry('2026-6-1', 'x')).rejects.toThrow(/Invalid diary date/)
  })
})

/**
 * The privacy wall (template/CLAUDE.md) makes `diary/` categorically off-limits
 * to every AI agent and skill. Skills are Claude-read instructions, not code we
 * can intercept — so we guard the boundary at its code-level proxies:
 *
 *   1. The ONLY module under lib/ that may touch the diary directory is the
 *      sanctioned dashboard module. Anything else reaching into `diary/` (a
 *      future context builder, a user.md generator, ...) trips this test.
 *   2. The auto-loaded vault context must not import the diary, and must carry
 *      the "never a source for user.md/CLAUDE.md" contract.
 */
describe('privacy wall: nothing else may read the diary', () => {
  // A string/path literal that names the diary directory, e.g. "diary" or
  // "diary/2026-06-25.md" — i.e. actual diary access, not the word in prose.
  const DIARY_PATH = /(["'`])diary(\/[^"'`]*)?\1/

  const SANCTIONED = path.join('lib', 'dashboard', 'diary.ts')

  async function walk(dir: string): Promise<string[]> {
    const out: string[] = []
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) out.push(...(await walk(full)))
      else if (entry.isFile() && /\.tsx?$/.test(entry.name)) out.push(full)
    }
    return out
  }

  it('detector sanity: the sanctioned module does reference the diary path', async () => {
    const src = await fs.readFile(path.join(repoRoot, SANCTIONED), 'utf8')
    expect(DIARY_PATH.test(src)).toBe(true)
  })

  it('no other lib/ module accesses the diary directory', async () => {
    const files = await walk(path.join(repoRoot, 'lib'))
    const offenders: string[] = []
    for (const file of files) {
      const rel = path.relative(repoRoot, file)
      if (rel === SANCTIONED) continue
      if (DIARY_PATH.test(await fs.readFile(file, 'utf8'))) offenders.push(rel)
    }
    expect(offenders).toEqual([])
  })

  it('the auto-loaded vault context imports user.md but never the diary', async () => {
    const claudeMd = await fs.readFile(
      path.join(repoRoot, 'template', 'CLAUDE.md'),
      'utf8',
    )
    expect(claudeMd).toMatch(/@user\.md/)
    // No `@diary...` import would pull diary content into agent context.
    expect(claudeMd).not.toMatch(/@\s*diary/)
    expect(claudeMd).toMatch(/off-limits to every AI agent and skill/i)
    expect(claudeMd).toMatch(/Diary content must never enter this file or `user\.md`/)
  })

  it('the user.md template marks the diary as never a source', async () => {
    const userMd = await fs.readFile(path.join(repoRoot, 'template', 'user.md'), 'utf8')
    expect(userMd).toMatch(/diary is NEVER a source/i)
  })
})
