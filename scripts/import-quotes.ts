#!/usr/bin/env node
/**
 * Quote database import.
 *
 * Reads a curated quote database the user supplies — CSV, JSON or YAML with
 * `text` and `author` fields plus optional `source` and `tags` — and appends
 * its entries to the pool in `quotes.yaml` through the vault I/O layer, so the
 * write is atomic and recorded as exactly one labeled commit:
 *
 *   npm run quotes:import <file>
 *
 * Safe to re-run: entries whose normalized text is already in the pool are
 * skipped, and an import that adds nothing writes nothing. Quotes added in the
 * dashboard live in the same list and are only ever appended to. The whole file
 * is parsed and validated before the first byte is written, so a malformed
 * database leaves the pool exactly as it was.
 *
 * Fully offline, like `npm run rotate` — nothing here reaches the network.
 * Honors `ACHIEVE_VAULT_DIR`; defaults to `<repo>/vault`.
 */

import fs from 'node:fs/promises'
import { openVault } from '../lib/vault/index.ts'
import {
  formatForPath,
  importQuotes,
  parseQuoteDatabase,
} from '../lib/dashboard/quote-import.ts'

async function main(): Promise<void> {
  const filePath = process.argv[2]
  if (!filePath) {
    console.error('Usage: npm run quotes:import <file.csv|file.json|file.yaml>')
    process.exit(2)
  }

  const format = formatForPath(filePath)

  let raw: string
  try {
    raw = await fs.readFile(filePath, 'utf8')
  } catch {
    throw new Error(`Cannot read ${filePath}.`)
  }

  // Parse first: nothing touches the vault until every entry has validated.
  const quotes = parseQuoteDatabase(raw, format)

  const { added, duplicates, total } = await importQuotes(openVault(), quotes)

  const skipped = duplicates ? `, ${duplicates} duplicate${duplicates === 1 ? '' : 's'} skipped` : ''
  if (added === 0) {
    console.log(`Nothing to import from ${filePath}${skipped} — pool unchanged (${total}).`)
    return
  }
  console.log(
    `Imported ${added} quote${added === 1 ? '' : 's'} from ${filePath}${skipped} (one labeled commit). Pool: ${total}.`,
  )
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
