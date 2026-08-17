import { execFileSync } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/cache', () => ({ revalidatePath: () => {} }))

import { setCurriculumItemDoneAction } from '../app/actions.ts'
import { getEvidence } from '../lib/dashboard/evidence.ts'
import {
  getLearnStatus,
  getSession,
  getTopic,
  getTopics,
  setCurriculumItemDone,
} from '../lib/dashboard/learn.ts'
import {
  buildPlanFile,
  buildSessionFile,
  computeCurriculumView,
  curriculumSteps,
  normalizeTopicPlan,
  topicSlug,
  validateCurriculum,
  type CurriculumItem,
} from '../lib/dashboard/learn-content.ts'
import { getGoalTreeView } from '../lib/dashboard/goals.ts'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))
const WRITE_LEARN = path.join(repoRoot, 'scripts', 'write-learn.ts')

function git(cwd: string, args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' })
}

function commitCount(dir: string): number {
  return Number(git(dir, ['rev-list', '--count', '--all']).trim())
}

function lastCommitSubject(dir: string): string {
  return git(dir, ['log', '-1', '--format=%s']).trim()
}

async function makeVaultRepo(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'achieve-learn-'))
  git(dir, ['init', '-q'])
  git(dir, ['config', 'user.name', 'test'])
  git(dir, ['config', 'user.email', 'test@localhost'])
  return dir
}

async function write(dir: string, rel: string, content: string): Promise<void> {
  const full = path.join(dir, rel)
  await fs.mkdir(path.dirname(full), { recursive: true })
  await fs.writeFile(full, content, 'utf8')
}

/** A three-item curriculum with one real prerequisite chain and one skill tag. */
const ITEMS: CurriculumItem[] = [
  { id: 'lab', title: 'Run a three-node cluster', kind: 'do', after: ['pods'], skill: 'Kubernetes' },
  { id: 'pods', title: 'What a pod is', kind: 'learn' },
  { id: 'ingress', title: 'Services and ingress', kind: 'learn', after: ['pods'] },
]

const PLAN = `---
title: Kubernetes
why: acme-platform-engineer/fit.md lists Kubernetes as a missing requirement.
goal: k8s-working
job: acme-platform-engineer
started: 2026-08-16
curriculum:
  - { id: lab, title: Run a three-node cluster, kind: do, after: [pods], skill: Kubernetes }
  - { id: pods, title: What a pod is, kind: learn }
  - { id: ingress, title: Services and ingress, kind: learn, after: [pods] }
---

Resources: the docs, and the cluster at work.
`

/* ------------------------------------------------------------------------- */
/* A curriculum item is a goal step — the same rules, from the same code       */
/* ------------------------------------------------------------------------- */

describe('a curriculum item is a goal step', () => {
  it('maps onto tickable weekly leaves, keeping kind, after and skill', () => {
    expect(curriculumSteps(ITEMS)).toEqual([
      {
        id: 'lab',
        horizon: 'weekly',
        title: 'Run a three-node cluster',
        orphan: true,
        kind: 'do',
        after: ['pods'],
        skill: 'Kubernetes',
      },
      { id: 'pods', horizon: 'weekly', title: 'What a pod is', orphan: true, kind: 'learn' },
      {
        id: 'ingress',
        horizon: 'weekly',
        title: 'Services and ingress',
        orphan: true,
        kind: 'learn',
        after: ['pods'],
      },
    ])
  })

  it('orders prerequisites before what waits on them, whatever the file order', () => {
    const view = computeCurriculumView(ITEMS, new Set())
    expect(view.items.map((item) => item.id)).toEqual(['pods', 'ingress', 'lab'])
  })

  it('blocks an item until its prerequisites are ticked', () => {
    const before = computeCurriculumView(ITEMS, new Set())
    expect(before.items.find((i) => i.id === 'lab')?.blockedBy).toEqual(['pods'])

    const after = computeCurriculumView(ITEMS, new Set(['pods']))
    expect(after.items.find((i) => i.id === 'lab')?.blockedBy).toEqual([])
  })

  it('derives progress as the unweighted share of items ticked', () => {
    expect(computeCurriculumView(ITEMS, new Set()).percent).toBe(0)
    expect(computeCurriculumView(ITEMS, new Set(['pods'])).percent).toBe(33)
    const done = computeCurriculumView(ITEMS, new Set(['pods', 'lab', 'ingress']))
    expect(done).toMatchObject({ percent: 100, doneItems: 3, totalItems: 3, complete: true })
  })

  it('reports an empty curriculum as 0%, not complete', () => {
    expect(computeCurriculumView([], new Set())).toMatchObject({
      percent: 0,
      complete: false,
      totalItems: 0,
    })
  })

  it('rejects the same things `goals.yaml` rejects', () => {
    const cycle = validateCurriculum([
      { id: 'a', title: 'A', after: ['b'] },
      { id: 'b', title: 'B', after: ['a'] },
    ])
    expect(cycle.ok).toBe(false)
    expect(cycle.errors.map((e) => e.message).join(' ')).toMatch(/prerequisite cycle/)

    expect(validateCurriculum([{ id: 'a', title: 'A', after: ['ghost'] }]).ok).toBe(false)
    expect(
      validateCurriculum([
        { id: 'a', title: 'A' },
        { id: 'a', title: 'Again' },
      ]).ok,
    ).toBe(false)
    expect(validateCurriculum(ITEMS).ok).toBe(true)
  })
})

/* ------------------------------------------------------------------------- */
/* Building the files /teach writes                                           */
/* ------------------------------------------------------------------------- */

describe('buildPlanFile composes a plan that can be trusted', () => {
  it('emits frontmatter (title, why, goal, job, started, curriculum) then body', () => {
    const md = buildPlanFile(
      {
        title: 'Kubernetes',
        why: 'Two saved roles list it as missing.',
        goal: 'k8s-working',
        job: 'acme-platform-engineer',
        curriculum: ITEMS,
        body: 'Resources: the docs.',
      },
      '2026-08-16',
    )
    expect(md).toMatch(/^---\n/)
    expect(md).toContain('title: Kubernetes')
    expect(md).toContain('why: Two saved roles list it as missing.')
    expect(md).toContain('goal: k8s-working')
    expect(md).toContain('started: 2026-08-16')
    expect(md).toContain('id: pods')
    expect(md.trimEnd().endsWith('Resources: the docs.')).toBe(true)
  })

  it('refuses a topic with no reason behind it', () => {
    expect(() =>
      buildPlanFile({ title: 'Kubernetes', why: '  ', curriculum: ITEMS }, '2026-08-16'),
    ).toThrow(/needs a `why`/)
  })

  it('refuses a curriculum the dashboard would render but nobody could follow', () => {
    expect(() =>
      buildPlanFile(
        {
          title: 'Kubernetes',
          why: 'Because.',
          curriculum: [
            { id: 'a', title: 'A', after: ['b'] },
            { id: 'b', title: 'B', after: ['a'] },
          ],
        },
        '2026-08-16',
      ),
    ).toThrow(/Invalid curriculum/)
  })
})

describe('buildSessionFile records what happened', () => {
  it('writes frontmatter with the date and the items covered', () => {
    const md = buildSessionFile(
      { topic: 'kubernetes', body: 'Recalled pods well.', covered: ['pods'] },
      '2026-08-16',
      null,
    )
    expect(md).toContain('date: 2026-08-16')
    expect(md).toContain('- pods')
    expect(md).toContain('Recalled pods well.')
  })

  it('extends the day’s file instead of colliding with it', () => {
    const first = buildSessionFile({ topic: 'k', body: 'Morning.' }, '2026-08-16', null)
    const second = buildSessionFile({ topic: 'k', body: 'Evening.' }, '2026-08-16', first)
    expect(second).toContain('Morning.')
    expect(second).toContain('## Later that day')
    expect(second).toContain('Evening.')
  })

  it('refuses an empty summary', () => {
    expect(() => buildSessionFile({ topic: 'k', body: '   ' }, '2026-08-16', null)).toThrow(
      /needs a summary/,
    )
  })
})

describe('reading a hand-edited plan degrades instead of crashing', () => {
  it('falls back to the folder name and drops malformed items', () => {
    const plan = normalizeTopicPlan(
      'kubernetes-networking',
      { curriculum: [{ title: 'no id here' }, { id: 'pods', title: 'Pods' }] },
      'Body.',
    )
    expect(plan.title).toBe('Kubernetes networking')
    expect(plan.why).toBe('')
    expect(plan.curriculum).toEqual([{ id: 'pods', title: 'Pods' }])
  })

  it('slugifies a topic title into a safe folder name', () => {
    expect(topicSlug('Kubernetes & Networking')).toBe('kubernetes-networking')
    expect(topicSlug('  ')).toBe('topic')
  })
})

/* ------------------------------------------------------------------------- */
/* The store, against a throwaway vault                                       */
/* ------------------------------------------------------------------------- */

describe('the learn store reads what /teach wrote', () => {
  let dir: string

  beforeEach(async () => {
    dir = await makeVaultRepo()
    process.env.ACHIEVE_VAULT_DIR = dir
    await write(dir, 'learn/kubernetes/plan.md', PLAN)
    await write(dir, 'learn/kubernetes/sessions/2026-08-14.md', '---\ndate: 2026-08-14\ncovered: [pods]\n---\n\nFirst pass.\n')
    await write(dir, 'learn/kubernetes/sessions/2026-08-16.md', '---\ndate: 2026-08-16\n---\n\nSecond pass.\n')
  })

  afterEach(async () => {
    delete process.env.ACHIEVE_VAULT_DIR
    await fs.rm(dir, { recursive: true, force: true })
  })

  it('lists topics with derived progress and their sessions, newest first', async () => {
    const topics = await getTopics()
    expect(topics).toHaveLength(1)
    expect(topics[0]).toMatchObject({
      slug: 'kubernetes',
      title: 'Kubernetes',
      goal: 'k8s-working',
      job: 'acme-platform-engineer',
      totalItems: 3,
      doneItems: 0,
      percent: 0,
    })
    expect(topics[0]!.why).toMatch(/missing requirement/)
    expect(topics[0]!.sessions).toEqual(['2026-08-16', '2026-08-14'])
  })

  it('ignores a folder with no plan — the plan is the record', async () => {
    await write(dir, 'learn/half-started/sessions/2026-08-16.md', 'orphaned\n')
    expect((await getTopics()).map((t) => t.slug)).toEqual(['kubernetes'])
  })

  it('returns one topic with its ordered, blocked curriculum', async () => {
    const topic = await getTopic('kubernetes')
    expect(topic!.items.map((i) => i.id)).toEqual(['pods', 'ingress', 'lab'])
    expect(topic!.items.find((i) => i.id === 'lab')!.blockedBy).toEqual(['pods'])
    expect(topic!.body.trim()).toBe('Resources: the docs, and the cluster at work.')
  })

  it('refuses a slug that could escape learn/, and an unknown one', async () => {
    expect(await getTopic('../../etc')).toBeNull()
    expect(await getTopic('nope')).toBeNull()
  })

  it('reads one session, with the items it covered', async () => {
    const session = await getSession('kubernetes', '2026-08-14')
    expect(session).toMatchObject({ date: '2026-08-14', covered: ['pods'] })
    expect(session!.body.trim()).toBe('First pass.')
    expect(await getSession('kubernetes', 'not-a-date')).toBeNull()
    expect(await getSession('kubernetes', '2026-01-01')).toBeNull()
  })
})

/* ------------------------------------------------------------------------- */
/* Ticking: the dashboard's file, and the evidence it produces                */
/* ------------------------------------------------------------------------- */

describe('ticking a curriculum item is the dashboard’s write, and only that', () => {
  let dir: string

  beforeEach(async () => {
    dir = await makeVaultRepo()
    process.env.ACHIEVE_VAULT_DIR = dir
    await write(dir, 'learn/kubernetes/plan.md', PLAN)
    git(dir, ['add', '-A'])
    git(dir, ['commit', '-q', '-m', 'seed'])
  })

  afterEach(async () => {
    delete process.env.ACHIEVE_VAULT_DIR
    await fs.rm(dir, { recursive: true, force: true })
  })

  it('writes learn/status.yaml as one labeled commit, leaving plan.md alone', async () => {
    const before = commitCount(dir)
    await setCurriculumItemDone('kubernetes', 'pods', true)

    expect(commitCount(dir)).toBe(before + 1)
    expect(lastCommitSubject(dir)).toBe('dashboard: tick curriculum item')
    expect(await getLearnStatus()).toEqual({ kubernetes: { pods: { done: true } } })
    // The plan is /teach's file; a tick must not touch it.
    expect(await fs.readFile(path.join(dir, 'learn/kubernetes/plan.md'), 'utf8')).toBe(PLAN)
    expect((await getTopic('kubernetes'))!.percent).toBe(33)
  })

  it('refuses a blocked item, and allows unticking one', async () => {
    await expect(setCurriculumItemDone('kubernetes', 'lab', true)).rejects.toThrow(/blocked/)
    // Unticking is a correction, never a shortcut — always allowed.
    await expect(setCurriculumItemDone('kubernetes', 'lab', false)).resolves.toBeTruthy()
  })

  it('rejects an unknown topic or item rather than inventing state', async () => {
    await expect(setCurriculumItemDone('kubernetes', 'ghost', true)).rejects.toThrow(/Unknown/)
    await expect(setCurriculumItemDone('nope', 'pods', true)).rejects.toThrow(/No topic/)
    await expect(setCurriculumItemDone('../escape', 'pods', true)).rejects.toThrow(/Invalid topic/)
  })

  it('appends evidence exactly once for a skill-tagged item', async () => {
    await setCurriculumItemDoneAction('kubernetes', 'pods', true) // unblocks lab
    await setCurriculumItemDoneAction('kubernetes', 'lab', true)

    const evidence = await getEvidence()
    expect(evidence).toHaveLength(1)
    expect(evidence[0]).toMatchObject({
      skill: 'Kubernetes',
      what: 'Kubernetes: Run a three-node cluster',
      source: 'learn:kubernetes:lab',
    })

    // Untick then re-tick: append-only, and idempotent on (source, skill).
    await setCurriculumItemDoneAction('kubernetes', 'lab', false)
    expect(await getEvidence()).toHaveLength(1)
    await setCurriculumItemDoneAction('kubernetes', 'lab', true)
    expect(await getEvidence()).toHaveLength(1)
  })

  it('records nothing for an untagged item — most learning is not a skill claim', async () => {
    await setCurriculumItemDoneAction('kubernetes', 'pods', true)
    expect(await getEvidence()).toEqual([])
  })
})

/* ------------------------------------------------------------------------- */
/* The /teach write path, end to end                                          */
/* ------------------------------------------------------------------------- */

describe('the write-learn script is the /teach write path', () => {
  let dir: string

  beforeEach(async () => {
    dir = await makeVaultRepo()
    process.env.ACHIEVE_VAULT_DIR = dir
  })

  afterEach(async () => {
    delete process.env.ACHIEVE_VAULT_DIR
    await fs.rm(dir, { recursive: true, force: true })
  })

  function run(payload: unknown): { code: number; stderr: string; stdout: string } {
    const file = path.join(dir, 'payload.json')
    execFileSync('node', ['-e', `require('fs').writeFileSync(${JSON.stringify(file)}, ${JSON.stringify(JSON.stringify(payload))})`])
    try {
      const stdout = execFileSync('node', [WRITE_LEARN, file], {
        cwd: repoRoot,
        encoding: 'utf8',
        env: { ...process.env, ACHIEVE_VAULT_DIR: dir },
      })
      return { code: 0, stderr: '', stdout }
    } catch (err) {
      const e = err as { status: number; stderr: string; stdout: string }
      return { code: e.status, stderr: e.stderr, stdout: e.stdout }
    } finally {
      fs.rm(file, { force: true })
    }
  }

  it('writes a plan and a session, one labeled commit each', async () => {
    expect(
      run({
        kind: 'plan',
        title: 'Kubernetes',
        why: 'Missing in two saved roles.',
        curriculum: [{ id: 'pods', title: 'What a pod is', kind: 'learn' }],
        body: 'Docs first.',
      }).code,
    ).toBe(0)
    expect(lastCommitSubject(dir)).toBe('/teach: plan kubernetes')

    expect(run({ kind: 'session', topic: 'kubernetes', date: '2026-08-16', body: 'Solid on pods.' }).code).toBe(0)
    expect(lastCommitSubject(dir)).toBe('/teach: record kubernetes session 2026-08-16')

    // A second session the same day extends the file rather than colliding.
    expect(run({ kind: 'session', topic: 'kubernetes', date: '2026-08-16', body: 'Round two.' }).code).toBe(0)
    expect(lastCommitSubject(dir)).toBe('/teach: extend kubernetes session 2026-08-16')

    const topic = await getTopic('kubernetes')
    expect(topic).toMatchObject({ title: 'Kubernetes', totalItems: 1 })
    expect(topic!.sessions).toEqual(['2026-08-16'])
    const session = await getSession('kubernetes', '2026-08-16')
    expect(session!.body).toContain('Solid on pods.')
    expect(session!.body).toContain('Round two.')
  })

  it('refuses a session for a topic that has no plan', () => {
    const result = run({ kind: 'session', topic: 'ghost', body: 'Studied something.' })
    expect(result.code).toBe(1)
    expect(result.stderr).toMatch(/No topic at learn\/ghost/)
    expect(commitCount(dir)).toBe(0)
  })

  it('refuses a plan with no reason, writing nothing', () => {
    const result = run({ kind: 'plan', title: 'Kubernetes', why: '', curriculum: [] })
    expect(result.code).toBe(1)
    expect(result.stderr).toMatch(/needs a `why`/)
    expect(commitCount(dir)).toBe(0)
  })
})

/* ------------------------------------------------------------------------- */
/* The link from a `kind: learn` goal step to its topic                        */
/* ------------------------------------------------------------------------- */

describe('a kind: learn goal step points at the topic that carries it out', () => {
  let dir: string

  beforeEach(async () => {
    dir = await makeVaultRepo()
    process.env.ACHIEVE_VAULT_DIR = dir
  })

  afterEach(async () => {
    delete process.env.ACHIEVE_VAULT_DIR
    await fs.rm(dir, { recursive: true, force: true })
  })

  it('survives the read layer, and resolves to a real topic folder', async () => {
    await write(
      dir,
      'goals.yaml',
      'goals:\n  - id: k8s-working\n    horizon: weekly\n    title: Get to working Kubernetes\n    orphan: true\n    kind: learn\n    topic: kubernetes\n',
    )
    await write(dir, 'learn/kubernetes/plan.md', PLAN)

    const step = (await getGoalTreeView()).find((goal) => goal.id === 'k8s-working')
    expect(step!.topic).toBe('kubernetes')
    // The link is worth having only if it lands somewhere: the topic exists,
    // and it points back at the goal that demanded it.
    const topic = await getTopic(step!.topic!)
    expect(topic!.goal).toBe('k8s-working')
  })
})
