import { execFileSync } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { openVault } from '../lib/vault/index.ts'
import { buildNoteFile, slugify, writeNote, NOTE_TYPES } from '../lib/dashboard/note-content.ts'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))

function git(cwd: string, args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' })
}

async function makeVaultRepo(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'achieve-note-'))
  git(dir, ['init', '-q'])
  git(dir, ['config', 'user.name', 'test'])
  git(dir, ['config', 'user.email', 'test@localhost'])
  return dir
}

function commitCount(dir: string): number {
  // `--all` counts commits across all refs, returning 0 on a fresh repo with no
  // HEAD yet (where `rev-list HEAD` would error).
  return Number(git(dir, ['rev-list', '--count', '--all']).trim())
}

function lastCommitSubject(dir: string): string {
  return git(dir, ['log', '-1', '--format=%s']).trim()
}

describe('buildNoteFile composes schema-valid note markdown', () => {
  const created = '2026-07-06T10:00:00.000Z'

  it('emits frontmatter (title, type, tags, project, created) then body', () => {
    const md = buildNoteFile(
      {
        title: 'Kafka retention tuning',
        type: 'working',
        tags: ['infra', 'kafka'],
        project: 'streaming',
        body: 'Bumped retention to 7d; watch disk.',
      },
      created,
    )
    expect(md).toMatch(/^---\n/)
    expect(md).toContain('title: Kafka retention tuning')
    expect(md).toContain('type: working')
    expect(md).toContain('- infra')
    expect(md).toContain('project: streaming')
    expect(md).toContain(`created: ${created}`)
    expect(md.trimEnd().endsWith('Bumped retention to 7d; watch disk.')).toBe(true)
  })

  it('omits tags and project when absent', () => {
    const md = buildNoteFile({ title: 'Quick thought', type: 'working', body: 'x' }, created)
    expect(md).not.toContain('tags:')
    expect(md).not.toContain('project:')
  })

  it('requires a title and a type', () => {
    expect(() => buildNoteFile({ title: '  ', type: 'working', body: 'x' }, created)).toThrow(
      /needs a title/,
    )
    expect(() => buildNoteFile({ title: 'ok', type: '', body: 'x' }, created)).toThrow(
      /needs a type/,
    )
  })

  it('slugifies titles safely', () => {
    expect(slugify('Kafka retention tuning!')).toBe('kafka-retention-tuning')
    expect(slugify('  @@@  ')).toBe('note')
  })

  it('documents the current note-type set with private load-bearing', () => {
    expect(NOTE_TYPES).toContain('private')
    expect(NOTE_TYPES).toContain('learning')
  })
})

describe('writeNote: the /note file-effect contract', () => {
  let dir: string

  beforeEach(async () => {
    dir = await makeVaultRepo()
    process.env.ACHIEVE_VAULT_DIR = dir
  })

  afterEach(async () => {
    delete process.env.ACHIEVE_VAULT_DIR
    await fs.rm(dir, { recursive: true, force: true })
  })

  it('lands a schema-valid note in notes/ with exactly one labeled commit', async () => {
    const vault = openVault()
    const before = commitCount(dir)

    const { slug, relPath } = await writeNote(
      vault,
      { title: 'First note', type: 'working', tags: ['a'], body: 'hello' },
      '2026-07-06T10:00:00.000Z',
    )

    expect(slug).toBe('first-note')
    expect(relPath).toBe('notes/first-note.md')
    const onDisk = await fs.readFile(path.join(dir, relPath), 'utf8')
    expect(onDisk).toContain('type: working')
    expect(onDisk).toContain('created: 2026-07-06T10:00:00.000Z')
    expect(onDisk.trimEnd().endsWith('hello')).toBe(true)

    // Exactly one commit resulted, and it is labeled for the /note writer.
    expect(Number(commitCount(dir)) - Number(before)).toBe(1)
    expect(lastCommitSubject(dir)).toBe('/note: add first-note')
  })

  it('disambiguates a colliding slug instead of clobbering', async () => {
    const vault = openVault()
    await writeNote(vault, { title: 'Dup', type: 'working', body: 'one' }, '2026-07-06T10:00:00.000Z')
    const second = await writeNote(
      vault,
      { title: 'Dup', type: 'working', body: 'two' },
      '2026-07-06T11:00:00.000Z',
    )
    expect(second.slug).toBe('dup-2')
    expect(await fs.readFile(path.join(dir, 'notes', 'dup.md'), 'utf8')).toContain('one')
    expect(await fs.readFile(path.join(dir, 'notes', 'dup-2.md'), 'utf8')).toContain('two')
  })

  it('the write path never reaches into the diary (privacy wall)', async () => {
    // The note write path is code we can guard: it must not name the diary dir.
    // (The lib-wide diary guard in diary.test.ts also covers note-content.ts.)
    const src = await fs.readFile(
      path.join(repoRoot, 'lib', 'dashboard', 'note-content.ts'),
      'utf8',
    )
    expect(/(["'`])diary(\/[^"'`]*)?\1/.test(src)).toBe(false)
  })
})

describe('privacy wall: the /note skill declares diary/private off-limits', () => {
  it('the SKILL.md carries the non-negotiable privacy wall', async () => {
    const skill = await fs.readFile(
      path.join(repoRoot, 'template', '.claude', 'skills', 'note', 'SKILL.md'),
      'utf8',
    )
    expect(skill).toMatch(/`diary\/` is categorically off-limits/i)
    expect(skill).toMatch(/`type: private` notes are human-only/i)
    // The frontmatter description also warns it off the diary/private notes.
    expect(skill).toMatch(/Never reads the diary or private notes/i)
  })
})
