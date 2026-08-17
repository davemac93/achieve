#!/usr/bin/env node
/**
 * `/teach` write path.
 *
 * Takes a JSON payload and writes it into `learn/<topic>/` through the vault
 * I/O layer, so the write is atomic and recorded as exactly one labeled commit.
 * Invoked by the `/teach` skill after the user approves what it proposed:
 *
 *   node scripts/write-learn.ts <payload.json>
 *
 * Two payload kinds, matching the two files a topic owns:
 *
 *   { "kind": "plan", "title", "why", "slug"?, "goal"?, "job"?,
 *     "curriculum": [{ id, title, kind?, after?, skill? }], "body"? }
 *   { "kind": "session", "topic", "body", "date"?, "covered"? }
 *
 * A plan is refused unless it says *why* the topic exists and its curriculum
 * validates (unique ids, real prerequisites, no `after` cycles); a session is
 * refused unless the topic already has a plan. `date` is stamped here when
 * omitted. Honors `ACHIEVE_VAULT_DIR`; defaults to `<repo>/vault`.
 *
 * The dashboard's `learn/status.yaml` is deliberately unreachable from here —
 * ticking an item is the user's act in the Learn tab, never the skill's.
 */

import fs from 'node:fs/promises'
import { openVault } from '../lib/vault/index.ts'
import {
  writeSession,
  writeTopicPlan,
  type SessionInput,
  type TopicPlanInput,
} from '../lib/dashboard/learn-content.ts'

type Payload =
  | ({ kind: 'plan' } & TopicPlanInput)
  | ({ kind: 'session' } & SessionInput)

/** Today as `YYYY-MM-DD`, in the user's own timezone (dates here are local). */
function today(): string {
  const now = new Date()
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 10)
}

async function main(): Promise<void> {
  const payloadPath = process.argv[2]
  if (!payloadPath) {
    console.error('Usage: node scripts/write-learn.ts <payload.json>')
    process.exit(2)
  }

  const payload = JSON.parse(await fs.readFile(payloadPath, 'utf8')) as Payload
  const vault = openVault()

  if (payload.kind === 'plan') {
    const { relPath } = await writeTopicPlan(vault, payload, today())
    console.log(`Wrote ${relPath} (one labeled commit).`)
    console.log('Tick its items in the Learn tab — the dashboard owns learn/status.yaml.')
    return
  }

  if (payload.kind === 'session') {
    const { relPath, appended } = await writeSession(vault, payload, payload.date ?? today())
    console.log(`${appended ? 'Extended' : 'Wrote'} ${relPath} (one labeled commit).`)
    return
  }

  throw new Error(`Unknown payload kind: ${JSON.stringify((payload as { kind: string }).kind)}. Use "plan" or "session".`)
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
