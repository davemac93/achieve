import { execFileSync } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const obsidianDir = path.join(repoRoot, 'template', '.obsidian')
const setupScript = path.join(repoRoot, 'scripts', 'setup.mjs')

async function readJson(relPath: string): Promise<unknown> {
  const text = await fs.readFile(path.join(obsidianDir, relPath), 'utf8')
  return JSON.parse(text)
}

describe('committed Obsidian template config', () => {
  it('app.json is valid JSON with the expected linking settings', async () => {
    const app = (await readJson('app.json')) as Record<string, unknown>
    expect(app.useMarkdownLinks).toBe(true)
    expect(app.newLinkFormat).toBe('relative')
  })

  it('core-plugins.json is a valid array of plugin id strings', async () => {
    const plugins = await readJson('core-plugins.json')
    expect(Array.isArray(plugins)).toBe(true)
    expect(plugins as string[]).toEqual(expect.arrayContaining(['backlink', 'graph', 'tag-pane']))
    for (const id of plugins as unknown[]) expect(typeof id).toBe('string')
  })

  it('community-plugins.json is a valid (empty) array — no vendored plugin binaries', async () => {
    const plugins = await readJson('community-plugins.json')
    expect(plugins).toEqual([])
  })

  it("template/.gitignore excludes Obsidian's noisy per-session workspace state", async () => {
    const gitignore = await fs.readFile(path.join(repoRoot, 'template', '.gitignore'), 'utf8')
    expect(gitignore).toContain('/.obsidian/workspace.json')
    expect(gitignore).toContain('/.obsidian/plugins/')
  })
})

describe('setup scaffolds the Obsidian config into a fresh vault', () => {
  it('copies template/.obsidian into vault/.obsidian unchanged', async () => {
    const vaultDir = await fs.mkdtemp(path.join(os.tmpdir(), 'achieve-obsidian-setup-'))
    try {
      execFileSync('node', [setupScript], {
        env: { ...process.env, ACHIEVE_VAULT_DIR: vaultDir },
        encoding: 'utf8',
      })

      const coreplugins = JSON.parse(
        await fs.readFile(path.join(vaultDir, '.obsidian', 'core-plugins.json'), 'utf8'),
      )
      expect(Array.isArray(coreplugins)).toBe(true)
      expect(coreplugins.length).toBeGreaterThan(0)
    } finally {
      await fs.rm(vaultDir, { recursive: true, force: true })
    }
  })
})
