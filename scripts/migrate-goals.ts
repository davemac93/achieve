#!/usr/bin/env node
/**
 * One-time migration: the v1 goal schema → the v2 one.
 *
 * Two things change. `3yr` goals become **directions** — north stars with no
 * status, no progress and no deadline — and the hand-typed `progress`
 * percentage in `goal-status.yaml` disappears, because progress is now the
 * share of leaf steps ticked.
 *
 * Non-destructive by construction, in three ways:
 *   1. The default run **writes nothing** — it reads both files and prints what
 *      it would produce, so the `/goals` skill can show it for approval.
 *   2. **No id is renamed and no goal is dropped.** That is what keeps
 *      `goal-status.yaml` (and every task linked to a weekly goal) attached.
 *   3. Everything it removes is reported by id, so nothing goes quietly.
 *
 *   node scripts/migrate-goals.ts                 # preview (default)
 *   node scripts/migrate-goals.ts --json          # the proposal, as JSON
 *   node scripts/migrate-goals.ts --write         # write, after approval
 *
 * Honors `ACHIEVE_VAULT_DIR`; defaults to `<repo>/vault`.
 */

import { openVault } from '../lib/vault/index.ts'
import {
  GOALS_FILE,
  STATUS_FILE,
  applyMigration,
  migrateGoals,
  renderGoalsFile,
  renderStatusFile,
} from '../lib/dashboard/goal-content.ts'
import { validateGoalTree } from '../lib/dashboard/goal-tree.ts'

function preview(migration: ReturnType<typeof migrateGoals>): string {
  const lines = [
    `--- ${GOALS_FILE} ---`,
    renderGoalsFile(migration.goals).trimEnd(),
    '',
    `--- ${STATUS_FILE} ---`,
    renderStatusFile(migration.status).trimEnd(),
    '',
    'Changes:',
  ]
  for (const change of migration.changes) lines.push(`  ${change.id}: ${change.message}`)

  const report = validateGoalTree(migration.goals)
  if (!report.ok) {
    lines.push('', 'The migrated tree still has problems — fix them with /goals:')
    for (const error of report.errors) lines.push(`  ${error.id}: ${error.message}`)
  }
  return lines.join('\n')
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const write = args.includes('--write')
  const json = args.includes('--json')

  const vault = openVault()
  if (!(await vault.exists(GOALS_FILE))) {
    console.log(`No ${GOALS_FILE} in this vault — nothing to migrate.`)
    return
  }

  const rawGoals = await vault.readYaml<unknown>(GOALS_FILE)
  const rawStatus = (await vault.exists(STATUS_FILE))
    ? await vault.readYaml<unknown>(STATUS_FILE)
    : null
  const migration = migrateGoals(rawGoals, rawStatus)

  if (migration.clean && !json) {
    console.log('Already on the v2 goal schema — nothing to migrate.')
    return
  }

  if (!write) {
    console.log(json ? JSON.stringify(migration, null, 2) : preview(migration))
    if (!json) {
      console.log('\n(Preview only — nothing was written. Re-run with --write after approval.)')
    }
    return
  }

  const result = await applyMigration(vault, migration)
  for (const rel of result.written) console.log(`Wrote ${rel} (one labeled commit).`)
  for (const rel of result.unchanged) console.log(`${rel} was already up to date.`)
  console.log('Every goal id was preserved, so status and task links stay attached.')
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
