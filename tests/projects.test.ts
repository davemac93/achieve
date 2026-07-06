import { execFileSync } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { getProject, getProjects } from '../lib/dashboard/projects.ts'

function git(cwd: string, args: string[]): void {
  execFileSync('git', args, { cwd, encoding: 'utf8' })
}

async function makeVault(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'achieve-projectsview-'))
  git(dir, ['init', '-q'])
  await fs.mkdir(path.join(dir, 'projects'), { recursive: true })
  return dir
}

async function writeProjectFile(
  dir: string,
  slug: string,
  frontmatter: string,
  body: string,
): Promise<void> {
  await fs.writeFile(
    path.join(dir, 'projects', `${slug}.md`),
    `---\n${frontmatter}\n---\n\n${body}\n`,
    'utf8',
  )
}

describe('projects read layer for the dashboard views', () => {
  let dir: string

  beforeEach(async () => {
    dir = await makeVault()
    process.env.ACHIEVE_VAULT_DIR = dir
    await writeProjectFile(
      dir,
      'streaming-platform',
      'title: Streaming platform\nstatus: working',
      'Rework the ingestion path.',
    )
    await writeProjectFile(
      dir,
      'move-house',
      'title: Move house\nstatus: private',
      'Logistics and dates.',
    )
    await writeProjectFile(dir, 'loose-idea', 'title: Loose idea', 'No status set.')
  })

  afterEach(async () => {
    delete process.env.ACHIEVE_VAULT_DIR
    await fs.rm(dir, { recursive: true, force: true })
  })

  it('lists projects alphabetically with their status', async () => {
    const projects = await getProjects()
    expect(projects.map((p) => p.slug)).toEqual([
      'loose-idea',
      'move-house',
      'streaming-platform',
    ])
    const bySlug = Object.fromEntries(projects.map((p) => [p.slug, p.status]))
    expect(bySlug['streaming-platform']).toBe('working')
    expect(bySlug['move-house']).toBe('private')
    expect(bySlug['loose-idea']).toBeUndefined()
  })

  it('getProject returns status plus the body', async () => {
    const project = await getProject('streaming-platform')
    expect(project).not.toBeNull()
    expect(project!.title).toBe('Streaming platform')
    expect(project!.status).toBe('working')
    expect(project!.body.trim()).toBe('Rework the ingestion path.')
  })

  it('normalizes an unknown status to undefined', async () => {
    const project = await getProject('loose-idea')
    expect(project?.status).toBeUndefined()
  })

  it('getProject returns null for a missing project', async () => {
    expect(await getProject('does-not-exist')).toBeNull()
  })

  it('getProject rejects slugs that could escape the projects directory', async () => {
    expect(await getProject('../diary/2026-07-06')).toBeNull()
    expect(await getProject('..')).toBeNull()
  })
})
