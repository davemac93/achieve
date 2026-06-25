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

import { addTaskAction, deleteTaskAction, toggleTaskAction } from '../app/actions.ts'
import type { Task } from '../lib/dashboard/types.ts'

function git(cwd: string, args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' })
}

/** Init a temp dir as a git repo so the vault layer can commit into it. */
async function makeVaultRepo(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'achieve-tasks-'))
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

/** Read tasks straight from the file on disk (not through the data layer). */
async function readTasks(dir: string): Promise<Task[]> {
  const raw = await fs.readFile(path.join(dir, 'tasks.yaml'), 'utf8')
  return (parse(raw)?.tasks ?? []) as Task[]
}

function lastCommitSubject(dir: string): string {
  return git(dir, ['log', '-1', '--format=%s']).trim()
}

describe('task server actions write through to tasks.yaml', () => {
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

  it('adding a task persists it to tasks.yaml with a labeled commit', async () => {
    await addTaskAction(form({ title: 'Write the tests' }))

    const tasks = await readTasks(dir)
    expect(tasks).toHaveLength(1)
    expect(tasks[0]?.title).toBe('Write the tests')
    expect(tasks[0]?.done).toBe(false)
    expect(tasks[0]?.id).toBeTruthy()
    expect(tasks[0]?.created).toBeTruthy()
    expect(lastCommitSubject(dir)).toBe('dashboard: add task')
  })

  it('trims the title and records an optional goal link', async () => {
    await addTaskAction(form({ title: '  ship it  ', goal: 'weekly-1' }))

    const tasks = await readTasks(dir)
    expect(tasks[0]?.title).toBe('ship it')
    expect(tasks[0]?.goal).toBe('weekly-1')
  })

  it('ignores an empty title (no write, no commit)', async () => {
    await addTaskAction(form({ title: '   ' }))

    await expect(fs.access(path.join(dir, 'tasks.yaml'))).rejects.toThrow()
    // Only the repo's initial state — no mutation commit was made.
    expect(git(dir, ['rev-list', '--count', '--all']).trim()).toBe('0')
  })

  it('checking a task flips its done state', async () => {
    await addTaskAction(form({ title: 'toggle me' }))
    const id = (await readTasks(dir))[0]!.id

    await toggleTaskAction(id)
    expect((await readTasks(dir))[0]?.done).toBe(true)
    expect(lastCommitSubject(dir)).toBe('dashboard: toggle task')

    await toggleTaskAction(id)
    expect((await readTasks(dir))[0]?.done).toBe(false)
  })

  it('deleting removes only the targeted task', async () => {
    await addTaskAction(form({ title: 'keep' }))
    await addTaskAction(form({ title: 'remove' }))
    const tasks = await readTasks(dir)
    const target = tasks.find((t) => t.title === 'remove')!

    await deleteTaskAction(target.id)

    const remaining = await readTasks(dir)
    expect(remaining).toHaveLength(1)
    expect(remaining[0]?.title).toBe('keep')
    expect(lastCommitSubject(dir)).toBe('dashboard: delete task')
  })
})
