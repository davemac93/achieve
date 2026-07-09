/**
 * Local vector index storage — a single sqlite file (via `better-sqlite3` +
 * the `sqlite-vec` extension) holding chunk text/metadata alongside its
 * embedding. No server, no required external service: the whole index is one
 * file next to the vault it indexes.
 */

import Database from 'better-sqlite3'
import fs from 'node:fs'
import path from 'node:path'
import * as sqliteVec from 'sqlite-vec'

/** Dimensionality of the embedding model this index is built for. */
export const EMBEDDING_DIMENSIONS = 384

export interface StoredChunk {
  source: string
  slug: string
  title: string
  type?: string
  project?: string
  tags?: string[]
  ordinal: number
  text: string
}

export interface SearchResult extends StoredChunk {
  /** Vector distance to the query (lower is more relevant). */
  distance: number
}

export interface SearchIndex {
  /** Replace the entire index contents with `items` in one transaction. */
  rebuild(items: Array<{ chunk: StoredChunk; embedding: Float32Array }>): void
  /** The `k` nearest chunks to `queryEmbedding`, nearest first. */
  search(queryEmbedding: Float32Array, k: number): SearchResult[]
  /** Number of chunks currently stored. */
  count(): number
  close(): void
}

interface ChunkRow {
  source: string
  slug: string
  title: string
  type: string | null
  project: string | null
  tags: string | null
  ordinal: number
  text: string
  distance?: number
}

function toStoredChunk(row: ChunkRow): StoredChunk {
  return {
    source: row.source,
    slug: row.slug,
    title: row.title,
    type: row.type ?? undefined,
    project: row.project ?? undefined,
    tags: row.tags ? row.tags.split(',') : undefined,
    ordinal: row.ordinal,
    text: row.text,
  }
}

/** Open (creating if absent) the sqlite-vec index at `dbPath`. */
export function openSearchIndex(dbPath: string): SearchIndex {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true })
  // @types/better-sqlite3 predates `allowExtension` (better-sqlite3 v9+,
  // required to load the sqlite-vec extension) — cast around the stale type.
  const db = new Database(dbPath, { allowExtension: true } as Database.Options)
  sqliteVec.load(db)

  db.exec(`
    CREATE TABLE IF NOT EXISTS chunks (
      id INTEGER PRIMARY KEY,
      source TEXT NOT NULL,
      slug TEXT NOT NULL,
      title TEXT NOT NULL,
      type TEXT,
      project TEXT,
      tags TEXT,
      ordinal INTEGER NOT NULL,
      text TEXT NOT NULL
    )
  `)
  db.exec(
    `CREATE VIRTUAL TABLE IF NOT EXISTS vec_chunks USING vec0(embedding float[${EMBEDDING_DIMENSIONS}])`,
  )

  const insertChunk = db.prepare(`
    INSERT INTO chunks (source, slug, title, type, project, tags, ordinal, text)
    VALUES (@source, @slug, @title, @type, @project, @tags, @ordinal, @text)
  `)
  const insertVec = db.prepare(`INSERT INTO vec_chunks (rowid, embedding) VALUES (?, ?)`)
  const clearChunks = db.prepare('DELETE FROM chunks')
  const clearVec = db.prepare('DELETE FROM vec_chunks')
  const countChunks = db.prepare('SELECT COUNT(*) AS n FROM chunks')

  const rebuildTx = db.transaction(
    (items: Array<{ chunk: StoredChunk; embedding: Float32Array }>) => {
      clearChunks.run()
      clearVec.run()
      for (const { chunk, embedding } of items) {
        if (embedding.length !== EMBEDDING_DIMENSIONS) {
          throw new Error(
            `Expected a ${EMBEDDING_DIMENSIONS}-dimension embedding, got ${embedding.length}.`,
          )
        }
        const info = insertChunk.run({
          source: chunk.source,
          slug: chunk.slug,
          title: chunk.title,
          type: chunk.type ?? null,
          project: chunk.project ?? null,
          tags: chunk.tags?.length ? chunk.tags.join(',') : null,
          ordinal: chunk.ordinal,
          text: chunk.text,
        })
        insertVec.run(BigInt(info.lastInsertRowid), embedding)
      }
    },
  )

  function rebuild(items: Array<{ chunk: StoredChunk; embedding: Float32Array }>): void {
    rebuildTx(items)
  }

  function search(queryEmbedding: Float32Array, k: number): SearchResult[] {
    if (queryEmbedding.length !== EMBEDDING_DIMENSIONS) {
      throw new Error(
        `Expected a ${EMBEDDING_DIMENSIONS}-dimension query embedding, got ${queryEmbedding.length}.`,
      )
    }
    // vec0 KNN queries require the limit as a literal at prepare time, not a
    // bound parameter — `k` is validated to a positive integer first, so
    // interpolating it here carries no injection risk.
    const limit = Math.max(1, Math.floor(k))
    const rows = db
      .prepare(
        `
        SELECT c.source, c.slug, c.title, c.type, c.project, c.tags, c.ordinal, c.text, v.distance AS distance
        FROM vec_chunks v
        JOIN chunks c ON c.id = v.rowid
        WHERE v.embedding MATCH ? AND k = ${limit}
        ORDER BY v.distance
      `,
      )
      .all(queryEmbedding) as ChunkRow[]

    return rows.map((row) => ({ ...toStoredChunk(row), distance: row.distance ?? 0 }))
  }

  function count(): number {
    return (countChunks.get() as { n: number }).n
  }

  function close(): void {
    db.close()
  }

  return { rebuild, search, count, close }
}
