import { execFileSync } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/cache', () => ({ revalidatePath: () => {} }))

import { saveProfileAction } from '../app/actions.ts'
import { getProfile, getProfileSources, saveProfile } from '../lib/dashboard/profile.ts'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))
const SKILL = path.join(repoRoot, 'template', '.claude', 'skills', 'profile', 'SKILL.md')

function git(cwd: string, args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' })
}

async function makeVaultRepo(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'achieve-profile-'))
  git(dir, ['init', '-q'])
  git(dir, ['config', 'user.name', 'test'])
  git(dir, ['config', 'user.email', 'test@localhost'])
  return dir
}

async function write(dir: string, rel: string, content: string): Promise<void> {
  const full = path.join(dir, rel)
  await fs.mkdir(path.dirname(full), { recursive: true })
  await fs.writeFile(full, content, 'utf8')
}

describe('dashboard profile editing persists to user.md', () => {
  let dir: string

  beforeEach(async () => {
    dir = await makeVaultRepo()
    process.env.ACHIEVE_VAULT_DIR = dir
  })

  afterEach(async () => {
    delete process.env.ACHIEVE_VAULT_DIR
    await fs.rm(dir, { recursive: true, force: true })
  })

  it('saves edited content to user.md with a labeled commit', async () => {
    const fd = new FormData()
    fd.set('content', '# User profile\n\nI build local-first tools.')
    await saveProfileAction(fd)

    expect(await fs.readFile(path.join(dir, 'user.md'), 'utf8')).toBe(
      '# User profile\n\nI build local-first tools.\n',
    )
    expect(git(dir, ['log', '-1', '--format=%s']).trim()).toBe('dashboard: edit profile')
    expect(await getProfile()).toContain('local-first tools')
  })

  it('rejects an empty profile', async () => {
    await expect(saveProfile('   \n  ')).rejects.toThrow(/must not be empty/)
  })
})

describe('profile sources never include the diary or private notes', () => {
  let dir: string

  beforeEach(async () => {
    dir = await makeVaultRepo()
    process.env.ACHIEVE_VAULT_DIR = dir
  })

  afterEach(async () => {
    delete process.env.ACHIEVE_VAULT_DIR
    await fs.rm(dir, { recursive: true, force: true })
  })

  it('gathers goals, projects, and non-private notes only', async () => {
    await write(dir, 'goals.yaml', 'goals:\n  - id: y1\n    horizon: yearly\n    title: Ship v1\n')
    await write(dir, 'projects/achieve.md', '---\ntitle: achieve\n---\nA personal OS.\n')
    await write(dir, 'notes/public.md', '---\ntitle: Public note\ntype: learning\n---\nFine to read.\n')
    await write(
      dir,
      'notes/secret.md',
      '---\ntitle: Secret note\ntype: private\n---\nMUST_NOT_LEAK secret detail.\n',
    )
    await write(dir, 'diary/2026-06-25.md', 'DIARY_SECRET very private feelings.\n')

    const sources = await getProfileSources()

    expect(sources.goals.map((g) => g.title)).toEqual(['Ship v1'])
    expect(sources.projects.map((p) => p.title)).toEqual(['achieve'])

    // The public note is in; the private one is categorically excluded.
    const noteTitles = sources.notes.map((n) => n.title)
    expect(noteTitles).toContain('Public note')
    expect(noteTitles).not.toContain('Secret note')

    // Nothing diary- or private-derived anywhere in the gathered material.
    const serialized = JSON.stringify(sources)
    expect(serialized).not.toMatch(/DIARY_SECRET/)
    expect(serialized).not.toMatch(/MUST_NOT_LEAK/)
    expect(serialized).not.toMatch(/diary/)
  })
})

describe('/profile skill definition declares the privacy wall', () => {
  it('ships a SKILL.md scaffolded into the vault', async () => {
    expect(await fs.stat(SKILL).then((s) => s.isFile())).toBe(true)
  })

  it('is approve-gated and forbids diary + private notes', async () => {
    const skill = await fs.readFile(SKILL, 'utf8')
    // Approve gate: must propose and wait for approval before writing.
    expect(skill).toMatch(/approv/i)
    expect(skill).toMatch(/never write without approval/i)
    // Privacy wall: explicit prohibitions on diary and private notes.
    expect(skill).toMatch(/diary\/?` is categorically off-limits/i)
    expect(skill).toMatch(/`type: private` notes are human-only/i)
    // Writes only user.md.
    expect(skill).toMatch(/write exactly one file: `user\.md`/i)
  })
})
