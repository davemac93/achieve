import { execFileSync } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/cache', () => ({ revalidatePath: () => {} }))

import { addTaskAction, setStepDoneAction } from '../app/actions.ts'
import { getGoalStatus, getGoalTreeView, setStepDone } from '../lib/dashboard/goals.ts'
import { getEvidence } from '../lib/dashboard/evidence.ts'
import { getTasks } from '../lib/dashboard/tasks.ts'
import { computeGoalProgress, doneIds } from '../lib/dashboard/goal-progress.ts'
import { orderGoalTree, validateGoalTree } from '../lib/dashboard/goal-tree.ts'
import {
  migrateGoals,
  renderGoalsFile,
  renderStatusFile,
} from '../lib/dashboard/goal-content.ts'
import type { Goal } from '../lib/dashboard/types.ts'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))
const SKILL = path.join(repoRoot, 'template', '.claude', 'skills', 'goals', 'SKILL.md')
const MIGRATE = path.join(repoRoot, 'scripts', 'migrate-goals.ts')

function git(cwd: string, args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' })
}

function lastCommitSubject(dir: string): string {
  return git(dir, ['log', '-1', '--format=%s']).trim()
}

async function makeVaultRepo(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'achieve-goals-'))
  git(dir, ['init', '-q'])
  git(dir, ['config', 'user.name', 'test'])
  git(dir, ['config', 'user.email', 'test@localhost'])
  return dir
}

// A small, fully-linked tree: direction -> yearly -> monthly -> weekly.
const TREE: Goal[] = [
  { id: 'v', horizon: 'direction', title: 'Vision' },
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
      { id: 'v', horizon: 'direction', title: 'Vision' },
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

  it('rejects the retired 3yr horizon', () => {
    const report = validateGoalTree([{ id: 'v', horizon: '3yr' as Goal['horizon'], title: 'Old root' }])
    expect(report.ok).toBe(false)
    expect(report.errors.some((e) => /invalid horizon "3yr"/.test(e.message))).toBe(true)
  })

  it('refuses to let a direction carry work', () => {
    const report = validateGoalTree([
      {
        id: 'v',
        horizon: 'direction',
        title: 'Vision',
        kind: 'do',
        after: ['x'],
        skill: 'k8s',
        topic: 'kubernetes',
      },
    ])
    expect(report.ok).toBe(false)
    for (const field of ['kind', 'after', 'skill', 'topic']) {
      expect(report.errors.some((e) => e.message.includes(`\`${field}\``))).toBe(true)
    }
  })

  it('keeps `topic` on learn steps — a curriculum is how a capability is acquired', () => {
    const learn = validateGoalTree([
      ...TREE,
      { id: 's', horizon: 'weekly', title: 'Learn k8s', parent: 'm', kind: 'learn', topic: 'kubernetes' },
    ])
    expect(learn.ok).toBe(true)

    const doStep = validateGoalTree([
      ...TREE,
      { id: 's', horizon: 'weekly', title: 'Ship it', parent: 'm', kind: 'do', topic: 'kubernetes' },
    ])
    expect(doStep.errors.some((e) => /`topic` belongs to a `kind: learn` step/.test(e.message))).toBe(
      true,
    )
  })

  it('flags an invalid kind', () => {
    const report = validateGoalTree([
      ...TREE,
      { id: 's', horizon: 'weekly', title: 'Odd', parent: 'm', kind: 'ponder' as Goal['kind'] },
    ])
    expect(report.errors.some((e) => /invalid kind "ponder"/.test(e.message))).toBe(true)
  })
})

describe('validateGoalTree — prerequisites', () => {
  /** Two monthly steps under the shared tree, with whatever `after` a case needs. */
  const withSteps = (...steps: Goal[]): Goal[] => [...TREE, ...steps]

  it('accepts a prerequisite chain', () => {
    const report = validateGoalTree(
      withSteps(
        { id: 'a', horizon: 'monthly', title: 'Research', parent: 'y', kind: 'learn' },
        { id: 'b', horizon: 'monthly', title: 'Commit', parent: 'y', kind: 'do', after: ['a'] },
      ),
    )
    expect(report.ok).toBe(true)
  })

  it('flags a prerequisite that does not exist', () => {
    const report = validateGoalTree(
      withSteps({ id: 'b', horizon: 'monthly', title: 'Commit', parent: 'y', after: ['ghost'] }),
    )
    expect(report.errors.some((e) => /prerequisite "ghost" not found/.test(e.message))).toBe(true)
  })

  it('refuses a prerequisite that is a direction — a north star is never done', () => {
    const report = validateGoalTree(
      withSteps({ id: 'b', horizon: 'monthly', title: 'Commit', parent: 'y', after: ['v'] }),
    )
    expect(report.errors.some((e) => /is a direction/.test(e.message))).toBe(true)
  })

  it('flags a step that comes after itself', () => {
    const report = validateGoalTree(
      withSteps({ id: 'b', horizon: 'monthly', title: 'Loop', parent: 'y', after: ['b'] }),
    )
    expect(report.errors.some((e) => /cannot come after itself/.test(e.message))).toBe(true)
  })

  it('flags a two-step cycle (A after B after A)', () => {
    const report = validateGoalTree(
      withSteps(
        { id: 'a', horizon: 'monthly', title: 'A', parent: 'y', after: ['b'] },
        { id: 'b', horizon: 'monthly', title: 'B', parent: 'y', after: ['a'] },
      ),
    )
    expect(report.ok).toBe(false)
    const cyclic = report.errors.filter((e) => /prerequisite cycle/.test(e.message))
    expect(cyclic.map((e) => e.id).sort()).toEqual(['a', 'b'])
  })

  it('flags a longer cycle and leaves the acyclic rest alone', () => {
    const report = validateGoalTree(
      withSteps(
        { id: 'a', horizon: 'monthly', title: 'A', parent: 'y', after: ['c'] },
        { id: 'b', horizon: 'monthly', title: 'B', parent: 'y', after: ['a'] },
        { id: 'c', horizon: 'monthly', title: 'C', parent: 'y', after: ['b'] },
        { id: 'd', horizon: 'monthly', title: 'D', parent: 'y' },
      ),
    )
    const cyclic = report.errors.filter((e) => /prerequisite cycle/.test(e.message))
    expect(cyclic.map((e) => e.id).sort()).toEqual(['a', 'b', 'c'])
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

  it('puts a prerequisite before the sibling that waits on it', () => {
    const goals: Goal[] = [
      ...TREE.slice(0, 2),
      { id: 'lease', horizon: 'monthly', title: 'Sign the lease', parent: 'y', after: ['site', 'concept'] },
      { id: 'concept', horizon: 'monthly', title: 'Define the concept', parent: 'y', after: ['demand'] },
      { id: 'site', horizon: 'monthly', title: 'Find a location', parent: 'y', after: ['demand'] },
      { id: 'demand', horizon: 'monthly', title: 'Research demand', parent: 'y' },
    ]
    expect(orderGoalTree(goals).map((g) => g.id)).toEqual([
      'v',
      'y',
      'demand',
      'concept',
      'site',
      'lease',
    ])
  })

  it('emits every sibling even when their prerequisites cycle', () => {
    const goals: Goal[] = [
      ...TREE.slice(0, 2),
      { id: 'a', horizon: 'monthly', title: 'A', parent: 'y', after: ['b'] },
      { id: 'b', horizon: 'monthly', title: 'B', parent: 'y', after: ['a'] },
    ]
    expect(orderGoalTree(goals).map((g) => g.id).sort()).toEqual(['a', 'b', 'v', 'y'])
  })
})

describe('derived progress', () => {
  /**
   * Deliberately lopsided: one monthly goal holds three steps, the other holds
   * one. Unweighted means all four leaves count the same — the small branch
   * does not get half the credit for being small.
   */
  const LOPSIDED: Goal[] = [
    { id: 'v', horizon: 'direction', title: 'Vision' },
    { id: 'y', horizon: 'yearly', title: 'Year', parent: 'v' },
    { id: 'm1', horizon: 'monthly', title: 'Big month', parent: 'y' },
    { id: 'm2', horizon: 'monthly', title: 'Small month', parent: 'y' },
    { id: 's1', horizon: 'weekly', title: 'One', parent: 'm1' },
    { id: 's2', horizon: 'weekly', title: 'Two', parent: 'm1' },
    { id: 's3', horizon: 'weekly', title: 'Three', parent: 'm1' },
    { id: 's4', horizon: 'weekly', title: 'Four', parent: 'm2' },
  ]

  it('is the unweighted share of leaf steps ticked, rolled up', () => {
    const progress = computeGoalProgress(LOPSIDED, new Set(['s1', 's4']))
    // The small branch is complete, the big one is a third done — and the year
    // is 2/4, not the 1/2 an average-of-children rule would have produced.
    expect(progress.get('m2')!.percent).toBe(100)
    expect(progress.get('m1')!.percent).toBe(33)
    expect(progress.get('y')!).toMatchObject({ percent: 50, doneSteps: 2, totalSteps: 4 })
  })

  it('gives a direction counts but no percentage', () => {
    const progress = computeGoalProgress(LOPSIDED, new Set(['s1', 's4']))
    expect(progress.get('v')!).toMatchObject({
      percent: null,
      doneSteps: 2,
      totalSteps: 4,
      leaf: false,
    })
  })

  it('treats only childless non-directions as leaves', () => {
    const progress = computeGoalProgress(LOPSIDED, new Set())
    expect(progress.get('s1')!.leaf).toBe(true)
    expect(progress.get('m1')!.leaf).toBe(false)
    expect(progress.get('v')!.leaf).toBe(false)
    // A direction with nothing under it is still not tickable.
    const lone = computeGoalProgress([{ id: 'v', horizon: 'direction', title: 'V' }], new Set())
    expect(lone.get('v')!).toMatchObject({ leaf: false, totalSteps: 0, percent: null })
  })

  it('marks a branch complete only when every leaf under it is ticked', () => {
    const partial = computeGoalProgress(LOPSIDED, new Set(['s1', 's2']))
    expect(partial.get('m1')!.complete).toBe(false)
    const whole = computeGoalProgress(LOPSIDED, new Set(['s1', 's2', 's3']))
    expect(whole.get('m1')!.complete).toBe(true)
    expect(whole.get('y')!.complete).toBe(false)
  })

  it('reads ticked ids out of the status file shape', () => {
    expect(doneIds({ a: { done: true }, b: { done: false } })).toEqual(new Set(['a']))
  })
})

describe('blocked steps', () => {
  /** The restaurant chain: nothing irreversible before what justifies it. */
  const CHAIN: Goal[] = [
    { id: 'r', horizon: 'direction', title: 'Run a restaurant' },
    { id: 'decide', horizon: 'yearly', title: 'Decide and be ready', parent: 'r' },
    { id: 'demand', horizon: 'monthly', title: 'Research demand', parent: 'decide', kind: 'learn' },
    { id: 'concept', horizon: 'monthly', title: 'Define the concept', parent: 'decide', kind: 'do', after: ['demand'] },
    { id: 'lease', horizon: 'monthly', title: 'Sign the lease', parent: 'decide', kind: 'do', after: ['concept'] },
    { id: 'deposit', horizon: 'weekly', title: 'Wire the deposit', parent: 'lease', kind: 'do' },
  ]

  it('blocks a step whose prerequisite is unfinished', () => {
    const progress = computeGoalProgress(CHAIN, new Set())
    expect(progress.get('demand')!.blockedBy).toEqual([])
    expect(progress.get('concept')!.blockedBy).toEqual(['demand'])
  })

  it('unblocks it once the prerequisite is complete', () => {
    const progress = computeGoalProgress(CHAIN, new Set(['demand']))
    expect(progress.get('concept')!.blockedBy).toEqual([])
    expect(progress.get('lease')!.blockedBy).toEqual(['concept'])
  })

  it('inherits blocking from an ancestor, so no child slips past the chain', () => {
    // `deposit` has no `after` of its own; it is blocked because its parent is
    // — which is what stops money moving before the lease is signable.
    const progress = computeGoalProgress(CHAIN, new Set())
    expect(progress.get('deposit')!.blockedBy).toEqual(['concept'])
    // And it clears only when the chain above it has actually run.
    const later = computeGoalProgress(CHAIN, new Set(['demand', 'concept']))
    expect(later.get('deposit')!.blockedBy).toEqual([])
  })

  it('treats an unknown prerequisite as unmet — a typo never unlocks anything', () => {
    const progress = computeGoalProgress(
      [{ id: 'x', horizon: 'weekly', title: 'X', orphan: true, after: ['ghost'] }],
      new Set(),
    )
    expect(progress.get('x')!.blockedBy).toEqual(['ghost'])
  })
})

describe('ticking a step writes only goal-status.yaml', () => {
  let dir: string
  // direction -> yearly -> two monthly steps, the second waiting on the first.
  const GOALS_YAML = `goals:
  - id: v
    horizon: direction
    title: Vision
  - id: y
    horizon: yearly
    title: This year
    parent: v
  - id: first
    horizon: monthly
    title: Research it
    kind: learn
    parent: y
    skill: Kubernetes
  - id: second
    horizon: monthly
    title: Commit to it
    kind: do
    parent: y
    after:
      - first
`

  beforeEach(async () => {
    dir = await makeVaultRepo()
    process.env.ACHIEVE_VAULT_DIR = dir
    await fs.writeFile(path.join(dir, 'goals.yaml'), GOALS_YAML, 'utf8')
  })

  afterEach(async () => {
    delete process.env.ACHIEVE_VAULT_DIR
    await fs.rm(dir, { recursive: true, force: true })
  })

  it('ticks into goal-status.yaml without touching goals.yaml', async () => {
    await setStepDoneAction('first', true)

    expect(await getGoalStatus()).toEqual({ first: { done: true } })
    // One click, two labeled commits: the tick, then the evidence it earned
    // (this step carries `skill: Kubernetes`).
    expect(git(dir, ['log', '--format=%s']).trim().split('\n')).toEqual([
      'dashboard: append evidence',
      'dashboard: tick goal step',
    ])
    // The /goals skill owns goals.yaml — byte-for-byte untouched.
    expect(await fs.readFile(path.join(dir, 'goals.yaml'), 'utf8')).toBe(GOALS_YAML)
    // …and there is no progress field to be found anywhere in the status file.
    expect(await fs.readFile(path.join(dir, 'goal-status.yaml'), 'utf8')).not.toMatch(
      /^\s*progress:/m,
    )
  })

  it('rolls the tick up into the goals above it', async () => {
    await setStepDoneAction('first', true)

    const view = await getGoalTreeView()
    const by = new Map(view.map((g) => [g.id, g]))
    expect(by.get('y')!.percent).toBe(50)
    expect(by.get('v')!.percent).toBeNull()
    // Ordered for display: parents first, prerequisites before dependants.
    expect(view.map((g) => g.id)).toEqual(['v', 'y', 'first', 'second'])
  })

  it('refuses a direction, a container, and a blocked step', async () => {
    await expect(setStepDone('v', true)).rejects.toThrow(/north star/)
    await expect(setStepDone('y', true)).rejects.toThrow(/derived/)
    await expect(setStepDone('second', true)).rejects.toThrow(/blocked/)
  })

  it('allows unticking a blocked step — clearing a claim is never a shortcut', async () => {
    // Tick the prerequisite, tick the dependant, then take the prerequisite
    // back: `second` is now both done and blocked, and must be clearable.
    await setStepDoneAction('first', true)
    await setStepDoneAction('second', true)
    await setStepDoneAction('first', false)

    await expect(setStepDone('second', false)).resolves.toMatchObject({ id: 'second' })
    expect((await getGoalStatus()).second).toEqual({ done: false })
  })
})

describe('a ticked step tagged with a skill becomes profile evidence', () => {
  let dir: string

  beforeEach(async () => {
    dir = await makeVaultRepo()
    process.env.ACHIEVE_VAULT_DIR = dir
    await fs.writeFile(
      path.join(dir, 'goals.yaml'),
      `goals:
  - id: tagged
    horizon: weekly
    title: Ship the operator
    kind: do
    orphan: true
    skill: Kubernetes
  - id: untagged
    horizon: weekly
    title: Tidy the desk
    kind: do
    orphan: true
`,
      'utf8',
    )
  })

  afterEach(async () => {
    delete process.env.ACHIEVE_VAULT_DIR
    await fs.rm(dir, { recursive: true, force: true })
  })

  it('appends one record, sourced back to the step', async () => {
    await setStepDoneAction('tagged', true)

    const evidence = await getEvidence()
    expect(evidence).toHaveLength(1)
    expect(evidence[0]).toMatchObject({
      skill: 'Kubernetes',
      what: 'Ship the operator',
      source: 'goals:tagged',
    })
  })

  it('re-ticking never inflates the count, and unticking never retracts it', async () => {
    await setStepDoneAction('tagged', true)
    await setStepDoneAction('tagged', false)
    await setStepDoneAction('tagged', true)

    // Append-only: the work happened, whatever the step says now.
    expect(await getEvidence()).toHaveLength(1)
  })

  it('leaves the log alone for an untagged step', async () => {
    await setStepDoneAction('untagged', true)
    expect(await getEvidence()).toEqual([])
  })
})

describe('migrating a vault written before the v2 goal schema', () => {
  const LEGACY_GOALS = `goals:
  - id: vision-money
    horizon: 3yr
    title: Financial independence
  - id: year-income
    horizon: yearly
    title: Raise income
    parent: vision-money
  - id: month-cv
    horizon: monthly
    title: Rewrite the CV
    parent: year-income
`
  const LEGACY_STATUS = `status:
  vision-money:
    status: in-progress
    progress: 10
  year-income:
    status: in-progress
    progress: 40
  month-cv:
    status: done
    progress: 100
`

  let dir: string

  beforeEach(async () => {
    dir = await makeVaultRepo()
    process.env.ACHIEVE_VAULT_DIR = dir
    await fs.writeFile(path.join(dir, 'goals.yaml'), LEGACY_GOALS, 'utf8')
    await fs.writeFile(path.join(dir, 'goal-status.yaml'), LEGACY_STATUS, 'utf8')
    git(dir, ['add', '-A'])
    git(dir, ['commit', '-q', '-m', 'seed'])
  })

  afterEach(async () => {
    delete process.env.ACHIEVE_VAULT_DIR
    await fs.rm(dir, { recursive: true, force: true })
  })

  it('demotes 3yr to direction and keeps every id', () => {
    const migration = migrateGoals(
      { goals: [{ id: 'a', horizon: '3yr', title: 'Old' }, { id: 'b', horizon: 'yearly', title: 'Child', parent: 'a' }] },
      null,
    )
    expect(migration.goals.map((g) => g.id)).toEqual(['a', 'b'])
    expect(migration.goals[0]!.horizon).toBe('direction')
    // The child still points at the same parent id, so nothing detaches.
    expect(migration.goals[1]!.parent).toBe('a')
    expect(validateGoalTree(migration.goals).ok).toBe(true)
  })

  it('drops typed progress, and status that no longer means anything', () => {
    const migration = migrateGoals(
      { goals: [{ id: 'a', horizon: '3yr', title: 'Old' }, { id: 'b', horizon: 'yearly', title: 'Child', parent: 'a' }, { id: 'c', horizon: 'monthly', title: 'Step', parent: 'b' }] },
      { status: { a: { status: 'in-progress', progress: 10 }, b: { status: 'in-progress', progress: 40 }, c: { status: 'done', progress: 100 } } },
    )
    // Only the leaf keeps state; the direction and the container derive theirs.
    expect(migration.status).toEqual({ c: { done: true } })
    expect(migration.changes.map((c) => `${c.id}: ${c.message}`)).toEqual([
      'a: 3yr goal becomes a direction — a north star, no longer tracked',
      'a: status dropped — a direction is never done',
      'b: status dropped — progress is derived from the steps beneath it',
      'c: "done" (100%) becomes done: true — progress is the share of steps ticked now, never a typed number',
    ])
  })

  it('reports nothing to do for a vault already on the v2 schema', () => {
    const migration = migrateGoals({ goals: [{ id: 'a', horizon: 'direction', title: 'North' }] }, { status: {} })
    expect(migration.clean).toBe(true)
  })

  it('the default script run writes nothing', async () => {
    const out = execFileSync('node', [MIGRATE], {
      cwd: repoRoot,
      env: { ...process.env, ACHIEVE_VAULT_DIR: dir },
      encoding: 'utf8',
    })

    expect(out).toMatch(/Preview only/)
    expect(out).toMatch(/vision-money: 3yr goal becomes a direction/)
    // Both files are byte-identical, and no commit was made.
    expect(await fs.readFile(path.join(dir, 'goals.yaml'), 'utf8')).toBe(LEGACY_GOALS)
    expect(await fs.readFile(path.join(dir, 'goal-status.yaml'), 'utf8')).toBe(LEGACY_STATUS)
    expect(lastCommitSubject(dir)).toBe('seed')
  })

  it('--write lands both files, preserving ids and the ticks attached to them', async () => {
    execFileSync('node', [MIGRATE, '--write'], {
      cwd: repoRoot,
      env: { ...process.env, ACHIEVE_VAULT_DIR: dir },
      encoding: 'utf8',
    })

    const view = await getGoalTreeView()
    expect(view.map((g) => g.id)).toEqual(['vision-money', 'year-income', 'month-cv'])
    expect(view[0]!.horizon).toBe('direction')
    // The tick that was `status: done` survived, and now rolls up on its own.
    expect(await getGoalStatus()).toEqual({ 'month-cv': { done: true } })
    expect(view[1]!.percent).toBe(100)
    expect(view[0]!.percent).toBeNull()
    // Each file went through the vault layer with its own writer's label.
    expect(git(dir, ['log', '-2', '--format=%s']).trim().split('\n')).toEqual([
      'dashboard: migrate goal status to done/not-done',
      '/goals: migrate 3yr goals to directions',
    ])
  })
})

describe('the template files are what the renderers produce', () => {
  it('goals.yaml and goal-status.yaml match, so a migrated file documents itself', async () => {
    const templateDir = path.join(repoRoot, 'template')
    expect(await fs.readFile(path.join(templateDir, 'goals.yaml'), 'utf8')).toBe(
      renderGoalsFile([]),
    )
    expect(await fs.readFile(path.join(templateDir, 'goal-status.yaml'), 'utf8')).toBe(
      renderStatusFile({}),
    )
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
    // Must not write the dashboard-owned status or evidence files.
    expect(skill).toMatch(/goal-status\.yaml[\s\S]*?never write/i)
    expect(skill).toMatch(/`profile\/evidence\.yaml`[\s\S]*?never write it/i)
    // Privacy wall.
    expect(skill).toMatch(/`diary\/` is categorically off-limits/i)
    expect(skill).toMatch(/`type: private` notes are human-only/i)
    // Leans on the shared validator.
    expect(skill).toMatch(/validateGoalTree/)
  })

  it('runs discovery from cited evidence before decomposing anything', async () => {
    const skill = await fs.readFile(SKILL, 'utf8')
    expect(skill).toMatch(/## Phase 1 — Discover/)
    expect(skill).toMatch(/## Phase 3 — Decompose/)
    // Candidates must come from the user's data, with the file that produced them.
    expect(skill).toMatch(/each with its evidence cited by file/i)
    expect(skill).toMatch(/A candidate with nothing behind it is not a candidate/i)
    // Phase 5's jobs module may not exist yet — absence must degrade, not error.
    expect(skill).toMatch(/jobs\/\*\/fit\.md/)
    expect(skill).toMatch(/Modules the user has not enabled simply are not there/i)
  })

  it('enforces the twelve-month ceiling and pushes back on the infeasible', async () => {
    const skill = await fs.readFile(SKILL, 'utf8')
    expect(skill).toMatch(/hard ceiling/i)
    expect(skill).toMatch(/never propose a goal that cannot finish within a year/i)
    expect(skill).toMatch(/Porsche in 2 months/)
    // The worked prerequisite chain, and the rule it exists to enforce.
    expect(skill).toMatch(/after: \[define-concept, find-location\]/)
    expect(skill).toMatch(
      /No irreversible step may come\s+before the steps that justify it/i,
    )
  })

  it('never writes a progress number, and knows the migration path', async () => {
    const skill = await fs.readFile(SKILL, 'utf8')
    expect(skill).toMatch(/never write a progress number anywhere/i)
    expect(skill).toMatch(/npm run migrate-goals/)
    expect(skill).toMatch(/preview — writes nothing/i)
  })
})
