import { execFileSync } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { parse, stringify } from 'yaml'

import { nextQuoteIndex } from '../lib/dashboard/quote-rotation.ts'

vi.mock('next/cache', () => ({ revalidatePath: () => {} }))

import { addQuoteAction } from '../app/actions.ts'
import { getCurrentQuote } from '../lib/dashboard/quotes.ts'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))
const ROTATE_SCRIPT = path.join(repoRoot, 'scripts', 'rotate-quote.ts')

function git(cwd: string, args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' })
}

async function makeVaultRepo(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'achieve-quotes-'))
  git(dir, ['init', '-q'])
  git(dir, ['config', 'user.name', 'test'])
  git(dir, ['config', 'user.email', 'test@localhost'])
  return dir
}

describe('nextQuoteIndex is deterministic', () => {
  it('starts at the first quote when there is no valid pointer', () => {
    expect(nextQuoteIndex(null, 3)).toBe(0)
    expect(nextQuoteIndex(undefined, 3)).toBe(0)
    expect(nextQuoteIndex(1.5, 3)).toBe(0)
    expect(nextQuoteIndex(-1, 3)).toBe(0)
    expect(nextQuoteIndex(9, 3)).toBe(0) // out of range -> reset
  })

  it('advances by one and wraps at the end', () => {
    expect(nextQuoteIndex(0, 3)).toBe(1)
    expect(nextQuoteIndex(1, 3)).toBe(2)
    expect(nextQuoteIndex(2, 3)).toBe(0)
  })

  it('returns null when there are no quotes', () => {
    expect(nextQuoteIndex(null, 0)).toBeNull()
    expect(nextQuoteIndex(0, 0)).toBeNull()
  })
})

describe('rotate-quote script advances the pointer over a given quotes.yaml', () => {
  let dir: string

  async function writeQuotes(file: { quotes: unknown[]; current: number | null }) {
    await fs.writeFile(path.join(dir, 'quotes.yaml'), stringify(file), 'utf8')
    git(dir, ['add', '-A'])
    git(dir, ['commit', '-q', '-m', 'seed quotes'])
  }

  async function readCurrent(): Promise<number | null> {
    const raw = await fs.readFile(path.join(dir, 'quotes.yaml'), 'utf8')
    return parse(raw).current ?? null
  }

  function rotate() {
    execFileSync('node', [ROTATE_SCRIPT], {
      cwd: repoRoot,
      env: { ...process.env, ACHIEVE_VAULT_DIR: dir },
      encoding: 'utf8',
    })
  }

  function commitCount(): number {
    return Number(git(dir, ['rev-list', '--count', 'HEAD']).trim())
  }

  beforeEach(async () => {
    dir = await makeVaultRepo()
  })

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true })
  })

  it('walks 0 -> 1 -> 2 -> 0, one labeled commit per move', async () => {
    await writeQuotes({
      quotes: [{ text: 'a' }, { text: 'b' }, { text: 'c' }],
      current: 0,
    })
    const before = commitCount()

    rotate()
    expect(await readCurrent()).toBe(1)
    rotate()
    expect(await readCurrent()).toBe(2)
    rotate()
    expect(await readCurrent()).toBe(0)

    expect(commitCount()).toBe(before + 3)
    expect(git(dir, ['log', '-1', '--format=%s']).trim()).toBe('rotation: advance quote')
  })

  it('points a null pointer at the first quote', async () => {
    await writeQuotes({ quotes: [{ text: 'a' }, { text: 'b' }], current: null })
    rotate()
    expect(await readCurrent()).toBe(0)
  })

  it('is a no-op (no extra commit) for a single quote', async () => {
    await writeQuotes({ quotes: [{ text: 'only' }], current: 0 })
    const before = commitCount()
    rotate() // (0 + 1) % 1 === 0 -> identical rewrite -> no commit
    expect(await readCurrent()).toBe(0)
    expect(commitCount()).toBe(before)
  })
})

describe('adding a quote persists and surfaces as the current quote', () => {
  let dir: string

  beforeEach(async () => {
    dir = await makeVaultRepo()
    process.env.ACHIEVE_VAULT_DIR = dir
  })

  afterEach(async () => {
    delete process.env.ACHIEVE_VAULT_DIR
    await fs.rm(dir, { recursive: true, force: true })
  })

  it('writes the quote to quotes.yaml and getCurrentQuote returns it', async () => {
    const fd = new FormData()
    fd.set('text', 'Make it work, then make it right.')
    fd.set('author', 'Kent Beck')
    await addQuoteAction(fd)

    const onDisk = parse(await fs.readFile(path.join(dir, 'quotes.yaml'), 'utf8'))
    expect(onDisk.quotes).toHaveLength(1)
    expect(onDisk.quotes[0]).toEqual({
      text: 'Make it work, then make it right.',
      author: 'Kent Beck',
    })

    const current = await getCurrentQuote()
    expect(current).toEqual({
      text: 'Make it work, then make it right.',
      author: 'Kent Beck',
    })
  })
})
