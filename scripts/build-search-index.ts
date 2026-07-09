#!/usr/bin/env node
/**
 * Rebuild the local, file-based search index over the vault's non-private
 * prose (notes minus `type: private`, projects minus `status: private` —
 * never `diary/`). Run after adding/editing notes or projects, or on a
 * schedule:
 *
 *   npm run index
 *
 * The index is optional — the dashboard and every skill work without it.
 * Honors `ACHIEVE_VAULT_DIR`; defaults to `<repo>/vault`. First run downloads
 * a small local embedding model (cached under node_modules/); every run after
 * that is fully offline — no API key, no server.
 */

import { openVault } from '../lib/vault/index.ts'
import { buildSearchIndex, defaultIndexPath } from '../lib/search/build.ts'

async function main(): Promise<void> {
  const vault = openVault()
  const dbPath = defaultIndexPath(vault)

  console.log('Building search index (first run may download the embedding model)...')
  const { documents, chunks } = await buildSearchIndex(vault, dbPath)

  console.log(`Indexed ${documents} document(s) into ${chunks} chunk(s).`)
  console.log(`Index: ${dbPath}`)
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
