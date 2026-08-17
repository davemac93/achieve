import { execFileSync } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { parse, stringify } from 'yaml'

import {
  formatForPath,
  mergeQuotes,
  normalizeQuoteText,
  parseQuoteDatabase,
} from '../lib/dashboard/quote-import.ts'

vi.mock('next/cache', () => ({ revalidatePath: () => {} }))

import { addQuoteAction } from '../app/actions.ts'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))
const IMPORT_SCRIPT = path.join(repoRoot, 'scripts', 'import-quotes.ts')

function git(cwd: string, args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' })
}

async function makeVaultRepo(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'achieve-quote-import-'))
  git(dir, ['init', '-q'])
  git(dir, ['config', 'user.name', 'test'])
  git(dir, ['config', 'user.email', 'test@localhost'])
  // A seeded, committed pool, exactly as `npm run setup` leaves it.
  await fs.writeFile(path.join(dir, 'quotes.yaml'), stringify({ quotes: [], current: null }), 'utf8')
  git(dir, ['add', '-A'])
  git(dir, ['commit', '-q', '-m', 'seed quotes'])
  return dir
}

/* ------------------------------------------------------------------ parsing */

describe('a quote database parses out of CSV, JSON and YAML alike', () => {
  it('reads a CSV whatever order its headers are in, ignoring extra columns', () => {
    const csv = 'author,rating,text\nKent Beck,5,Make it work.\nAda Lovelace,4,The Analytical Engine weaves.\n'
    expect(parseQuoteDatabase(csv, 'csv')).toEqual([
      { text: 'Make it work.', author: 'Kent Beck' },
      { text: 'The Analytical Engine weaves.', author: 'Ada Lovelace' },
    ])
  })

  it('survives what real exports actually contain: BOM, CRLF and quoted commas', () => {
    const csv = '﻿text,author,source\r\n"Simplicity is the soul, and the point.",Dijkstra,EWD\r\n'
    expect(parseQuoteDatabase(csv, 'csv')).toEqual([
      { text: 'Simplicity is the soul, and the point.', author: 'Dijkstra', source: 'EWD' },
    ])
  })

  it('handles doubled quotes inside a quoted field, and blank lines between rows', () => {
    const csv = 'text,author\n"He said ""go"", so we went.",Anon\n\n"Second one.",Anon\n'
    expect(parseQuoteDatabase(csv, 'csv')).toEqual([
      { text: 'He said "go", so we went.', author: 'Anon' },
      { text: 'Second one.', author: 'Anon' },
    ])
  })

  it('reads the semicolon CSV Excel writes outside en-US locales', () => {
    const csv = 'text;author;tags\nOne step at a time.;Anon;"focus;habits"\n'
    expect(parseQuoteDatabase(csv, 'csv')).toEqual([
      { text: 'One step at a time.', author: 'Anon', tags: ['focus', 'habits'] },
    ])
  })

  it('splits a CSV tags cell into a list, and keeps a JSON tags array as one', () => {
    const csv = 'text,author,tags\nKeep going.,Anon,"grit, focus"\n'
    expect(parseQuoteDatabase(csv, 'csv')[0]!.tags).toEqual(['grit', 'focus'])

    const json = JSON.stringify([{ text: 'Keep going.', author: 'Anon', tags: ['grit', 'focus'] }])
    expect(parseQuoteDatabase(json, 'json')[0]!.tags).toEqual(['grit', 'focus'])
  })

  it('accepts both JSON shapes: a bare array and an object with a quotes array', () => {
    const entries = [{ text: 'a', author: 'A' }]
    expect(parseQuoteDatabase(JSON.stringify(entries), 'json')).toEqual(entries)
    expect(parseQuoteDatabase(JSON.stringify({ quotes: entries }), 'json')).toEqual(entries)
  })

  it('accepts both YAML shapes too, including the pool file’s own layout', () => {
    const entries = [{ text: 'a', author: 'A' }]
    expect(parseQuoteDatabase(stringify(entries), 'yaml')).toEqual(entries)
    expect(parseQuoteDatabase(stringify({ quotes: entries, current: 0 }), 'yaml')).toEqual(entries)
  })

  it('preserves attribution, source and tags, and omits fields left blank', () => {
    const json = JSON.stringify([
      { text: 'Full.', author: 'A', source: 'A Book', tags: ['x'] },
      { text: 'Bare.', author: '', source: '  ', tags: [] },
    ])
    expect(parseQuoteDatabase(json, 'json')).toEqual([
      { text: 'Full.', author: 'A', source: 'A Book', tags: ['x'] },
      { text: 'Bare.' },
    ])
  })

  it('names the format from the extension and refuses anything else', () => {
    expect(formatForPath('/tmp/db.csv')).toBe('csv')
    expect(formatForPath('/tmp/db.JSON')).toBe('json')
    expect(formatForPath('/tmp/db.yml')).toBe('yaml')
    expect(() => formatForPath('/tmp/db.txt')).toThrow(/\.csv, \.json, \.yaml or \.yml/)
  })
})

describe('malformed input is rejected, with a message that says what is wrong', () => {
  it('refuses a CSV with no text column', () => {
    expect(() => parseQuoteDatabase('author,source\nA,B\n', 'csv')).toThrow(/no "text" column/)
  })

  it('refuses a row whose text is empty, naming the spreadsheet row', () => {
    expect(() => parseQuoteDatabase('text,author\nfine,A\n,B\n', 'csv')).toThrow(
      /row 3: missing a non-empty "text" field/,
    )
  })

  it('refuses an unterminated quoted field', () => {
    expect(() => parseQuoteDatabase('text,author\n"never closed,A\n', 'csv')).toThrow(
      /unterminated quoted field/,
    )
  })

  it('refuses unparseable JSON and the wrong JSON shape', () => {
    expect(() => parseQuoteDatabase('{oops', 'json')).toThrow(/Could not parse the file as JSON/)
    expect(() => parseQuoteDatabase('{"rows":[]}', 'json')).toThrow(/"quotes" array/)
  })

  it('refuses a non-object entry and a non-text field', () => {
    expect(() => parseQuoteDatabase('["just a string"]', 'json')).toThrow(
      /entry 1: expected an object/,
    )
    expect(() => parseQuoteDatabase('[{"text":"a","author":7}]', 'json')).toThrow(
      /entry 1: "author" must be text/,
    )
  })

  it('refuses a file with no entries at all', () => {
    expect(() => parseQuoteDatabase('[]', 'json')).toThrow(/No quotes found/)
  })
})

describe('duplicate detection works on normalized text', () => {
  it('ignores typography, whitespace, wrapping quotes and case', () => {
    expect(normalizeQuoteText('  “Do the work.”  ')).toBe(normalizeQuoteText('"Do  the work."'))
    expect(normalizeQuoteText("It's fine")).toBe(normalizeQuoteText('It’s FINE'))
    // Different wording stays different — no over-eager merging.
    expect(normalizeQuoteText('Do the work')).not.toBe(normalizeQuoteText('Do the work today'))
  })

  it('dedupes against the pool and within the incoming batch, keeping the pool’s copy', () => {
    const existing = [{ text: 'Do the work.', author: 'Pool' }]
    const incoming = [
      { text: '“do the work.”', author: 'Import' },
      { text: 'New one.', author: 'Import' },
      { text: 'New one.', author: 'Import' },
    ]
    const merged = mergeQuotes(existing, incoming)
    expect(merged.added).toBe(1)
    expect(merged.duplicates).toBe(2)
    expect(merged.quotes).toEqual([
      { text: 'Do the work.', author: 'Pool' },
      { text: 'New one.', author: 'Import' },
    ])
  })
})

/* ----------------------------------------------------------- the write path */

describe('the quotes:import script writes through the vault layer', () => {
  let dir: string
  /** Where the user's database files live — outside the vault, as in real use. */
  let inbox: string
  let db: string

  function runImport(file: string): string {
    return execFileSync('node', [IMPORT_SCRIPT, file], {
      cwd: repoRoot,
      env: { ...process.env, ACHIEVE_VAULT_DIR: dir },
      encoding: 'utf8',
    })
  }

  /** Run an import expected to fail; returns the message it printed. */
  function failImport(file: string): string {
    try {
      runImport(file)
    } catch (err) {
      return String((err as { stderr?: string }).stderr ?? '')
    }
    throw new Error('expected the import to fail')
  }

  async function pool(): Promise<{ quotes: unknown[]; current: number | null }> {
    return parse(await fs.readFile(path.join(dir, 'quotes.yaml'), 'utf8'))
  }

  function commitCount(): number {
    return Number(git(dir, ['rev-list', '--count', 'HEAD']).trim())
  }

  beforeEach(async () => {
    dir = await makeVaultRepo()
    inbox = await fs.mkdtemp(path.join(os.tmpdir(), 'achieve-quote-db-'))
    db = path.join(inbox, 'db.csv')
    process.env.ACHIEVE_VAULT_DIR = dir
  })

  afterEach(async () => {
    delete process.env.ACHIEVE_VAULT_DIR
    await fs.rm(dir, { recursive: true, force: true })
    await fs.rm(inbox, { recursive: true, force: true })
  })

  it('imports a CSV as exactly one labeled commit, attribution intact', async () => {
    await fs.writeFile(
      db,
      'text,author,source,tags\n"Plans are worthless, planning is everything.",Eisenhower,Speech,"war, planning"\nShip it.,Anon,,\n',
      'utf8',
    )
    const before = commitCount()

    const out = runImport(db)
    expect(out).toMatch(/Imported 2 quotes/)

    const { quotes, current } = await pool()
    expect(quotes).toEqual([
      {
        text: 'Plans are worthless, planning is everything.',
        author: 'Eisenhower',
        source: 'Speech',
        tags: ['war', 'planning'],
      },
      { text: 'Ship it.', author: 'Anon' },
    ])
    // The pointer belongs to `npm run rotate`; the importer never moves it.
    expect(current).toBeNull()

    expect(commitCount()).toBe(before + 1)
    expect(git(dir, ['log', '-1', '--format=%s']).trim()).toBe('quotes: import 2 quotes')
    expect(git(dir, ['status', '--porcelain']).trim()).toBe('') // atomic: no temp left behind
  })

  it('re-importing the same file adds nothing and makes no commit', async () => {
    await fs.writeFile(db, 'text,author\nOne.,A\nTwo.,B\n', 'utf8')
    runImport(db)
    const after = commitCount()

    const out = runImport(db)
    expect(out).toMatch(/Nothing to import.*2 duplicates skipped/)
    expect((await pool()).quotes).toHaveLength(2)
    expect(commitCount()).toBe(after)
  })

  it('appends to quotes added in the dashboard, which survive untouched', async () => {
    const fd = new FormData()
    fd.set('text', 'Make it work, then make it right.')
    fd.set('author', 'Kent Beck')
    await addQuoteAction(fd)
    expect((await pool()).current).toBe(0)

    // The database re-states the dashboard quote (curly quotes and all) plus a new one.
    await fs.writeFile(
      db,
      'text,author\n"Make it work, then make it right.",Someone Else\nSecond thing.,B\n',
      'utf8',
    )
    runImport(db)

    const { quotes, current } = await pool()
    expect(quotes).toEqual([
      { text: 'Make it work, then make it right.', author: 'Kent Beck' }, // the user’s copy wins
      { text: 'Second thing.', author: 'B' },
    ])
    expect(current).toBe(0) // still pointing at the same quote
  })

  it('accepts JSON and YAML databases into the same pool', async () => {
    const json = path.join(inbox, 'db.json')
    const yaml = path.join(inbox, 'db.yaml')
    await fs.writeFile(json, JSON.stringify({ quotes: [{ text: 'From JSON.', author: 'J' }] }), 'utf8')
    await fs.writeFile(yaml, stringify([{ text: 'From YAML.', author: 'Y', tags: ['t'] }]), 'utf8')

    runImport(json)
    runImport(yaml)

    expect((await pool()).quotes).toEqual([
      { text: 'From JSON.', author: 'J' },
      { text: 'From YAML.', author: 'Y', tags: ['t'] },
    ])
  })

  it('writes nothing and commits nothing when the file is malformed', async () => {
    await fs.writeFile(db, 'text,author\nGood one.,A\n,B\n', 'utf8')
    const before = commitCount()

    expect(failImport(db)).toMatch(/row 3: missing a non-empty "text" field/)

    // Not even the valid first row landed — the import is all or nothing.
    expect((await pool()).quotes).toEqual([])
    expect(commitCount()).toBe(before)
    expect(git(dir, ['status', '--porcelain']).trim()).toBe('')
  })

  it('refuses an unknown extension and a missing file by name', async () => {
    const before = commitCount()
    expect(failImport(path.join(inbox, 'db.txt'))).toMatch(/Expected \.csv, \.json, \.yaml or \.yml/)
    expect(failImport(path.join(inbox, 'absent.csv'))).toMatch(/Cannot read /)
    expect(commitCount()).toBe(before)
  })
})

/* --------------------------------------------------------- the offline rule */

describe('the quote pool is local-only', () => {
  it('neither rotation nor import reaches the network', async () => {
    const sources = ['scripts/rotate-quote.ts', 'scripts/import-quotes.ts', 'lib/dashboard/quote-import.ts', 'lib/dashboard/quote-rotation.ts', 'lib/dashboard/quotes.ts']
    for (const rel of sources) {
      const text = await fs.readFile(path.join(repoRoot, rel), 'utf8')
      expect(text, rel).not.toMatch(/\bfetch\s*\(/)
      expect(text, rel).not.toMatch(/from ['"]node:(https?|net|dns)['"]/)
      expect(text, rel).not.toMatch(/https?:\/\//)
    }
  })
})
