#!/usr/bin/env node
/**
 * `search_vault` — query the local search index built by
 * `scripts/build-search-index.ts`. Invoked by the `/search-vault` skill:
 *
 *   node scripts/search-vault.ts "<query>" [--k 5]
 *
 * Prints JSON results to stdout: `[{ source, slug, title, text, distance }]`,
 * nearest first. Read-only; never touches `diary/` — results can only ever
 * come from what `build-search-index.ts` indexed. Honors `ACHIEVE_VAULT_DIR`.
 */

import path from 'node:path'
import { openVault } from '../lib/vault/index.ts'
import { defaultIndexPath, INDEX_DIR, INDEX_FILE } from '../lib/search/build.ts'
import { parseSearchArgs } from '../lib/search/cli-args.ts'
import { queryVault } from '../lib/search/query.ts'

async function main(): Promise<void> {
  const { query, k } = parseSearchArgs(process.argv.slice(2))

  if (!query) {
    console.error('Usage: node scripts/search-vault.ts "<query>" [--k 5]')
    process.exit(2)
  }

  const vault = openVault()
  const dbPath = defaultIndexPath(vault)
  if (!(await vault.exists(path.join(INDEX_DIR, INDEX_FILE)))) {
    console.error(
      'No search index found. Run `npm run index` first (it is optional — everything else works without it).',
    )
    process.exit(1)
  }

  const results = await queryVault(dbPath, query, k ? { k } : {})
  console.log(JSON.stringify(results, null, 2))
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
