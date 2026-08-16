import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  BASE_SEED_FILES,
  MODULES,
  guideStepsFor,
  resolveEnabledModules,
  routeTitles,
  sidebarModules,
  type ModuleId,
} from '../lib/modules/registry.ts'
import { getEnabledModuleIds } from '../lib/dashboard/config.ts'
import { getGuideProgress } from '../lib/dashboard/guide.ts'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))
const templateDir = path.join(repoRoot, 'template')

const ALL = MODULES.map((m) => m.id)

/** First path segment — what a seed file claims at the top of the template. */
function topSegment(rel: string): string {
  return rel.split('/')[0]!
}

async function dirNames(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true })
  return entries.filter((e) => e.isDirectory()).map((e) => e.name).sort()
}

async function exists(abs: string): Promise<boolean> {
  return fs.stat(abs).then(
    () => true,
    () => false,
  )
}

/**
 * The registry is the single source of truth only if it stays complete in both
 * directions — nothing ships undeclared, and no stale entry survives what it
 * described. Same shape of guard as `tests/skill-hardening.test.ts`.
 */
describe('the module registry is complete in both directions', () => {
  it('declares each module once, with a coherent shape', async () => {
    expect(new Set(ALL).size).toBe(ALL.length)

    const routes = MODULES.map((m) => m.route).filter((r) => r !== null)
    expect(new Set(routes).size).toBe(routes.length)

    const slots = MODULES.map((m) => m.sidebarOrder).filter((s) => s !== null)
    expect(new Set(slots).size).toBe(slots.length)

    for (const mod of MODULES) {
      // A sidebar entry needs somewhere to go.
      if (mod.sidebarOrder !== null) expect(mod.route, mod.id).not.toBeNull()
      // Dependencies must name real modules, and never the module itself.
      for (const dep of mod.dependsOn) {
        expect(ALL, `${mod.id} dependsOn`).toContain(dep)
        expect(dep).not.toBe(mod.id)
      }
    }
  })

  it('claims every bundled skill, and every claimed skill ships', async () => {
    const onDisk = await dirNames(path.join(templateDir, '.claude', 'skills'))
    const claimed = MODULES.flatMap((m) => m.skills).sort()

    expect(claimed).toEqual(onDisk) // sorted, so duplicates surface too
  })

  it('claims every template file, and every claimed file ships', async () => {
    const onDisk = (await fs.readdir(templateDir)).sort()
    const claimed = new Set(
      [...BASE_SEED_FILES, ...MODULES.flatMap((m) => m.seedFiles)].map(topSegment),
    )

    expect(onDisk.filter((entry) => !claimed.has(entry))).toEqual([])
    for (const rel of [...BASE_SEED_FILES, ...MODULES.flatMap((m) => m.seedFiles)]) {
      expect(await exists(path.join(templateDir, rel)), rel).toBe(true)
    }
  })

  it('claims every dashboard route, and every claimed route has a page', async () => {
    const appDir = path.join(repoRoot, 'app')
    const pages = ['/']
    for (const name of await dirNames(appDir)) {
      if (await exists(path.join(appDir, name, 'page.tsx'))) pages.push(`/${name}`)
    }
    const declared = MODULES.map((m) => m.route).filter((r) => r !== null)

    expect(declared.sort()).toEqual(pages.sort())
  })

  it('claims every guide step exactly once, and every step has a flag', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'achieve-modules-'))
    process.env.ACHIEVE_VAULT_DIR = dir
    try {
      // The flags the guide data layer actually computes, at runtime.
      const flags = Object.keys(await getGuideProgress()).sort()
      expect(guideStepsFor(ALL).sort()).toEqual(flags)
    } finally {
      delete process.env.ACHIEVE_VAULT_DIR
      await fs.rm(dir, { recursive: true, force: true })
    }
  })
})

describe('enabled modules resolve against the registry', () => {
  it('treats no configuration as every module enabled', () => {
    expect(resolveEnabledModules(null)).toEqual(ALL)
  })

  it('treats an explicit empty list as nothing enabled', () => {
    expect(resolveEnabledModules([])).toEqual([])
  })

  it('returns registry order, whatever order was configured', () => {
    expect(resolveEnabledModules(['guide', 'notes', 'home'])).toEqual([
      'home',
      'notes',
      'guide',
    ])
  })

  it('closes dependencies over transitively', () => {
    // Jobs is the only module with a dependency today, and it is a real one:
    // the CV skill may use no facts but the ones in `profile/`, so a vault with
    // Jobs and no Profile would be a CV with nothing honest to say.
    expect(
      MODULES.filter((m) => m.dependsOn.length > 0).map((m) => [m.id, m.dependsOn]),
    ).toEqual([['jobs', ['profile']]])
    // Registry order, with the dependency pulled in even though it wasn't asked for.
    expect(resolveEnabledModules(['jobs'])).toEqual(['profile', 'jobs'])
    expect(resolveEnabledModules(['notes'])).toEqual(['notes'])
  })

  it('drops ids it does not know, rather than breaking the dashboard', () => {
    expect(resolveEnabledModules(['notes', 'fitness'])).toEqual(['notes'])
  })
})

describe('the vault config reader', () => {
  let dir: string

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'achieve-config-'))
    process.env.ACHIEVE_VAULT_DIR = dir
  })

  afterEach(async () => {
    delete process.env.ACHIEVE_VAULT_DIR
    await fs.rm(dir, { recursive: true, force: true })
  })

  it('enables everything when config.yaml is absent (pre-v2 vaults)', async () => {
    expect(await getEnabledModuleIds()).toEqual(ALL)
  })

  it('enables what the file lists, in registry order', async () => {
    await fs.writeFile(
      path.join(dir, 'config.yaml'),
      'modules:\n  - notes\n  - home\n',
    )
    expect(await getEnabledModuleIds()).toEqual(['home', 'notes'])
  })

  it('falls back to everything when the file has no module list', async () => {
    await fs.writeFile(path.join(dir, 'config.yaml'), '# nothing here yet\n')
    expect(await getEnabledModuleIds()).toEqual(ALL)
  })
})

describe('the dashboard chrome derives from registry × config', () => {
  it('renders the same sidebar as before, with everything enabled', () => {
    expect(sidebarModules(ALL).map((m) => [m.label, m.route])).toEqual([
      ['Dashboard', '/'],
      ['Notes', '/notes'],
      ['Diary', '/diary'],
      ['Goals', '/goals'],
      ['Projects', '/projects'],
      ['Investments', '/investments'],
      ['Jobs', '/jobs'],
      ['Guide', '/guide'],
    ])
  })

  it('titles every route, including ones with no sidebar entry', () => {
    expect(routeTitles(ALL)).toEqual({
      '/': 'Dashboard',
      '/notes': 'Notes',
      '/diary': 'Diary',
      '/goals': 'Goals',
      '/projects': 'Projects',
      '/investments': 'Investments',
      '/jobs': 'Jobs',
      '/guide': 'Guide',
      '/profile': 'Profile',
    })
  })

  it('walks the onboarding sequence in registry order, everything enabled', () => {
    expect(guideStepsFor(ALL)).toEqual([
      'vaultReady',
      'profileFilled',
      'hasSkills',
      'hasGoals',
      'hasTasks',
      'hasQuote',
      'hasDiaryEntry',
      'hasNotes',
      'hasProjects',
      'hasHoldings',
      'hasStrategy',
      'hasResearch',
      'hasApplication',
    ])
  })

  it('drops a disabled module from the sidebar, titles and guide alike', () => {
    const without: ModuleId[] = ALL.filter((id) => id !== 'investments')

    expect(sidebarModules(without).map((m) => m.id)).not.toContain('investments')
    expect(routeTitles(without)['/investments']).toBeUndefined()
    expect(guideStepsFor(without)).not.toContain('hasHoldings')
    expect(guideStepsFor(without)).not.toContain('hasStrategy')
    expect(guideStepsFor(without)).not.toContain('hasResearch')
    // …and leaves the rest of the checklist in its original order.
    expect(guideStepsFor(without)).toEqual(
      guideStepsFor(ALL).filter(
        (key) => !['hasHoldings', 'hasStrategy', 'hasResearch'].includes(key),
      ),
    )
  })
})
