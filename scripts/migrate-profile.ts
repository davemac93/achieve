#!/usr/bin/env node
/**
 * One-time migration: hand-written `user.md` → the structured `profile/` stores.
 *
 * Non-destructive by construction, in three ways:
 *   1. The default run **writes nothing** — it parses `user.md` and prints what
 *      it would produce, so the `/profile` skill can show it for approval.
 *   2. `--write` never overwrites content: an existing experience file or a
 *      YAML store that already holds records is skipped and reported.
 *   3. `user.md` itself is never touched. Migration only adds structure; the
 *      summary is regenerated later, as its own approved step.
 *
 *   node scripts/migrate-profile.ts                 # preview (default)
 *   node scripts/migrate-profile.ts --json          # the proposal, as JSON
 *   node scripts/migrate-profile.ts --write [p.json]  # write, after approval
 *
 * The optional payload to `--write` is a proposal JSON the skill corrected with
 * the user (the parser guesses at free prose; the user has the last word).
 * Honors `ACHIEVE_VAULT_DIR`; defaults to `<repo>/vault`.
 */

import fs from 'node:fs/promises'
import { openVault } from '../lib/vault/index.ts'
import {
  USER_MD,
  applyProposal,
  parseUserMd,
  proposalFiles,
  type ProfileProposal,
  type UnparsedText,
} from '../lib/dashboard/profile-content.ts'

function preview(
  files: { relPath: string; content: string }[],
  unparsed: UnparsedText[],
): string {
  if (files.length === 0) {
    return unparsed.length > 0
      ? 'Nothing could be migrated confidently out of user.md.'
      : 'Nothing to migrate: no experience, education, skills or preferences sections found in user.md.'
  }
  return files
    .map((file) => `--- ${file.relPath} ---\n${file.content.trimEnd()}`)
    .join('\n\n')
}

/**
 * What the parser refused to guess at. Printed in every mode, because a silent
 * omission is the one failure the user cannot notice: the profile database is
 * what the CV skill is allowed to state as fact, so a gap has to be visible
 * and answered in conversation, not filled in by a heuristic.
 */
function unparsedReport(unparsed: UnparsedText[]): string {
  if (unparsed.length === 0) return ''
  const lines = unparsed.map(
    (item) => `  - ${item.section}: "${item.text}" — ${item.reason}`,
  )
  return [
    `\nNot migrated — ${unparsed.length} block(s) could not be read confidently:`,
    ...lines,
    'Nothing was guessed. Tell /profile what these should be and it will add them.',
  ].join('\n')
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const write = args.includes('--write')
  const json = args.includes('--json')
  const payloadPath = args.find((arg) => !arg.startsWith('--'))

  const vault = openVault()

  let proposal: ProfileProposal
  if (payloadPath) {
    proposal = JSON.parse(await fs.readFile(payloadPath, 'utf8')) as ProfileProposal
  } else {
    if (!(await vault.exists(USER_MD))) {
      console.log('No user.md in this vault — nothing to migrate.')
      return
    }
    proposal = parseUserMd(await vault.read(USER_MD))
  }

  const files = proposalFiles(proposal)
  // A corrected proposal handed back by the skill may legitimately omit it.
  const unparsed = proposal.unparsed ?? []

  if (!write) {
    console.log(
      json
        ? JSON.stringify(proposal, null, 2)
        : preview(files, unparsed) + unparsedReport(unparsed),
    )
    console.log(
      json ? '' : '\n(Preview only — nothing was written. Re-run with --write after approval.)',
    )
    return
  }

  const result = await applyProposal(vault, files)
  for (const rel of result.written) console.log(`Wrote ${rel} (one labeled commit).`)
  for (const skip of result.skipped) {
    console.log(`Skipped ${skip.relPath} — ${skip.reason} (left untouched).`)
  }
  const report = unparsedReport(unparsed)
  if (report) console.log(report)
  console.log(`user.md was not modified; regenerate the summary as its own step.`)
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
