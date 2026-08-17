import { execFileSync } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import * as registry from '../lib/modules/registry.ts'
import {
  CliError,
  applyToggles,
  dependenciesOf,
  isInteractive,
  parseCliArgs,
  renderPicker,
  requestedFromFlags,
  resolveSelection,
} from '../packages/create-achieve/picker.mjs'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))
const cli = path.join(repoRoot, 'packages', 'create-achieve', 'index.mjs')

const ALL = registry.MODULES.map((m) => m.id)

describe('the picker is generated from the registry, not from a second list', () => {
  it('gives every module a description and a preset the picker understands', () => {
    for (const mod of registry.MODULES) {
      expect(mod.description.trim(), mod.id).not.toBe('')
      // One line: the picker prints it beside the id, on one row.
      expect(mod.description, mod.id).not.toContain('\n')
      expect(['core', 'recommended', 'optional'], mod.id).toContain(mod.preset)
    }
  })

  it('installs the core modules without asking, and offers the rest', () => {
    // Home owns `/` and Guide is how a fresh vault explains itself; a picker
    // able to remove both would land the user on a 404 with nothing to read.
    expect(registry.coreModuleIds()).toEqual(['home', 'guide'])
    expect(registry.pickableModules().map((m) => m.id)).toEqual(
      ALL.filter((id) => !['home', 'guide'].includes(id)),
    )
  })

  it('pre-ticks core plus recommended, in registry order', () => {
    expect(registry.defaultModuleIds()).toEqual(
      ALL.filter((id) => registry.moduleById(id).preset !== 'optional'),
    )
    // The defaults are the v1 spine; the specialized modules start off.
    expect(registry.defaultModuleIds()).not.toContain('investments')
    expect(registry.defaultModuleIds()).not.toContain('jobs')
    expect(registry.defaultModuleIds()).toContain('notes')
  })

  it('numbers exactly what can be toggled, ticked as the defaults say', () => {
    const lines = renderPicker(registry, ['notes'])
    const text = lines.join('\n')

    expect(text).toContain('Always installed:')
    // Core modules appear, but without a number to type at them.
    expect(text).toMatch(/ {4}home {2,}The daily view/)
    expect(text).toMatch(/\s1 \[ \] profile/)
    expect(text).toMatch(/\[x\] notes/)
    for (const mod of registry.pickableModules()) {
      expect(text, mod.id).toContain(mod.description)
    }
  })
})

describe('command line', () => {
  it('defaults to an interactive install into ./achieve', () => {
    const opts = parseCliArgs([])
    expect(opts.dir).toBe('achieve')
    expect(opts.modules).toBeNull()
    expect(opts.install).toBe(true)
    expect(isInteractive(opts)).toBe(true)
  })

  it('takes the directory, the module list and the flags', () => {
    const opts = parseCliArgs(['my-os', '--modules', 'notes, goals,', '--no-install'])
    expect(opts.dir).toBe('my-os')
    expect(opts.modules).toEqual(['notes', 'goals'])
    expect(opts.install).toBe(false)
    expect(isInteractive(opts)).toBe(false)
  })

  it('treats --all and --yes as answers, so nothing is asked', () => {
    expect(isInteractive(parseCliArgs(['--all']))).toBe(false)
    expect(isInteractive(parseCliArgs(['-y']))).toBe(false)
  })

  it('refuses contradictory or unreadable commands', () => {
    expect(() => parseCliArgs(['--all', '--modules', 'notes'])).toThrow(CliError)
    expect(() => parseCliArgs(['--telepathy'])).toThrow(CliError)
    expect(() => parseCliArgs(['one', 'two'])).toThrow(/Expected one directory/)
  })

  it('reads --modules literally, and --all as everything', () => {
    // The scripted path is the same contract as ACHIEVE_MODULES: a list that
    // quietly grew would be no use in CI.
    expect(requestedFromFlags(registry, parseCliArgs(['--modules', 'notes']))).toEqual(['notes'])
    expect(requestedFromFlags(registry, parseCliArgs(['--all']))).toEqual(ALL)
    expect(requestedFromFlags(registry, parseCliArgs(['--yes']))).toEqual(
      registry.defaultModuleIds(),
    )
    expect(requestedFromFlags(registry, parseCliArgs([]))).toBeNull()
  })
})

describe('dependencies are resolved, never assumed', () => {
  it('brings a dependency along unasked, and says so', () => {
    const resolved = resolveSelection(registry, ['jobs'])
    expect(resolved.enabled).toEqual(['profile', 'jobs'])
    expect(resolved.added).toEqual(['profile'])
    expect(resolved.dropped).toEqual([])
  })

  it('drops the module instead of overriding a dependency the user declined', () => {
    // Installing Jobs after the user turned Profile down would hand them a CV
    // skill with no facts it is allowed to use.
    const resolved = resolveSelection(registry, ['notes', 'jobs'], { declined: ['profile'] })
    expect(resolved.enabled).toEqual(['notes'])
    expect(resolved.dropped).toEqual([{ id: 'jobs', missing: ['profile'] }])
  })

  it('says nothing about a dependency that was asked for outright', () => {
    const resolved = resolveSelection(registry, ['profile', 'jobs'])
    expect(resolved.enabled).toEqual(['profile', 'jobs'])
    expect(resolved.added).toEqual([])
  })

  it('reads the closure off the registry rather than repeating it', () => {
    expect(dependenciesOf(registry, 'jobs')).toEqual(['profile'])
    expect(dependenciesOf(registry, 'notes')).toEqual([])
  })

  it('refuses an unknown id with the list of real ones', () => {
    expect(() => resolveSelection(registry, ['notes', 'telepathy'])).toThrow(
      /Unknown module id\(s\): telepathy/,
    )
    expect(() => resolveSelection(registry, ['telepathy'])).toThrow(/Known modules: home, profile/)
  })

  it('returns registry order, whatever order was picked', () => {
    expect(resolveSelection(registry, ['guide', 'notes', 'home']).enabled).toEqual([
      'home',
      'notes',
      'guide',
    ])
  })
})

describe('picker input', () => {
  const defaults = registry.defaultModuleIds().filter((id) => id !== 'home' && id !== 'guide')

  it('accepts the current selection on an empty line', () => {
    const result = applyToggles(registry, defaults, '')
    expect(result.done).toBe(true)
    expect(result.selected).toEqual(defaults)
  })

  it('toggles by number and by id, in one line, keeping registry order', () => {
    const result = applyToggles(registry, defaults, '9, notes')
    expect(result.done).toBe(false)
    expect(result.unknown).toEqual([])
    // 9th pickable is jobs; notes was on, so it comes off.
    expect(result.selected).toContain('jobs')
    expect(result.selected).not.toContain('notes')
    expect(result.selected).toEqual(
      registry.pickableModules().map((m) => m.id).filter((id) => result.selected.includes(id)),
    )
  })

  it('understands all and none', () => {
    expect(applyToggles(registry, [], 'all').selected).toEqual(
      registry.pickableModules().map((m) => m.id),
    )
    expect(applyToggles(registry, defaults, 'none').selected).toEqual([])
  })

  it('reports a typo instead of installing something else', () => {
    const result = applyToggles(registry, defaults, 'notes,telepathy,99')
    expect(result.unknown).toEqual(['telepathy', '99'])
  })
})

/**
 * The install path itself, end to end — clone, pick, scaffold — against a local
 * source repo rather than GitHub.
 *
 * The source is this repo at HEAD with the working tree's registry and setup
 * script copied over it, so the run exercises the code being edited rather than
 * the code last committed. `--no-install` skips `npm install`: nothing here
 * needs node_modules, and the acceptance criterion it would prove (the app
 * starts) is a manual check, not a two-minute network test.
 */
describe('installing a project', () => {
  let tmp: string
  let source: string

  function run(args: string[], input = ''): { stdout: string; code: number } {
    try {
      const stdout = execFileSync('node', [cli, ...args], {
        cwd: tmp,
        input,
        encoding: 'utf8',
        env: {
          ...process.env,
          // A vault dir or module list inherited from the test runner would
          // scaffold somewhere other than the project just created.
          ACHIEVE_VAULT_DIR: undefined,
          ACHIEVE_MODULES: undefined,
        } as NodeJS.ProcessEnv,
      })
      return { stdout, code: 0 }
    } catch (err) {
      const e = err as { status?: number; stdout?: string; stderr?: string }
      return { stdout: `${e.stdout ?? ''}${e.stderr ?? ''}`, code: e.status ?? 1 }
    }
  }

  async function vaultConfig(dir: string): Promise<string[]> {
    const raw = await fs.readFile(path.join(tmp, dir, 'vault', 'config.yaml'), 'utf8')
    return [...raw.matchAll(/^ {2}- (\S+)$/gm)].map((m) => m[1]!)
  }

  beforeAll(async () => {
    source = await fs.mkdtemp(path.join(os.tmpdir(), 'achieve-cli-source-'))
    execFileSync('git', ['clone', '--quiet', repoRoot, source])
    for (const rel of ['lib/modules/registry.ts', 'scripts/setup.mjs']) {
      await fs.copyFile(path.join(repoRoot, rel), path.join(source, rel))
    }
    execFileSync('git', ['add', '-A'], { cwd: source })
    execFileSync('git', ['commit', '--quiet', '--allow-empty', '-m', 'test: working tree'], {
      cwd: source,
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: 'achieve',
        GIT_AUTHOR_EMAIL: 'achieve@localhost',
        GIT_COMMITTER_NAME: 'achieve',
        GIT_COMMITTER_EMAIL: 'achieve@localhost',
      },
    })
  }, 60_000)

  afterAll(async () => {
    await fs.rm(source, { recursive: true, force: true })
  })

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'achieve-cli-'))
  })

  afterEach(async () => {
    await fs.rm(tmp, { recursive: true, force: true })
  })

  it('scaffolds exactly the modules --modules names, and says how to start', async () => {
    const result = run(['my-os', '--from', source, '--no-install', '--modules', 'notes,goals'])
    expect(result.code, result.stdout).toBe(0)

    // Registry order, not the order they were typed in.
    expect(await vaultConfig('my-os')).toEqual(['goals', 'notes'])
    for (const rel of ['notes', 'goals.yaml', 'goal-status.yaml', 'CLAUDE.md']) {
      expect(await exists(path.join(tmp, 'my-os', 'vault', rel)), rel).toBe(true)
    }
    for (const rel of ['investments.yaml', 'diary', 'fitness', 'user.md']) {
      expect(await exists(path.join(tmp, 'my-os', 'vault', rel)), rel).toBe(false)
    }
    const skills = await fs.readdir(path.join(tmp, 'my-os', 'vault', '.claude', 'skills'))
    expect(skills.sort()).toEqual(['goals', 'note'])

    // A normal checkout, not a generated one: git history and all.
    expect(await exists(path.join(tmp, 'my-os', '.git')), '.git').toBe(true)
    expect(await exists(path.join(tmp, 'my-os', 'package.json')), 'package.json').toBe(true)
    expect(result.stdout).toContain('npm run dev')
    expect(result.stdout).toContain('npm install')
  })

  it('pulls in a dependency the flags left out, with a notice', async () => {
    const result = run(['my-os', '--from', source, '--no-install', '--modules', 'jobs'])
    expect(result.code, result.stdout).toBe(0)
    expect(result.stdout).toContain('also enabling profile')
    expect(await vaultConfig('my-os')).toEqual(['profile', 'jobs'])
    expect(await exists(path.join(tmp, 'my-os', 'vault', 'profile')), 'profile/').toBe(true)
  })

  it('refuses an unknown module id instead of installing around it', () => {
    const result = run(['my-os', '--from', source, '--no-install', '--modules', 'telepathy'])
    expect(result.code).toBe(1)
    expect(result.stdout).toMatch(/Unknown module id\(s\): telepathy/)
  })

  it('takes the recommended set when the picker is answered with Enter', async () => {
    const result = run(['my-os', '--from', source, '--no-install'], '\n')
    expect(result.code, result.stdout).toBe(0)
    expect(result.stdout).toContain('Which modules should this vault run?')
    expect(await vaultConfig('my-os')).toEqual(registry.defaultModuleIds())
    expect(await exists(path.join(tmp, 'my-os', 'vault', 'investments.yaml'))).toBe(false)
    expect(await exists(path.join(tmp, 'my-os', 'vault', 'diary'))).toBe(true)
  })

  it('drops a module whose dependency the picker declined, and says why', async () => {
    // Toggle Profile off and Jobs on, accept, then answer "no" when asked
    // whether Profile should come along after all.
    const result = run(['my-os', '--from', source, '--no-install'], 'profile,jobs\n\nn\n')
    expect(result.code, result.stdout).toBe(0)
    expect(result.stdout).toContain('Jobs needs Profile')
    expect(result.stdout).toMatch(/Skipping Jobs.*cannot run without Profile/)

    const config = await vaultConfig('my-os')
    expect(config).not.toContain('jobs')
    expect(config).not.toContain('profile')
    expect(await exists(path.join(tmp, 'my-os', 'vault', 'jobs'))).toBe(false)
  })

  it('enables the dependency instead when the picker accepts it', async () => {
    const result = run(['my-os', '--from', source, '--no-install'], 'profile,jobs\n\ny\n')
    expect(result.code, result.stdout).toBe(0)
    expect(result.stdout).toContain('Enabling Profile as well')
    const config = await vaultConfig('my-os')
    expect(config).toContain('profile')
    expect(config).toContain('jobs')
  })

  it('will not install into a directory that already has something in it', async () => {
    await fs.mkdir(path.join(tmp, 'taken'))
    await fs.writeFile(path.join(tmp, 'taken', 'notes.txt'), 'mine')
    const result = run(['taken', '--from', source, '--no-install', '--all'])
    expect(result.code).toBe(1)
    expect(result.stdout).toMatch(/already exists and is not empty/)
  })
})

async function exists(abs: string): Promise<boolean> {
  return fs.stat(abs).then(
    () => true,
    () => false,
  )
}
