#!/usr/bin/env node
/**
 * `/note` write path.
 *
 * Takes a JSON payload describing a note and writes it to `notes/<slug>.md`
 * through the vault I/O layer, so the write is atomic and recorded as exactly
 * one labeled commit. Invoked by the `/note` skill (which composes the payload
 * after summarizing and categorizing raw input):
 *
 *   node scripts/write-note.ts <payload.json>
 *
 * The payload is `{ title, type, tags?, project?, body }` (see NoteInput).
 * `created` is stamped here, at write time. Honors `ACHIEVE_VAULT_DIR`;
 * defaults to `<repo>/vault`.
 */

import fs from 'node:fs/promises'
import { openVault } from '../lib/vault/index.ts'
import { writeNote, type NoteInput } from '../lib/dashboard/note-content.ts'

async function main(): Promise<void> {
  const payloadPath = process.argv[2]
  if (!payloadPath) {
    console.error('Usage: node scripts/write-note.ts <payload.json>')
    process.exit(2)
  }

  const raw = await fs.readFile(payloadPath, 'utf8')
  const input = JSON.parse(raw) as NoteInput

  const vault = openVault()
  const { relPath } = await writeNote(vault, input, new Date().toISOString())

  console.log(`Wrote ${relPath} (one labeled commit).`)
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
