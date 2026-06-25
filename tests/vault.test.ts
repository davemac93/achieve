import { execFileSync } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openVault, type Vault } from '../lib/vault/index.ts'

function git(cwd: string, args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' })
}

/** Init a temp dir as a git repo so the vault module can commit into it. */
async function makeVaultRepo(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'achieve-vault-'))
  git(dir, ['init', '-q'])
  git(dir, ['config', 'user.name', 'test'])
  git(dir, ['config', 'user.email', 'test@localhost'])
  return dir
}

function commitCount(dir: string): number {
  try {
    return Number(git(dir, ['rev-list', '--count', 'HEAD']).trim())
  } catch {
    return 0 // no commits yet
  }
}

describe('vault I/O', () => {
  let dir: string
  let vault: Vault

  beforeEach(async () => {
    dir = await makeVaultRepo()
    vault = openVault(dir)
  })

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true })
  })

  it('writes content that reads back fully', async () => {
    await vault.write('tasks.yaml', 'tasks: []\n', { message: 'dashboard: init tasks' })
    expect(await vault.read('tasks.yaml')).toBe('tasks: []\n')
  })

  it('produces exactly one labeled commit per mutation', async () => {
    expect(commitCount(dir)).toBe(0)

    await vault.write('a.md', 'one', { message: 'writer: first' })
    expect(commitCount(dir)).toBe(1)

    await vault.write('b.md', 'two', { message: 'writer: second' })
    expect(commitCount(dir)).toBe(2)

    expect(git(dir, ['log', '-1', '--format=%s']).trim()).toBe('writer: second')
  })

  it('commits only the mutated path, even with unrelated changes present', async () => {
    // An untracked, unrelated file should not be swept into the mutation commit.
    await fs.writeFile(path.join(dir, 'unrelated.txt'), 'noise')
    await vault.write('tracked.md', 'hello', { message: 'writer: tracked only' })

    expect(commitCount(dir)).toBe(1)
    const committed = git(dir, ['show', '--name-only', '--format=', 'HEAD']).trim()
    expect(committed).toBe('tracked.md')
    expect(git(dir, ['status', '--porcelain']).trim()).toContain('unrelated.txt')
  })

  it('does not create a second commit for an identical rewrite', async () => {
    await vault.write('x.md', 'same', { message: 'writer: write' })
    expect(commitCount(dir)).toBe(1)
    await vault.write('x.md', 'same', { message: 'writer: rewrite-identical' })
    expect(commitCount(dir)).toBe(1)
  })

  it('leaves the target intact and no temp file when a write fails before rename', async () => {
    await vault.write('keep.yaml', 'tasks: []\n', { message: 'writer: seed' })

    // A non-serializable content value is rejected while writing the temp file,
    // before the rename — so the existing target must be left untouched.
    const bad = Symbol('not writable') as unknown as string
    await expect(
      vault.write('keep.yaml', bad, { message: 'writer: should-fail' }),
    ).rejects.toThrow()

    // Target unchanged...
    expect(await vault.read('keep.yaml')).toBe('tasks: []\n')
    // ...no extra commit...
    expect(commitCount(dir)).toBe(1)
    // ...and no stray temp file left behind.
    const leftovers = (await fs.readdir(dir)).filter((f) => f.includes('.tmp'))
    expect(leftovers).toEqual([])
  })

  it('round-trips YAML through writeYaml/readYaml', async () => {
    await vault.writeYaml('tasks.yaml', { tasks: [{ id: '1', title: 'go', done: false }] }, {
      message: 'dashboard: add task',
    })
    const data = await vault.readYaml<{ tasks: { id: string; title: string; done: boolean }[] }>(
      'tasks.yaml',
    )
    expect(data.tasks[0]).toEqual({ id: '1', title: 'go', done: false })
  })

  it('removes a file and commits the deletion', async () => {
    await vault.write('temp.md', 'bye', { message: 'writer: create' })
    await vault.remove('temp.md', { message: 'writer: delete' })
    expect(await vault.exists('temp.md')).toBe(false)
    expect(commitCount(dir)).toBe(2)
    expect(git(dir, ['log', '-1', '--format=%s']).trim()).toBe('writer: delete')
  })

  it('refuses paths that escape the vault', () => {
    expect(() => vault.resolve('../escape')).toThrow(/escapes the vault/)
    expect(() => vault.resolve('/etc/passwd')).toThrow(/escapes the vault/)
  })
})
