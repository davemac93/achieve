import { execFileSync } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { openVault } from '../lib/vault/index.ts'
import { getNotes, getPublicNotes } from '../lib/dashboard/notes.ts'
import { buildSearchIndex, defaultIndexPath } from '../lib/search/build.ts'
import { queryVault } from '../lib/search/query.ts'
import { EMBEDDING_DIMENSIONS, type Embedder } from '../lib/search/embeddings.ts'

function git(cwd: string, args: string[]): void {
  execFileSync('git', args, { cwd, encoding: 'utf8' })
}

async function writeFile(dir: string, relPath: string, content: string): Promise<void> {
  const target = path.join(dir, relPath)
  await fs.mkdir(path.dirname(target), { recursive: true })
  await fs.writeFile(target, content, 'utf8')
}

/**
 * Deterministic hashing-vectorizer "embedding" — no network, no model load.
 * Distinct vocabularies land in mostly-disjoint dimensions, so cosine/L2
 * ranking behaves sensibly for a small, distinctly-worded test corpus,
 * without depending on the real local model in the test suite.
 */
const fakeEmbed: Embedder = async (texts) => {
  return texts.map((text) => {
    const vec = new Float32Array(EMBEDDING_DIMENSIONS)
    for (const word of text.toLowerCase().match(/[a-z0-9]+/g) ?? []) {
      let hash = 0
      for (const ch of word) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0
      vec[hash % EMBEDDING_DIMENSIONS]! += 1
    }
    const norm = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0)) || 1
    for (let i = 0; i < vec.length; i++) vec[i] = vec[i]! / norm
    return vec
  })
}

describe('search index — build + query pipeline', () => {
  let dir: string

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'achieve-searchindex-'))
    git(dir, ['init', '-q'])

    await writeFile(
      dir,
      'notes/kubernetes-scaling.md',
      '---\ntitle: Kubernetes scaling notes\ntype: working\n---\n\n' +
        'Kubernetes deployment scaling: bumped pod replicas and tuned the ' +
        'horizontal pod autoscaler thresholds for the streaming service.\n',
    )
    await writeFile(
      dir,
      'notes/sourdough-recipe.md',
      '---\ntitle: Sourdough recipe\ntype: learning\n---\n\n' +
        'Sourdough bread recipe: increase hydration and extend the bulk ' +
        'fermentation time for a more open crumb.\n',
    )
    await writeFile(
      dir,
      'notes/therapy-thoughts.md',
      '---\ntitle: Therapy thoughts\ntype: private\n---\n\n' +
        'Kubernetes pods and deployments, mentioned here only to check the ' +
        'privacy wall — this must never be returned by search.\n',
    )
    await writeFile(dir, 'diary/2026-07-06.md', 'Kubernetes pods diary entry.\n')
  })

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true })
  })

  it('indexes public notes and finds the semantically relevant one', async () => {
    const vault = openVault(dir)
    const dbPath = defaultIndexPath(vault)

    const result = await buildSearchIndex(vault, dbPath, fakeEmbed)
    expect(result.documents).toBe(2) // the private note is excluded

    const hits = await queryVault(dbPath, 'how do I scale pods in a kubernetes deployment', {
      embed: fakeEmbed,
      k: 2,
    })

    expect(hits.length).toBeGreaterThan(0)
    expect(hits[0]!.slug).toBe('kubernetes-scaling')
    expect(hits.some((h) => h.slug === 'therapy-thoughts')).toBe(false)
  })

  it('never returns chunks from private notes or the diary', async () => {
    const vault = openVault(dir)
    const dbPath = defaultIndexPath(vault)
    await buildSearchIndex(vault, dbPath, fakeEmbed)

    const hits = await queryVault(dbPath, 'kubernetes pods deployment', {
      embed: fakeEmbed,
      k: 10,
    })

    expect(hits.every((h) => h.slug !== 'therapy-thoughts')).toBe(true)
    expect(hits.every((h) => h.source !== 'diary')).toBe(true)
  })

  it('rebuild is idempotent — re-running does not duplicate chunks', async () => {
    const vault = openVault(dir)
    const dbPath = defaultIndexPath(vault)
    await buildSearchIndex(vault, dbPath, fakeEmbed)
    const second = await buildSearchIndex(vault, dbPath, fakeEmbed)

    const hits = await queryVault(dbPath, 'kubernetes pods deployment', {
      embed: fakeEmbed,
      k: 50,
    })
    expect(hits).toHaveLength(second.chunks)
  })

  it('the dashboard read layer works whether or not the index exists (optionality)', async () => {
    process.env.ACHIEVE_VAULT_DIR = dir
    try {
      // No index has been built in this test — the dashboard must not care.
      const notes = await getNotes()
      const publicNotes = await getPublicNotes()
      expect(notes.length).toBe(3)
      expect(publicNotes.some((n) => n.type === 'private')).toBe(false)
    } finally {
      delete process.env.ACHIEVE_VAULT_DIR
    }
  })
})
