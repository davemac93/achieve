/**
 * Query the local search index — `search_vault(query)`. Embeds the query text
 * with the same embedder the index was built with and returns the nearest
 * chunks. Takes the embedder as a parameter for the same reason `build.ts`
 * does: tests inject a fake instead of loading the real model.
 */

import { embed as defaultEmbed, type Embedder } from './embeddings.ts'
import { openSearchIndex, type SearchResult } from './store.ts'

export interface QueryOptions {
  k?: number
  embed?: Embedder
}

const DEFAULT_K = 5

/** Search the index at `dbPath` for the `k` chunks most relevant to `query`. */
export async function queryVault(
  dbPath: string,
  query: string,
  opts: QueryOptions = {},
): Promise<SearchResult[]> {
  const embed = opts.embed ?? defaultEmbed
  const k = opts.k ?? DEFAULT_K

  const [queryEmbedding] = await embed([query])
  const index = openSearchIndex(dbPath)
  try {
    return index.search(queryEmbedding!, k)
  } finally {
    index.close()
  }
}
