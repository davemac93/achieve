import { execFileSync } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Server actions revalidate the Next.js router cache; stub it for unit tests.
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))

import {
  deleteMeasurementAction,
  deleteWorkoutAction,
  logMeasurementAction,
  logWorkoutAction,
} from '../app/actions.ts'
import {
  getIntake,
  getMeasurements,
  getTrainingPlan,
  getWorkouts,
  logMeasurement,
  logWorkout,
} from '../lib/dashboard/fitness.ts'
import {
  buildPlanFile,
  computeAdherence,
  metricSeries,
  normalizeMeasurements,
  normalizeWorkouts,
  weekStart,
  type Intake,
  type Workout,
} from '../lib/dashboard/fitness-content.ts'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))
const WRITE_FITNESS = path.join(repoRoot, 'scripts', 'write-fitness.ts')

function git(cwd: string, args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' })
}

async function makeVaultRepo(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'achieve-fitness-'))
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

function lastCommitSubject(dir: string): string {
  return git(dir, ['log', '-1', '--format=%s']).trim()
}

async function exists(abs: string): Promise<boolean> {
  return fs.stat(abs).then(
    () => true,
    () => false,
  )
}

/** Write a vault-relative file without committing — the skill's half, as if it
 * had already run, for tests about the read side. */
async function put(dir: string, rel: string, content: string): Promise<void> {
  const abs = path.join(dir, rel)
  await fs.mkdir(path.dirname(abs), { recursive: true })
  await fs.writeFile(abs, content)
}

/* ------------------------------------------------------------------------- */
/* The dashboard's two logs                                                    */
/* ------------------------------------------------------------------------- */

describe('workouts and measurements are the dashboard’s files', () => {
  let dir: string

  beforeEach(async () => {
    dir = await makeVaultRepo()
    process.env.ACHIEVE_VAULT_DIR = dir
  })

  afterEach(async () => {
    delete process.env.ACHIEVE_VAULT_DIR
    await fs.rm(dir, { recursive: true, force: true })
  })

  it('logs a session through the server action, as one labeled commit', async () => {
    await logWorkoutAction(
      form({
        date: '2026-08-17',
        title: 'Upper A',
        session: 'upper-a',
        durationMin: '52',
        rpe: '8',
        notes: 'Bench moved well.',
      }),
    )

    expect(lastCommitSubject(dir)).toBe('dashboard: log workout')
    const [workout] = await getWorkouts()
    expect(workout).toMatchObject({
      date: '2026-08-17',
      title: 'Upper A',
      session: 'upper-a',
      durationMin: 52,
      rpe: 8,
      notes: 'Bench moved well.',
    })
    expect(workout!.id).toBeTruthy()
  })

  it('lists sessions newest first, and deletes a mislogged one', async () => {
    await logWorkout({ date: '2026-08-10', title: 'Lower A' })
    const second = await logWorkout({ date: '2026-08-17', title: 'Upper A' })

    expect((await getWorkouts()).map((w) => w.date)).toEqual(['2026-08-17', '2026-08-10'])

    await deleteWorkoutAction(second.id)
    expect(lastCommitSubject(dir)).toBe('dashboard: delete workout')
    expect((await getWorkouts()).map((w) => w.title)).toEqual(['Lower A'])
  })

  it('refuses a workout with no date, no title, or an impossible RPE', async () => {
    await expect(logWorkout({ date: '17-08-2026', title: 'x' })).rejects.toThrow(
      /Invalid workout date/,
    )
    await expect(logWorkout({ date: '2026-08-17', title: '  ' })).rejects.toThrow(
      /needs a title/,
    )
    await expect(
      logWorkout({ date: '2026-08-17', title: 'Upper A', rpe: 11 }),
    ).rejects.toThrow(/RPE must be between 1 and 10/)
  })

  it('ignores an unparseable submission rather than committing nothing useful', async () => {
    await logWorkoutAction(form({ date: '2026-08-17', title: '   ' }))
    expect(await getWorkouts()).toEqual([])
    // Nothing was written at all — no file, and so no commit either.
    expect(await exists(path.join(dir, 'fitness', 'workouts.yaml'))).toBe(false)
  })

  it('logs and deletes a measurement, and refuses one with nothing measured', async () => {
    await logMeasurementAction(form({ date: '2026-08-17', weightKg: '82.4', waistCm: '88' }))
    expect(lastCommitSubject(dir)).toBe('dashboard: log measurement')

    const [measurement] = await getMeasurements()
    expect(measurement).toMatchObject({ date: '2026-08-17', weightKg: 82.4, waistCm: 88 })

    // A date with no reading behind it would be a point on a chart nobody took.
    await expect(logMeasurement({ date: '2026-08-18' })).rejects.toThrow(
      /at least one value/,
    )
    await logMeasurementAction(form({ date: '2026-08-18' }))
    expect(await getMeasurements()).toHaveLength(1)

    await deleteMeasurementAction(measurement!.id)
    expect(lastCommitSubject(dir)).toBe('dashboard: delete measurement')
    expect(await getMeasurements()).toEqual([])
  })

  it('reads an empty vault as empty rather than crashing the tab', async () => {
    expect(await getWorkouts()).toEqual([])
    expect(await getMeasurements()).toEqual([])
    expect(await getIntake()).toBeNull()
    expect(await getTrainingPlan()).toBeNull()
  })
})

/* ------------------------------------------------------------------------- */
/* Reading what the /fitness skill wrote                                       */
/* ------------------------------------------------------------------------- */

describe('the intake and plan are read defensively, never written back', () => {
  let dir: string

  beforeEach(async () => {
    dir = await makeVaultRepo()
    process.env.ACHIEVE_VAULT_DIR = dir
  })

  afterEach(async () => {
    delete process.env.ACHIEVE_VAULT_DIR
    await fs.rm(dir, { recursive: true, force: true })
  })

  it('reads the intake answers, defaulting what a hand edit broke', async () => {
    await put(
      dir,
      'fitness/intake.yaml',
      [
        'updated: 2026-08-17',
        'history: Lifted for two years, stopped in 2024.',
        'level: nonsense', // hand-edited to something no UI could produce
        'daysPerWeek: 3',
        'sessionMinutes: 60',
        'timeOfDay: morning',
        'equipment:',
        '  - dumbbells',
        '  - pull-up bar',
        'limitations: left knee aches on deep squats',
        '',
      ].join('\n'),
    )

    expect(await getIntake()).toEqual<Intake>({
      updated: '2026-08-17',
      history: 'Lifted for two years, stopped in 2024.',
      level: 'beginner',
      daysPerWeek: 3,
      sessionMinutes: 60,
      timeOfDay: 'morning',
      equipment: ['dumbbells', 'pull-up bar'],
      limitations: 'left knee aches on deep squats',
    })
  })

  it('treats an intake with no training days as no intake at all', async () => {
    await put(dir, 'fitness/intake.yaml', 'history: some\nlevel: beginner\n')
    expect(await getIntake()).toBeNull()
  })

  it('reads the plan’s frontmatter and body, dropping a malformed session row', async () => {
    await put(
      dir,
      'fitness/plan.md',
      [
        '---',
        'title: Upper/lower, three days',
        'updated: 2026-08-17',
        'daysPerWeek: 3',
        'sessions:',
        '  - { id: upper-a, title: Upper A }',
        '  - { title: no id here }',
        '---',
        '',
        '## Sessions',
        'Squat 3x5.',
        '',
      ].join('\n'),
    )

    const plan = await getTrainingPlan()
    expect(plan).toMatchObject({
      title: 'Upper/lower, three days',
      updated: '2026-08-17',
      daysPerWeek: 3,
      sessions: [{ id: 'upper-a', title: 'Upper A' }],
    })
    expect(plan!.body).toContain('Squat 3x5.')
  })
})

describe('malformed rows are dropped, not rendered', () => {
  it('keeps only workouts a log entry can be made of', () => {
    expect(
      normalizeWorkouts({
        workouts: [
          { id: 'a', date: '2026-08-17', title: 'Upper A', rpe: 42 },
          { id: 'b', date: 'yesterday', title: 'Lower A' },
          { id: 'c', date: '2026-08-18' }, // no title
          'not a row',
        ],
      }),
    ).toEqual([{ id: 'a', date: '2026-08-17', title: 'Upper A' }])
  })

  it('keeps only measurements with a date and something measured', () => {
    expect(
      normalizeMeasurements({
        measurements: [
          { id: 'a', date: '2026-08-17', weightKg: 82.4 },
          { id: 'b', date: '2026-08-18' },
          { id: 'c', weightKg: 80 },
        ],
      }),
    ).toEqual([{ id: 'a', date: '2026-08-17', weightKg: 82.4 }])
  })
})

/* ------------------------------------------------------------------------- */
/* Adherence                                                                   */
/* ------------------------------------------------------------------------- */

describe('adherence is derived from the log, never typed', () => {
  const w = (date: string): Workout => ({ id: date + Math.random(), date, title: 'Session' })

  it('counts Monday-started weeks', () => {
    expect(weekStart('2026-08-17')).toBe('2026-08-17') // a Monday
    expect(weekStart('2026-08-23')).toBe('2026-08-17') // the Sunday after it
    expect(weekStart('2026-08-16')).toBe('2026-08-10') // the Sunday before it
  })

  it('is 0% with nothing logged, and 100% when every week is hit', () => {
    const empty = computeAdherence([], 3, 4, '2026-08-19')
    expect(empty).toMatchObject({ planned: 12, counted: 0, percent: 0 })
    expect(empty.weeks).toHaveLength(4)
    expect(empty.weeks[0]!.weekStart).toBe('2026-07-27')
    expect(empty.weeks[3]!.weekStart).toBe('2026-08-17')

    const perfect = [
      '2026-07-27',
      '2026-07-29',
      '2026-07-31',
      '2026-08-03',
      '2026-08-05',
      '2026-08-07',
      '2026-08-10',
      '2026-08-12',
      '2026-08-14',
      '2026-08-17',
      '2026-08-19',
      '2026-08-21',
    ].map(w)
    expect(computeAdherence(perfect, 3, 4, '2026-08-19')).toMatchObject({
      planned: 12,
      counted: 12,
      percent: 100,
    })
  })

  /**
   * The rule the whole number rests on: a week counts at most what it planned.
   * Eight sessions in one week and none in the next is 50%, not 100% — the plan
   * is a cadence, and an average that hid the missed week would flatter the
   * user into thinking nothing broke.
   */
  it('does not let a double week buy back a missed one', () => {
    const doubled = [
      '2026-08-10',
      '2026-08-11',
      '2026-08-12',
      '2026-08-13',
      '2026-08-14',
      '2026-08-15',
    ].map(w)

    const adherence = computeAdherence(doubled, 3, 2, '2026-08-19')
    expect(adherence.weeks.map((week) => [week.done, week.percent])).toEqual([
      [6, 200], // the raw count stays visible in the chart…
      [0, 0],
    ])
    expect(adherence).toMatchObject({ planned: 6, counted: 3, percent: 50 }) // …but not in the rollup
  })

  it('ignores sessions outside the window, in either direction', () => {
    const workouts = [w('2026-06-01'), w('2026-08-17'), w('2027-01-01')]
    const adherence = computeAdherence(workouts, 2, 3, '2026-08-19')
    expect(adherence.weeks.map((week) => week.done)).toEqual([0, 0, 1])
    expect(adherence.percent).toBe(17) // 1 of 6
  })

  it('reports nothing rather than dividing by zero when there is no plan', () => {
    expect(computeAdherence([w('2026-08-17')], 0, 4, '2026-08-19')).toMatchObject({
      planned: 0,
      counted: 0,
      percent: 0,
    })
  })

  it('charts a metric oldest first, skipping readings that never took it', () => {
    const measurements = [
      { id: 'c', date: '2026-08-17', weightKg: 81.2 },
      { id: 'a', date: '2026-08-01', weightKg: 83 },
      { id: 'b', date: '2026-08-09', waistCm: 88 },
    ]
    expect(metricSeries(measurements, 'weightKg')).toEqual([
      { date: '2026-08-01', value: 83 },
      { date: '2026-08-17', value: 81.2 },
    ])
    expect(metricSeries(measurements, 'waistCm')).toEqual([{ date: '2026-08-09', value: 88 }])
  })
})

/* ------------------------------------------------------------------------- */
/* The /fitness write path, end to end                                         */
/* ------------------------------------------------------------------------- */

describe('the write-fitness script is the /fitness write path', () => {
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
    execFileSync('node', [
      '-e',
      `require('fs').writeFileSync(${JSON.stringify(file)}, ${JSON.stringify(JSON.stringify(payload))})`,
    ])
    try {
      const stdout = execFileSync('node', [WRITE_FITNESS, file], {
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

  const INTAKE = {
    kind: 'intake',
    history: 'Lifted for two years, stopped in 2024.',
    level: 'returning',
    daysPerWeek: 3,
    sessionMinutes: 60,
    timeOfDay: 'morning',
    equipment: ['dumbbells', 'pull-up bar'],
    limitations: 'left knee aches on deep squats — physio said keep it above 90°',
  }

  const PLAN = {
    kind: 'plan',
    title: 'Upper/lower, three days',
    daysPerWeek: 3,
    sessions: [
      { id: 'upper-a', title: 'Upper A' },
      { id: 'lower-a', title: 'Lower A' },
    ],
    body: '## Sessions\nDumbbell press 3x8.',
  }

  /**
   * The acceptance criterion that matters most, and the reason it lives in the
   * write path rather than in skill prose: a plan written without the interview
   * is the generic program this module exists to replace, and prose is exactly
   * what a skill forgets.
   */
  it('refuses a plan before the intake exists', async () => {
    const result = run(PLAN)
    expect(result.code).toBe(1)
    expect(result.stderr).toMatch(/No intake at fitness\/intake\.yaml/)
    expect(await exists(path.join(dir, 'fitness', 'plan.md'))).toBe(false)
  })

  it('refuses a plan when the intake is unfinished', async () => {
    await put(dir, 'fitness/intake.yaml', 'history: some\nlevel: beginner\n')
    expect(run(PLAN).stderr).toMatch(/incomplete/)
  })

  it('writes the intake and then the plan, one labeled commit each', async () => {
    expect(run(INTAKE).code).toBe(0)
    expect(lastCommitSubject(dir)).toBe('/fitness: write training intake')

    const intake = await getIntake()
    expect(intake).toMatchObject({
      level: 'returning',
      daysPerWeek: 3,
      equipment: ['dumbbells', 'pull-up bar'],
    })
    // Stamped by the write path, not by the skill.
    expect(intake!.updated).toMatch(/^\d{4}-\d{2}-\d{2}$/)

    expect(run(PLAN).code).toBe(0)
    expect(lastCommitSubject(dir)).toBe('/fitness: write training plan')
    const plan = await getTrainingPlan()
    expect(plan).toMatchObject({ title: 'Upper/lower, three days', daysPerWeek: 3 })
    expect(plan!.sessions.map((s) => s.id)).toEqual(['upper-a', 'lower-a'])
    expect(plan!.body).toContain('Dumbbell press 3x8.')

    // Exactly two mutations, however many files were touched.
    expect(git(dir, ['rev-list', '--count', 'HEAD']).trim()).toBe('2')
  })

  it('refuses a plan asking for more days than the user said they have', () => {
    expect(run(INTAKE).code).toBe(0)
    const result = run({ ...PLAN, daysPerWeek: 5 })
    expect(result.code).toBe(1)
    expect(result.stderr).toMatch(/never more/)
  })

  it('refuses an intake with no history and an unknown kind', () => {
    expect(run({ ...INTAKE, history: '' }).stderr).toMatch(/training history/)
    expect(run({ kind: 'workout', date: '2026-08-17' }).stderr).toMatch(/Unknown payload kind/)
  })

  it('cannot reach the dashboard’s files — logging is the user’s act', async () => {
    const script = await fs.readFile(WRITE_FITNESS, 'utf8')
    // No handle on the logs: not the path constants, not the write functions.
    expect(script).not.toMatch(/WORKOUTS_FILE|MEASUREMENTS_FILE/)
    expect(script).not.toMatch(/logWorkout|logMeasurement/)
  })
})

describe('a plan is grounded in the intake, not in a template', () => {
  const intake: Intake = {
    updated: '2026-08-17',
    history: 'Lifted for two years.',
    level: 'returning',
    daysPerWeek: 3,
    equipment: ['dumbbells'],
  }

  it('stamps the frontmatter the dashboard reads', () => {
    const file = buildPlanFile(
      { title: 'Three days', daysPerWeek: 2, sessions: [{ id: 'a', title: 'A' }], body: 'Squat.' },
      intake,
      '2026-08-17',
    )
    expect(file).toMatch(/^---\n/)
    expect(file).toContain('daysPerWeek: 2') // fewer than available is fine
    expect(file).toContain('updated: 2026-08-17')
    expect(file.trimEnd().endsWith('Squat.')).toBe(true)
  })

  it('refuses a plan with no body, and duplicate session ids', () => {
    expect(() =>
      buildPlanFile({ title: 'T', daysPerWeek: 3, sessions: [], body: '  ' }, intake, '2026-08-17'),
    ).toThrow(/needs a body/)
    expect(() =>
      buildPlanFile(
        {
          title: 'T',
          daysPerWeek: 3,
          sessions: [
            { id: 'a', title: 'A' },
            { id: 'a', title: 'B' },
          ],
          body: 'x',
        },
        intake,
        '2026-08-17',
      ),
    ).toThrow(/unique/)
  })
})

/* ------------------------------------------------------------------------- */
/* Boundaries pinned in code                                                   */
/* ------------------------------------------------------------------------- */

/**
 * Nutrition is out of v1 (decision 22). The skill says so — `tests/fitness-skill.test.ts`
 * pins that — but the store is where the boundary is hardest to argue with: a
 * field nobody can write is a scope nobody drifts into.
 */
describe('nutrition is out of scope, in the model and not only in prose', () => {
  it('declares no calorie, macro or meal field anywhere in the store', async () => {
    const content = await fs.readFile(
      path.join(repoRoot, 'lib', 'dashboard', 'fitness-content.ts'),
      'utf8',
    )
    // Field declarations only (`calories?: number`), so the prose explaining the
    // exclusion doesn't trip the check.
    expect(content).not.toMatch(/\b(calories|kcal|protein|carbs|fats|macros|meals?)\s*\??\s*:/i)
  })
})

/**
 * The photo privacy wall, guarded the same way the diary's is (see
 * `tests/diary.test.ts`): skills are Claude-read prose, so the boundary is
 * pinned at its code-level proxies.
 *
 * The difference from the diary is that `fitness/photos/` has **no sanctioned
 * reader at all** — not one module, not the dashboard, not a script. The only
 * file allowed to name the path is the module registry, which *declares* what
 * the module owns and is plain, import-free data, so a path there cannot become
 * a read. That distinction is the registry precedent from #74, and this test is
 * what keeps it honest.
 */
describe('privacy wall: nothing may read fitness/photos/', () => {
  // A string/path literal naming the photos directory — i.e. actual access, not
  // the word in prose or in a JSX code sample.
  const PHOTOS_PATH = /(["'`])fitness\/photos(\/[^"'`]*)?\1/

  const DECLARES_ONLY = path.join('lib', 'modules', 'registry.ts')

  async function walk(dir: string): Promise<string[]> {
    const out: string[] = []
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) out.push(...(await walk(full)))
      else if (entry.isFile() && /\.(tsx?|mjs)$/.test(entry.name)) out.push(full)
    }
    return out
  }

  it('detector sanity: the registry does name the photos path', async () => {
    const src = await fs.readFile(path.join(repoRoot, DECLARES_ONLY), 'utf8')
    expect(PHOTOS_PATH.test(src)).toBe(true)
  })

  it('no module, page, component or script accesses the photos directory', async () => {
    const files = (
      await Promise.all(
        ['lib', 'app', 'components', 'scripts'].map((d) => walk(path.join(repoRoot, d))),
      )
    ).flat()

    const offenders: string[] = []
    for (const file of files) {
      const rel = path.relative(repoRoot, file)
      if (rel === DECLARES_ONLY) continue
      if (PHOTOS_PATH.test(await fs.readFile(file, 'utf8'))) offenders.push(rel)
    }
    expect(offenders).toEqual([])
  })

  it('the registry only declares the photos path — it reads nothing', async () => {
    const src = await fs.readFile(path.join(repoRoot, DECLARES_ONLY), 'utf8')
    expect(PHOTOS_PATH.test(src)).toBe(true) // it does name the path…
    expect(/^import\s/m.test(src)).toBe(false) // …with no way to open it
  })

  it('every vault ships the deny rule and the gitignore entry', async () => {
    const settings = JSON.parse(
      await fs.readFile(path.join(repoRoot, 'template', '.claude', 'settings.json'), 'utf8'),
    ) as { permissions?: { deny?: string[] } }
    expect(settings.permissions?.deny).toContain('Read(./fitness/photos/**)')

    // Gitignored on top of the deny rule: git history is effectively permanent,
    // so a body photo committed once would outlive the file itself.
    // The contents are ignored rather than the folder, so the folder itself can
    // still ship with the template and stay visible in the vault.
    const gitignore = await fs.readFile(path.join(repoRoot, 'template', '.gitignore'), 'utf8')
    expect(gitignore).toMatch(/^\/fitness\/photos\/\*$/m)
    expect(gitignore).toMatch(/^!\/fitness\/photos\/\.gitkeep$/m)
  })

  it('the auto-loaded vault context marks photos human-only, and imports none', async () => {
    const claudeMd = await fs.readFile(path.join(repoRoot, 'template', 'CLAUDE.md'), 'utf8')
    expect(claudeMd).toMatch(/`fitness\/photos\/` is human-only/i)
    expect(claudeMd).not.toMatch(/@\s*fitness/)
  })
})
