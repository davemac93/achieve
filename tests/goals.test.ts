import { execFileSync } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/cache', () => ({ revalidatePath: () => {} }))

import { addTaskAction, setGoalStatusAction } from '../app/actions.ts'
import { getGoalStatus } from '../lib/dashboard/goals.ts'
import { getTasks } from '../lib/dashboard/tasks.ts'
import { orderGoalTree, validateGoalTree } from '../lib/dashboard/goal-tree.ts'
import type { Goal } from '../lib/dashboard/types.ts'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))
const SKILL = path.join(repoRoot, 'template', '.claude', 'skills', 'goals', 'SKILL.md')

function git(cwd: string, args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' })
}

async function makeVaultRepo(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'achieve-goals-'))
  git(dir, ['init', '-q'])
  git(dir, ['config', 'user.name', 'test'])
  git(dir, ['config', 'user.email', 'test@localhost'])
  return dir
}

// A small, fully-linked tree: 3yr -> yearly -> monthly -> weekly.
const TREE: Goal[] = [
  { id: 'v', horizon: '3yr', title: 'Vision' },
  { id: 'y', horizon: 'yearly', title: 'This year', parent: 'v' },
  { id: 'm', horizon: 'monthly', title: 'This month', parent: 'y' },
  { id: 'w', horizon: 'weekly', title: 'This week', parent: 'm' },
]

describe('validateGoalTree', () => {
  it('accepts a fully-linked tree', () => {
    const report = validateGoalTree(TREE)
    expect(report.ok).toBe(true)
    expect(report.errors).toEqual([])
    expect(report.orphans).toEqual([])
  })

  it('flags a duplicate id', () => {
    const report = validateGoalTree([...TREE, { id: 'w', horizon: 'weekly', title: 'Dup', parent: 'm' }])
    expect(report.ok).toBe(false)
    expect(report.errors.some((e) => /duplicate id/.test(e.message))).toBe(true)
  })

  it('flags a parent that does not exist', () => {
    const report = validateGoalTree([{ id: 'w', horizon: 'weekly', title: 'Lonely', parent: 'nope' }])
    expect(report.ok).toBe(false)
    expect(report.errors.some((e) => /not found/.test(e.message))).toBe(true)
    expect(report.orphans).toContain('w')
  })

  it('flags a parent at the wrong horizon', () => {
    const report = validateGoalTree([
      { id: 'v', horizon: '3yr', title: 'Vision' },
      { id: 'w', horizon: 'weekly', title: 'Skips levels', parent: 'v' },
    ])
    expect(report.ok).toBe(false)
    expect(report.errors.some((e) => /parent must be a monthly goal/.test(e.message))).toBe(true)
  })

  it('errors on an unflagged non-root orphan but accepts a flagged one', () => {
    const unflagged = validateGoalTree([{ id: 'w', horizon: 'weekly', title: 'Stray' }])
    expect(unflagged.ok).toBe(false)
    expect(unflagged.orphans).toContain('w')

    const flagged = validateGoalTree([{ id: 'w', horizon: 'weekly', title: 'Stray', orphan: true }])
    expect(flagged.ok).toBe(true)
    expect(flagged.orphans).toContain('w')
  })
})

describe('orderGoalTree', () => {
  it('emits each parent immediately before its descendants', () => {
    const shuffled = [TREE[3]!, TREE[1]!, TREE[0]!, TREE[2]!]
    expect(orderGoalTree(shuffled).map((g) => g.id)).toEqual(['v', 'y', 'm', 'w'])
  })

  it('still emits nodes whose parent is missing', () => {
    const ids = orderGoalTree([{ id: 'w', horizon: 'weekly', title: 'Stray', parent: 'gone' }]).map(
      (g) => g.id,
    )
    expect(ids).toEqual(['w'])
  })
})

describe('dashboard goal-status writes only goal-status.yaml', () => {
  let dir: string

  beforeEach(async () => {
    dir = await makeVaultRepo()
    process.env.ACHIEVE_VAULT_DIR = dir
  })

  afterEach(async () => {
    delete process.env.ACHIEVE_VAULT_DIR
    await fs.rm(dir, { recursive: true, force: true })
  })

  it('toggles status into goal-status.yaml without touching goals.yaml', async () => {
    // The /goals skill owns this file; the dashboard must never rewrite it.
    const goalsYaml = 'goals:\n  - id: w\n    horizon: weekly\n    title: This week\n'
    await fs.writeFile(path.join(dir, 'goals.yaml'), goalsYaml, 'utf8')

    await setGoalStatusAction('w', 'in-progress')

    expect(await getGoalStatus()).toEqual({ w: { status: 'in-progress' } })
    expect(git(dir, ['log', '-1', '--format=%s']).trim()).toBe('dashboard: set goal status')
    // goals.yaml is byte-for-byte untouched — no second writer.
    expect(await fs.readFile(path.join(dir, 'goals.yaml'), 'utf8')).toBe(goalsYaml)
  })
})

describe('a task can be linked to a weekly goal id', () => {
  let dir: string

  beforeEach(async () => {
    dir = await makeVaultRepo()
    process.env.ACHIEVE_VAULT_DIR = dir
  })

  afterEach(async () => {
    delete process.env.ACHIEVE_VAULT_DIR
    await fs.rm(dir, { recursive: true, force: true })
  })

  it('persists the goal id on the task', async () => {
    const fd = new FormData()
    fd.set('title', 'Ship the thing')
    fd.set('goal', 'w')
    await addTaskAction(fd)

    const tasks = await getTasks()
    const task = tasks[0]!
    expect(task.title).toBe('Ship the thing')
    expect(task.goal).toBe('w')
  })

  it('leaves the link unset when no goal is chosen', async () => {
    const fd = new FormData()
    fd.set('title', 'Loose task')
    fd.set('goal', '')
    await addTaskAction(fd)

    const tasks = await getTasks()
    expect(tasks[0]!.goal).toBeUndefined()
  })
})

describe('/goals skill definition declares its contract', () => {
  it('ships a SKILL.md scaffolded into the vault', async () => {
    expect(await fs.stat(SKILL).then((s) => s.isFile())).toBe(true)
  })

  it('is approve-gated, writes only goals.yaml, and honors the privacy wall', async () => {
    const skill = await fs.readFile(SKILL, 'utf8')
    expect(skill).toMatch(/never write without approval/i)
    expect(skill).toMatch(/write \*\*exactly one file: `goals\.yaml`/i)
    // Must not write the dashboard-owned status file.
    expect(skill).toMatch(/goal-status\.yaml[\s\S]*?never write/i)
    // Privacy wall.
    expect(skill).toMatch(/`diary\/` is categorically off-limits/i)
    expect(skill).toMatch(/`type: private` notes are human-only/i)
    // Leans on the shared validator.
    expect(skill).toMatch(/validateGoalTree/)
  })
})
