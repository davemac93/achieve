/**
 * Build (rebuild) the local search index from the vault's current, indexable
 * content: gather → chunk → embed → store. Takes the embedder as a parameter
 * so tests can inject a fast, deterministic fake instead of the real
 * (network-on-first-use, model-loading) local embedder.
 */

import path from 'node:path'
import type { Vault } from '../vault/index.ts'
import { getIndexableDocuments } from './corpus.ts'
import { chunkText } from './chunk.ts'
import { embed as defaultEmbed, type Embedder } from './embeddings.ts'
import { openSearchIndex, type StoredChunk } from './store.ts'

/** Vault-relative directory the index lives under — kept out of the vault's
 * own git history (see `template/.gitignore`), since it's a derived cache,
 * not vault content. */
export const INDEX_DIR = '.search-index'
export const INDEX_FILE = 'vault.db'

export function defaultIndexPath(vault: Vault): string {
  return vault.resolve(path.join(INDEX_DIR, INDEX_FILE))
}

export interface BuildResult {
  documents: number
  chunks: number
}

/** Rebuild the index at `dbPath` from the vault's current indexable content. */
export async function buildSearchIndex(
  vault: Vault,
  dbPath: string,
  embed: Embedder = defaultEmbed,
): Promise<BuildResult> {
  const docs = await getIndexableDocuments(vault)

  const chunks: StoredChunk[] = []
  for (const doc of docs) {
    const pieces = chunkText(doc.body)
    pieces.forEach((text, ordinal) => {
      chunks.push({
        source: doc.source,
        slug: doc.slug,
        title: doc.title,
        type: doc.type,
        project: doc.project,
        tags: doc.tags,
        ordinal,
        text,
      })
    })
  }

  const embeddings = chunks.length ? await embed(chunks.map((c) => c.text)) : []

  const index = openSearchIndex(dbPath)
  try {
    index.rebuild(chunks.map((chunk, i) => ({ chunk, embedding: embeddings[i]! })))
  } finally {
    index.close()
  }

  return { documents: docs.length, chunks: chunks.length }
}
