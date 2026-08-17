#!/usr/bin/env node
/**
 * `/fitness` write path.
 *
 * Takes a JSON payload and writes it into `fitness/` through the vault I/O
 * layer, so the write is atomic and recorded as exactly one labeled commit.
 * Invoked by the `/fitness` skill after the user approves what it proposed:
 *
 *   node scripts/write-fitness.ts <payload.json>
 *
 * Two payload kinds, matching the two files the skill owns:
 *
 *   { "kind": "intake", "history", "level", "daysPerWeek", "sessionMinutes"?,
 *     "timeOfDay"?, "equipment"?, "limitations"?, "wants"? }
 *   { "kind": "plan", "title", "daysPerWeek", "sessions": [{ id, title }],
 *     "body" }
 *
 * **A plan is refused unless the intake exists**, and unless it schedules no
 * more days than the intake says the user has: the interview is what makes the
 * plan theirs rather than generic, so the write path insists on it rather than
 * trusting the skill to remember. `updated` is stamped here. Honors
 * `ACHIEVE_VAULT_DIR`; defaults to `<repo>/vault`.
 *
 * The two logged series are deliberately unreachable from here — logging a
 * session is the user's act in the Fitness tab, never the skill's — and nothing
 * in this file can touch the photos folder either.
 */

import fs from 'node:fs/promises'
import { openVault } from '../lib/vault/index.ts'
import {
  writeIntake,
  writeTrainingPlan,
  type IntakeInput,
  type TrainingPlanInput,
} from '../lib/dashboard/fitness-content.ts'

type Payload =
  | ({ kind: 'intake' } & IntakeInput)
  | ({ kind: 'plan' } & TrainingPlanInput)

/** Today as `YYYY-MM-DD`, in the user's own timezone (dates here are local). */
function today(): string {
  const now = new Date()
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 10)
}

async function main(): Promise<void> {
  const payloadPath = process.argv[2]
  if (!payloadPath) {
    console.error('Usage: node scripts/write-fitness.ts <payload.json>')
    process.exit(2)
  }

  const payload = JSON.parse(await fs.readFile(payloadPath, 'utf8')) as Payload
  const vault = openVault()

  if (payload.kind === 'intake') {
    const { relPath } = await writeIntake(vault, payload, today())
    console.log(`Wrote ${relPath} (one labeled commit).`)
    console.log('The plan can be written now — it reads these answers, not a template.')
    return
  }

  if (payload.kind === 'plan') {
    const { relPath } = await writeTrainingPlan(vault, payload, today())
    console.log(`Wrote ${relPath} (one labeled commit).`)
    console.log('Log sessions in the Fitness tab — the dashboard owns fitness/workouts.yaml.')
    return
  }

  throw new Error(
    `Unknown payload kind: ${JSON.stringify((payload as { kind: string }).kind)}. Use "intake" or "plan".`,
  )
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
