import { execFileSync } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { openVault } from '../lib/vault/index.ts'
import { getIndexableDocuments } from '../lib/search/corpus.ts'

function git(cwd: string, args: string[]): void {
  execFileSync('git', args, { cwd, encoding: 'utf8' })
}

async function writeFile(dir: string, relPath: string, content: string): Promise<void> {
  const target = path.join(dir, relPath)
  await fs.mkdir(path.dirname(target), { recursive: true })
  await fs.writeFile(target, content, 'utf8')
}

describe('getIndexableDocuments — the search index privacy filter', () => {
  let dir: string

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'achieve-searchcorpus-'))
    git(dir, ['init', '-q'])

    await writeFile(
      dir,
      'notes/kafka-tuning.md',
      '---\ntitle: Kafka tuning\ntype: working\n---\n\nBumped retention to 7 days.\n',
    )
    await writeFile(
      dir,
      'notes/therapy-thoughts.md',
      '---\ntitle: Therapy thoughts\ntype: private\n---\n\nHuman-only reflection.\n',
    )
    await writeFile(
      dir,
      'projects/streaming.md',
      '---\ntitle: Streaming platform\n---\n\nA public project write-up.\n',
    )
    await writeFile(
      dir,
      'projects/move-house.md',
      '---\ntitle: Move house\nstatus: private\n---\n\nSensitive relocation details.\n',
    )
    // Diary content — must never be read by this module, even though it
    // exists on disk right alongside everything else.
    await writeFile(dir, 'diary/2026-07-06.md', 'Deeply personal diary entry.\n')
  })

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true })
  })

  it('includes public notes and projects, excludes private ones and diary entirely', async () => {
    const vault = openVault(dir)
    const docs = await getIndexableDocuments(vault)

    const slugs = docs.map((d) => `${d.source}/${d.slug}`).sort()
    expect(slugs).toEqual(['notes/kafka-tuning', 'projects/streaming'])

    const allBodies = docs.map((d) => d.body).join(' ')
    expect(allBodies).not.toContain('Human-only reflection')
    expect(allBodies).not.toContain('Sensitive relocation details')
    expect(allBodies).not.toContain('Deeply personal diary entry')
  })

  it('never lists or reads the diary directory', async () => {
    const vault = openVault(dir)
    const originalRead = vault.read.bind(vault)
    const readPaths: string[] = []
    vault.read = (async (relPath: string) => {
      readPaths.push(relPath)
      return originalRead(relPath)
    }) as typeof vault.read

    await getIndexableDocuments(vault)

    expect(readPaths.every((p) => !p.startsWith('diary/'))).toBe(true)
  })

  it('returns an empty list for a vault with no notes or projects yet', async () => {
    const emptyDir = await fs.mkdtemp(path.join(os.tmpdir(), 'achieve-searchcorpus-empty-'))
    git(emptyDir, ['init', '-q'])
    try {
      const vault = openVault(emptyDir)
      expect(await getIndexableDocuments(vault)).toEqual([])
    } finally {
      await fs.rm(emptyDir, { recursive: true, force: true })
    }
  })
})
