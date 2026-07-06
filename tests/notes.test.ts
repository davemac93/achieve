import { execFileSync } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The data layer imports `server-only`; vitest aliases it to a no-op.
import { getNote, getNotes, getPublicNotes } from '../lib/dashboard/notes.ts'

function git(cwd: string, args: string[]): void {
  execFileSync('git', args, { cwd, encoding: 'utf8' })
}

async function makeVault(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'achieve-notesview-'))
  git(dir, ['init', '-q'])
  await fs.mkdir(path.join(dir, 'notes'), { recursive: true })
  return dir
}

async function writeNoteFile(
  dir: string,
  slug: string,
  frontmatter: string,
  body: string,
): Promise<void> {
  await fs.writeFile(
    path.join(dir, 'notes', `${slug}.md`),
    `---\n${frontmatter}\n---\n\n${body}\n`,
    'utf8',
  )
}

describe('notes read layer for the dashboard views', () => {
  let dir: string

  beforeEach(async () => {
    dir = await makeVault()
    process.env.ACHIEVE_VAULT_DIR = dir
    await writeNoteFile(
      dir,
      'kafka-tuning',
      'title: Kafka tuning\ntype: working\ntags: [infra, kafka]\nproject: streaming\ncreated: 2026-07-05T09:00:00.000Z',
      'Bumped retention to 7d.\nWatch disk headroom.',
    )
    await writeNoteFile(
      dir,
      'reading-list',
      'title: Reading list\ntype: learning\ncreated: 2026-07-06T09:00:00.000Z',
      'Books to read.',
    )
    await writeNoteFile(
      dir,
      'therapy-thoughts',
      'title: Therapy thoughts\ntype: private\ncreated: 2026-07-04T09:00:00.000Z',
      'Human-only reflection.',
    )
  })

  afterEach(async () => {
    delete process.env.ACHIEVE_VAULT_DIR
    await fs.rm(dir, { recursive: true, force: true })
  })

  it('lists all notes newest-first, including private (the human’s own surface)', async () => {
    const notes = await getNotes()
    expect(notes.map((n) => n.slug)).toEqual([
      'reading-list',
      'kafka-tuning',
      'therapy-thoughts',
    ])
    expect(notes.some((n) => n.type === 'private')).toBe(true)
  })

  it('getPublicNotes excludes private — the agent boundary', async () => {
    const notes = await getPublicNotes()
    expect(notes.some((n) => n.type === 'private')).toBe(false)
    expect(notes).toHaveLength(2)
  })

  it('exposes the type facets used by the filter', async () => {
    const types = Array.from(new Set((await getNotes()).map((n) => n.type)))
    expect(types.sort()).toEqual(['learning', 'private', 'working'])
  })

  it('getNote returns frontmatter fields plus the body', async () => {
    const note = await getNote('kafka-tuning')
    expect(note).not.toBeNull()
    expect(note!.title).toBe('Kafka tuning')
    expect(note!.type).toBe('working')
    expect(note!.tags).toEqual(['infra', 'kafka'])
    expect(note!.project).toBe('streaming')
    expect(note!.body.trim()).toBe('Bumped retention to 7d.\nWatch disk headroom.')
  })

  it('getNote can read a private note for the human (dashboard is human-facing)', async () => {
    const note = await getNote('therapy-thoughts')
    expect(note?.type).toBe('private')
    expect(note?.body).toContain('Human-only reflection.')
  })

  it('getNote returns null for a missing note', async () => {
    expect(await getNote('does-not-exist')).toBeNull()
  })

  it('getNote rejects slugs that could escape the notes directory', async () => {
    expect(await getNote('../diary/2026-07-06')).toBeNull()
    expect(await getNote('..')).toBeNull()
  })
})
