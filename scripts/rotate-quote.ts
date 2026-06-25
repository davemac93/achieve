#!/usr/bin/env node
/**
 * Daily quote rotation.
 *
 * Advances the `current` pointer in `quotes.yaml` by one (wrapping at the end)
 * through the vault I/O layer, so the move is atomic and recorded as exactly
 * one labeled commit. Run on a schedule (e.g. a daily cron) or by hand:
 *
 *   npm run rotate
 *
 * Honors `ACHIEVE_VAULT_DIR`; defaults to `<repo>/vault`. Deterministic and
 * idempotent: with a single quote (or when the pointer already lands where
 * rotation would put it), the rewrite is identical and the vault makes no
 * commit.
 */

import { openVault } from '../lib/vault/index.ts'
import { nextQuoteIndex } from '../lib/dashboard/quote-rotation.ts'

const REL = 'quotes.yaml'

interface QuotesFile {
  quotes?: unknown
  current?: unknown
}

async function main(): Promise<void> {
  const vault = openVault()

  if (!(await vault.exists(REL))) {
    console.log('No quotes.yaml yet — nothing to rotate.')
    return
  }

  const data = (await vault.readYaml<QuotesFile | null>(REL)) ?? {}
  const quotes = Array.isArray(data.quotes) ? data.quotes : []
  const current = typeof data.current === 'number' ? data.current : null
  const next = nextQuoteIndex(current, quotes.length)

  if (next === null) {
    console.log('No quotes to rotate.')
    return
  }

  // An identical rewrite (e.g. a single quote) produces no commit — the vault
  // layer treats a no-op write as a non-mutation.
  await vault.writeYaml(
    REL,
    { ...data, quotes, current: next },
    { message: 'rotation: advance quote' },
  )

  console.log(
    `Rotated quote pointer: ${current ?? 'null'} -> ${next} (${quotes.length} quote${
      quotes.length === 1 ? '' : 's'
    }).`,
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
