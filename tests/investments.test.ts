import { execFileSync } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { parse } from 'yaml'

// Server actions revalidate the Next.js router cache after a write. There is no
// request context in a unit test, so stub it: these tests assert the file
// effect on disk, not React rendering.
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))

import {
  addHoldingAction,
  deleteHoldingAction,
  updateHoldingAction,
} from '../app/actions.ts'
import type { Holding } from '../lib/dashboard/types.ts'

function git(cwd: string, args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' })
}

/** Init a temp dir as a git repo so the vault layer can commit into it. */
async function makeVaultRepo(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'achieve-investments-'))
  git(dir, ['init', '-q'])
  git(dir, ['config', 'user.name', 'test'])
  git(dir, ['config', 'user.email', 'test@localhost'])
  return dir
}

function form(fields: Record<string, string>): FormData {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) fd.set(k, v)
  return fd
}

const vwce = {
  ticker: 'vwce.de',
  name: '  Vanguard FTSE All-World  ',
  assetType: 'etf',
  account: 'IKE',
  shares: '12',
  avgCost: '512.30',
  quoteCurrency: 'eur',
}

/** Read holdings straight from the file on disk (not through the data layer). */
async function readHoldings(dir: string): Promise<Holding[]> {
  const raw = await fs.readFile(path.join(dir, 'investments.yaml'), 'utf8')
  return (parse(raw)?.holdings ?? []) as Holding[]
}

function lastCommitSubject(dir: string): string {
  return git(dir, ['log', '-1', '--format=%s']).trim()
}

describe('holding server actions write through to investments.yaml', () => {
  let dir: string

  beforeEach(async () => {
    dir = await makeVaultRepo()
    // The vault root resolves from this env var (see defaultVaultRoot).
    process.env.ACHIEVE_VAULT_DIR = dir
  })

  afterEach(async () => {
    delete process.env.ACHIEVE_VAULT_DIR
    await fs.rm(dir, { recursive: true, force: true })
  })

  it('adding a holding persists it, normalized, with a labeled commit', async () => {
    await addHoldingAction(form(vwce))

    const holdings = await readHoldings(dir)
    expect(holdings).toHaveLength(1)
    const h = holdings[0]!
    expect(h.id).toBeTruthy()
    expect(h.ticker).toBe('VWCE.DE') // upcased
    expect(h.name).toBe('Vanguard FTSE All-World') // trimmed
    expect(h.assetType).toBe('etf')
    expect(h.account).toBe('IKE')
    expect(h.shares).toBe(12)
    expect(h.avgCost).toBe(512.3)
    expect(h.quoteCurrency).toBe('EUR') // upcased
    expect(lastCommitSubject(dir)).toBe('dashboard: add holding')
  })

  it('ignores a submission with no ticker (no write, no commit)', async () => {
    await addHoldingAction(form({ ...vwce, ticker: '   ' }))

    await expect(fs.access(path.join(dir, 'investments.yaml'))).rejects.toThrow()
    // Only the repo's initial state — no mutation commit was made.
    expect(git(dir, ['rev-list', '--count', '--all']).trim()).toBe('0')
  })

  it('ignores non-positive or non-numeric shares (no write, no commit)', async () => {
    await addHoldingAction(form({ ...vwce, shares: '0' }))
    await addHoldingAction(form({ ...vwce, shares: 'twelve' }))

    await expect(fs.access(path.join(dir, 'investments.yaml'))).rejects.toThrow()
    expect(git(dir, ['rev-list', '--count', '--all']).trim()).toBe('0')
  })

  it('rejects an asset type outside the enum', async () => {
    await expect(
      addHoldingAction(form({ ...vwce, assetType: 'crypto' })),
    ).rejects.toThrow(/asset type/i)
  })

  it('updating replaces the targeted holding in place', async () => {
    await addHoldingAction(form(vwce))
    const id = (await readHoldings(dir))[0]!.id

    await updateHoldingAction(id, form({ ...vwce, shares: '20', account: 'IKZE' }))

    const holdings = await readHoldings(dir)
    expect(holdings).toHaveLength(1)
    expect(holdings[0]?.id).toBe(id) // id is stable across edits
    expect(holdings[0]?.shares).toBe(20)
    expect(holdings[0]?.account).toBe('IKZE')
    expect(lastCommitSubject(dir)).toBe('dashboard: update holding')
  })

  it('updating an unknown id throws and writes nothing', async () => {
    await addHoldingAction(form(vwce))
    const before = git(dir, ['rev-list', '--count', '--all']).trim()

    await expect(updateHoldingAction('nope', form(vwce))).rejects.toThrow(/no holding/i)
    expect(git(dir, ['rev-list', '--count', '--all']).trim()).toBe(before)
  })

  it('deleting removes only the targeted holding', async () => {
    await addHoldingAction(form(vwce))
    await addHoldingAction(form({ ...vwce, ticker: 'SXR8.DE', name: 'iShares S&P 500' }))
    const holdings = await readHoldings(dir)
    const target = holdings.find((h) => h.ticker === 'SXR8.DE')!

    await deleteHoldingAction(target.id)

    const remaining = await readHoldings(dir)
    expect(remaining).toHaveLength(1)
    expect(remaining[0]?.ticker).toBe('VWCE.DE')
    expect(lastCommitSubject(dir)).toBe('dashboard: delete holding')
  })
})
