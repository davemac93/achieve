import { execFileSync } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const setupScript = path.join(repoRoot, 'scripts', 'setup.mjs')

function runSetup(
  vaultDir: string,
  modules?: string,
): { code: number; stderr: string } {
  try {
    execFileSync('node', [setupScript], {
      env: {
        ...process.env,
        ACHIEVE_VAULT_DIR: vaultDir,
        ...(modules === undefined ? {} : { ACHIEVE_MODULES: modules }),
      },
      encoding: 'utf8',
    })
    return { code: 0, stderr: '' }
  } catch (err) {
    const e = err as { status?: number; stderr?: string }
    return { code: e.status ?? 1, stderr: e.stderr ?? '' }
  }
}

// The full blank structure setup must produce.
const EXPECTED_FILES = [
  'tasks.yaml',
  'goals.yaml',
  'goal-status.yaml',
  'quotes.yaml',
  'user.md',
  'CLAUDE.md',
]
const EXPECTED_DIRS = [
  'notes',
  'diary',
  'projects',
  'ideas',
  'jobs',
  'profile',
  path.join('profile', 'experience'),
]

describe('setup script', () => {
  let tmp: string
  let vaultDir: string

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'achieve-setup-'))
    vaultDir = path.join(tmp, 'vault')
  })

  afterEach(async () => {
    await fs.rm(tmp, { recursive: true, force: true })
  })

  it('scaffolds a blank vault with the full structure', async () => {
    expect(runSetup(vaultDir).code).toBe(0)

    for (const f of EXPECTED_FILES) {
      expect(await fs.stat(path.join(vaultDir, f)).then(() => true)).toBe(true)
    }
    for (const d of EXPECTED_DIRS) {
      expect((await fs.stat(path.join(vaultDir, d))).isDirectory()).toBe(true)
    }
  })

  it('scaffolds the bundled skills into the vault', async () => {
    expect(runSetup(vaultDir).code).toBe(0)
    for (const name of ['profile', 'goals', 'note']) {
      const skill = path.join(vaultDir, '.claude', 'skills', name, 'SKILL.md')
      expect(await fs.stat(skill).then((s) => s.isFile())).toBe(true)
    }
  })

  it('initializes the vault as a git repo with one setup commit', async () => {
    runSetup(vaultDir)
    const count = execFileSync('git', ['rev-list', '--count', 'HEAD'], {
      cwd: vaultDir,
      encoding: 'utf8',
    }).trim()
    expect(count).toBe('1')
    const subject = execFileSync('git', ['log', '-1', '--format=%s'], {
      cwd: vaultDir,
      encoding: 'utf8',
    }).trim()
    expect(subject).toMatch(/scaffold blank vault/)
  })

  it('contains no personal data — only placeholder template content', async () => {
    runSetup(vaultDir)
    expect(await fs.readFile(path.join(vaultDir, 'tasks.yaml'), 'utf8')).toContain('tasks: []')
    expect(await fs.readFile(path.join(vaultDir, 'goals.yaml'), 'utf8')).toContain('goals: []')
  })

  it('records the enabled modules in config.yaml', async () => {
    runSetup(vaultDir)
    const config = await fs.readFile(path.join(vaultDir, 'config.yaml'), 'utf8')
    // Everything, when the install picks nothing in particular.
    expect(config).toContain('- notes')
    expect(config).toContain('- investments')
  })

  it('scaffolds only the enabled modules — files, skills and config alike', async () => {
    expect(runSetup(vaultDir, 'notes,goals').code).toBe(0)

    for (const rel of ['notes', 'goals.yaml', 'goal-status.yaml', 'CLAUDE.md']) {
      expect(await fs.stat(path.join(vaultDir, rel)).then(() => true)).toBe(true)
    }
    for (const rel of ['investments.yaml', 'user.md', 'diary']) {
      expect(
        await fs.stat(path.join(vaultDir, rel)).then(
          () => true,
          () => false,
        ),
        rel,
      ).toBe(false)
    }

    const skills = await fs.readdir(path.join(vaultDir, '.claude', 'skills'))
    expect(skills.sort()).toEqual(['goals', 'note', 'teach'])

    const config = await fs.readFile(path.join(vaultDir, 'config.yaml'), 'utf8')
    expect(config).toContain('- goals')
    expect(config).not.toContain('- investments')
  })

  it('brings a module’s dependencies along, unasked', async () => {
    // The CV skill may use no facts but the ones in profile/, so Jobs without
    // Profile would be a CV with nothing honest to say.
    expect(runSetup(vaultDir, 'jobs').code).toBe(0)

    for (const rel of ['jobs/cv-template.md', 'jobs/applications.yaml', 'user.md', 'profile']) {
      expect(await fs.stat(path.join(vaultDir, rel)).then(() => true), rel).toBe(true)
    }
    const skills = await fs.readdir(path.join(vaultDir, '.claude', 'skills'))
    expect(skills.sort()).toEqual(['cv', 'profile'])
    expect(await fs.readFile(path.join(vaultDir, 'config.yaml'), 'utf8')).toContain('- profile')
  })

  it('rejects an unknown module id rather than silently skipping it', () => {
    const result = runSetup(vaultDir, 'notes,fitness')
    expect(result.code).toBe(1)
    expect(result.stderr).toMatch(/Unknown module id/)
  })

  it('refuses to overwrite an existing non-empty vault', async () => {
    expect(runSetup(vaultDir).code).toBe(0)
    const second = runSetup(vaultDir)
    expect(second.code).toBe(1)
    expect(second.stderr).toMatch(/already exists/)
  })
})
