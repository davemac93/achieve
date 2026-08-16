import { execFileSync } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/cache', () => ({ revalidatePath: () => {} }))

import { recordEvidenceAction, saveProfileAction } from '../app/actions.ts'
import { appendEvidence, getEvidence, getRecentEvidence } from '../lib/dashboard/evidence.ts'
import {
  getEducation,
  getExperience,
  getPreferences,
  getProfile,
  getProfileSources,
  getSkills,
  saveProfile,
} from '../lib/dashboard/profile.ts'
import {
  EVIDENCE_FILE,
  applyProposal,
  buildExperienceFile,
  parseUserMd,
  proposalFiles,
} from '../lib/dashboard/profile-content.ts'
import { openVault } from '../lib/vault/index.ts'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))
const SKILL = path.join(repoRoot, 'template', '.claude', 'skills', 'profile', 'SKILL.md')
const MIGRATE = path.join(repoRoot, 'scripts', 'migrate-profile.ts')

function git(cwd: string, args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' })
}

async function makeVaultRepo(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'achieve-profile-'))
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

function commitCount(dir: string): number {
  return Number(git(dir, ['rev-list', '--count', '--all']).trim())
}

function lastCommitSubject(dir: string): string {
  return git(dir, ['log', '-1', '--format=%s']).trim()
}

/** A hand-written user.md of the kind the migration has to cope with. */
const LEGACY_USER_MD = `# User profile

## Who I am

Dawid — building a local-first personal OS.

## Experience

### Acme — Senior Platform Engineer (2021-03 – present)

- Ran the migration off self-hosted Kubernetes.
- Tech: Kubernetes, TypeScript, Terraform

### Initech — Backend Developer (2018 – 2021)

- Built the billing service.

## Education

- MSc Computer Science — University of Warsaw (2016–2018)

## Skills

- Kubernetes — working
- TypeScript, Terraform

## How I work best

- Long uninterrupted blocks beat meetings.
- I cannot work evenings — family time.
- Sharpest in the morning, useless after 20:00.
`

describe('dashboard profile editing persists to user.md', () => {
  let dir: string

  beforeEach(async () => {
    dir = await makeVaultRepo()
    process.env.ACHIEVE_VAULT_DIR = dir
  })

  afterEach(async () => {
    delete process.env.ACHIEVE_VAULT_DIR
    await fs.rm(dir, { recursive: true, force: true })
  })

  it('saves edited content to user.md with a labeled commit', async () => {
    const fd = new FormData()
    fd.set('content', '# User profile\n\nI build local-first tools.')
    await saveProfileAction(fd)

    expect(await fs.readFile(path.join(dir, 'user.md'), 'utf8')).toBe(
      '# User profile\n\nI build local-first tools.\n',
    )
    expect(lastCommitSubject(dir)).toBe('dashboard: edit profile')
    expect(await getProfile()).toContain('local-first tools')
  })

  it('rejects an empty profile', async () => {
    await expect(saveProfile('   \n  ')).rejects.toThrow(/must not be empty/)
  })
})

describe('the profile stores read back from a vault', () => {
  let dir: string

  beforeEach(async () => {
    dir = await makeVaultRepo()
    process.env.ACHIEVE_VAULT_DIR = dir
  })

  afterEach(async () => {
    delete process.env.ACHIEVE_VAULT_DIR
    await fs.rm(dir, { recursive: true, force: true })
  })

  it('an empty vault yields empty stores rather than throwing', async () => {
    expect(await getSkills()).toEqual([])
    expect(await getExperience()).toEqual([])
    expect(await getEducation()).toEqual([])
    expect(await getPreferences()).toEqual({
      workStyle: [],
      constraints: [],
      energyPatterns: [],
    })
    expect(await getEvidence()).toEqual([])
  })

  it('reads skills best-evidenced first, defaulting an unknown level', async () => {
    await write(
      dir,
      'profile/skills.yaml',
      [
        'skills:',
        '  - skill: TypeScript',
        '    level: strong',
        '    evidenceCount: 12',
        '    lastUsed: 2026-08-01',
        '  - skill: Terraform',
        '    level: wizard', // not on the ladder
        '    evidenceCount: 1',
        '',
      ].join('\n'),
    )

    const skills = await getSkills()
    expect(skills.map((s) => s.skill)).toEqual(['TypeScript', 'Terraform'])
    expect(skills[0]!.level).toBe('strong')
    expect(skills[0]!.lastUsed).toBe('2026-08-01')
    // A typo must not hide a skill — it lands at the bottom rung instead.
    expect(skills[1]!.level).toBe('basic')
  })

  it('reads experience files, current role first, with tech and narrative', async () => {
    await write(
      dir,
      'profile/experience/initech-backend-developer.md',
      '---\ncompany: Initech\ntitle: Backend Developer\nstart: 2018\nend: 2021\n---\n\nBuilt the billing service.\n',
    )
    await write(
      dir,
      'profile/experience/acme-senior-platform-engineer.md',
      '---\ncompany: Acme\ntitle: Senior Platform Engineer\nstart: 2021-03\ntech:\n  - Kubernetes\n  - TypeScript\n---\n\nRan the migration.\n',
    )

    const roles = await getExperience()
    // The role with no `end` is current, so it sorts first.
    expect(roles.map((r) => r.company)).toEqual(['Acme', 'Initech'])
    expect(roles[0]!.end).toBeUndefined()
    expect(roles[0]!.tech).toEqual(['Kubernetes', 'TypeScript'])
    expect(roles[0]!.body).toBe('Ran the migration.')
  })

  it('reads education and preferences', async () => {
    await write(
      dir,
      'profile/education.yaml',
      'education:\n  - institution: University of Warsaw\n    qualification: MSc Computer Science\n    start: 2016\n    end: 2018\n',
    )
    await write(
      dir,
      'profile/preferences.yaml',
      'workStyle:\n  - Long blocks\nconstraints:\n  - No evenings\nenergyPatterns:\n  - Mornings\n',
    )

    expect(await getEducation()).toEqual([
      {
        institution: 'University of Warsaw',
        qualification: 'MSc Computer Science',
        start: '2016',
        end: '2018',
        notes: undefined,
      },
    ])
    expect(await getPreferences()).toEqual({
      workStyle: ['Long blocks'],
      constraints: ['No evenings'],
      energyPatterns: ['Mornings'],
    })
  })
})

describe('the evidence log is dashboard-owned and append-only', () => {
  let dir: string

  beforeEach(async () => {
    dir = await makeVaultRepo()
    process.env.ACHIEVE_VAULT_DIR = dir
  })

  afterEach(async () => {
    delete process.env.ACHIEVE_VAULT_DIR
    await fs.rm(dir, { recursive: true, force: true })
  })

  it('appends a record to profile/evidence.yaml as one labeled commit', async () => {
    const before = commitCount(dir)

    const record = await appendEvidence({
      skill: 'Kubernetes',
      what: 'Deploy the ingress controller',
      source: 'goals:w12-step-3',
      when: '2026-03-14T09:12:00.000Z',
    })

    expect(record.id).toMatch(/[0-9a-f-]{36}/)
    const onDisk = await fs.readFile(path.join(dir, EVIDENCE_FILE), 'utf8')
    expect(onDisk).toContain('skill: Kubernetes')
    expect(onDisk).toContain('source: goals:w12-step-3')
    expect(commitCount(dir) - before).toBe(1)
    expect(lastCommitSubject(dir)).toBe('dashboard: append evidence')
  })

  it('only ever adds: earlier records survive, order is preserved', async () => {
    await appendEvidence({ skill: 'K8s', what: 'First', source: 'goals:1' })
    await appendEvidence({ skill: 'K8s', what: 'Second', source: 'goals:2' })
    await appendEvidence({ skill: 'TS', what: 'Third', source: 'goals:3' })

    expect((await getEvidence()).map((r) => r.what)).toEqual([
      'First',
      'Second',
      'Third',
    ])
    // The tab shows the newest first, without touching the file.
    expect((await getRecentEvidence(2)).map((r) => r.what)).toEqual([
      'Third',
      'Second',
    ])
  })

  it('is idempotent on (source, skill), so a re-tick never inflates the count', async () => {
    const first = await appendEvidence({
      skill: 'Kubernetes',
      what: 'Deploy the ingress controller',
      source: 'goals:w12-step-3',
    })
    const commits = commitCount(dir)

    const again = await appendEvidence({
      skill: 'Kubernetes',
      what: 'Deploy the ingress controller',
      source: 'goals:w12-step-3',
    })

    expect(again.id).toBe(first.id)
    expect(await getEvidence()).toHaveLength(1)
    expect(commitCount(dir)).toBe(commits) // nothing written at all
  })

  it('rejects a record with nothing to trace back to', async () => {
    await expect(appendEvidence({ skill: '', what: 'x', source: 'goals:1' })).rejects.toThrow(
      /needs a skill/,
    )
    await expect(appendEvidence({ skill: 'K8s', what: ' ', source: 'goals:1' })).rejects.toThrow(
      /what was done/,
    )
    await expect(appendEvidence({ skill: 'K8s', what: 'x', source: '' })).rejects.toThrow(
      /needs a source/,
    )
  })

  it('the server action is the path #77 calls when a tagged step is ticked', async () => {
    await recordEvidenceAction({
      skill: 'Kubernetes',
      what: 'Write the deployment manifest',
      source: 'goals:w12-step-4',
    })
    expect((await getEvidence()).map((r) => r.skill)).toEqual(['Kubernetes'])
  })

  it('the writer split holds in code: profile writes user.md, evidence writes evidence', async () => {
    // Every vault write in each module, by the constant it targets.
    const targets = async (rel: string): Promise<string[]> => {
      const src = await fs.readFile(path.join(repoRoot, rel), 'utf8')
      return [...src.matchAll(/vault\.write(?:Yaml)?\(\s*\n?\s*([A-Za-z_]+)/g)].map(
        (m) => m[1]!,
      )
    }

    // The dashboard never writes skills.yaml (or any other /profile store)…
    expect(await targets(path.join('lib', 'dashboard', 'profile.ts'))).toEqual(['USER_MD'])
    // …and the evidence log has exactly one writer, writing exactly one file.
    expect(await targets(path.join('lib', 'dashboard', 'evidence.ts'))).toEqual([
      'EVIDENCE_FILE',
    ])
  })
})

describe('migrating a hand-written user.md into the structured stores', () => {
  let dir: string

  beforeEach(async () => {
    dir = await makeVaultRepo()
    process.env.ACHIEVE_VAULT_DIR = dir
    await write(dir, 'user.md', LEGACY_USER_MD)
    git(dir, ['add', '-A'])
    git(dir, ['commit', '-q', '-m', 'seed'])
  })

  afterEach(async () => {
    delete process.env.ACHIEVE_VAULT_DIR
    await fs.rm(dir, { recursive: true, force: true })
  })

  it('parses roles, education, skills and preferences out of free prose', () => {
    const proposal = parseUserMd(LEGACY_USER_MD)

    expect(proposal.experience.map((r) => [r.company, r.title])).toEqual([
      ['Acme', 'Senior Platform Engineer'],
      ['Initech', 'Backend Developer'],
    ])
    const acme = proposal.experience[0]!
    expect(acme.start).toBe('2021-03')
    expect(acme.end).toBeUndefined() // "present"
    expect(acme.tech).toEqual(['Kubernetes', 'TypeScript', 'Terraform'])
    expect(acme.body).toContain('Ran the migration')

    expect(proposal.education).toEqual([
      {
        qualification: 'MSc Computer Science',
        institution: 'University of Warsaw',
        start: '2016',
        end: '2018',
      },
    ])

    // A declared level is honored; bare skills start at the bottom rung, and
    // evidence always starts at zero — the log is the only thing that raises it.
    expect(proposal.skills).toEqual([
      { skill: 'Kubernetes', level: 'working', evidenceCount: 0 },
      { skill: 'TypeScript', level: 'basic', evidenceCount: 0 },
      { skill: 'Terraform', level: 'basic', evidenceCount: 0 },
    ])

    expect(proposal.preferences.constraints).toHaveLength(1)
    expect(proposal.preferences.energyPatterns).toHaveLength(1)
    expect(proposal.preferences.workStyle).toHaveLength(1)
  })

  it('never proposes the evidence log — that file is not the skill’s to write', () => {
    const files = proposalFiles(parseUserMd(LEGACY_USER_MD))
    expect(files.map((f) => f.relPath)).not.toContain(EVIDENCE_FILE)
  })

  it('the preview run writes nothing at all', async () => {
    const before = commitCount(dir)

    const out = execFileSync('node', [MIGRATE], {
      cwd: repoRoot,
      env: { ...process.env, ACHIEVE_VAULT_DIR: dir },
      encoding: 'utf8',
    })

    expect(out).toContain('profile/skills.yaml')
    expect(out).toContain('Preview only')
    expect(commitCount(dir)).toBe(before)
    expect(
      await fs.stat(path.join(dir, 'profile')).then(
        () => true,
        () => false,
      ),
    ).toBe(false)
  })

  it('--write lands the files and leaves user.md byte-identical', async () => {
    const userMdBefore = await fs.readFile(path.join(dir, 'user.md'), 'utf8')

    execFileSync('node', [MIGRATE, '--write'], {
      cwd: repoRoot,
      env: { ...process.env, ACHIEVE_VAULT_DIR: dir },
      encoding: 'utf8',
    })

    expect(await getSkills()).toHaveLength(3)
    expect((await getExperience()).map((r) => r.company)).toEqual(['Acme', 'Initech'])
    expect((await getEducation())[0]!.institution).toBe('University of Warsaw')
    expect((await getPreferences()).constraints).toHaveLength(1)

    // Non-destructive: the source file is untouched, down to the byte.
    expect(await fs.readFile(path.join(dir, 'user.md'), 'utf8')).toBe(userMdBefore)
    // …and every write went through the vault layer, labeled.
    expect(lastCommitSubject(dir)).toMatch(/^\/profile: migrate user\.md/)
  })

  it('fills an empty seeded store but never one that already has records', async () => {
    const vault = openVault(dir)
    // The seeded, empty store the template ships…
    await write(dir, 'profile/skills.yaml', '# comment\n#   - skill: Example\nskills: []\n')
    // …and one the user already filled in.
    await write(
      dir,
      'profile/education.yaml',
      'education:\n  - institution: Somewhere\n    qualification: BSc\n',
    )
    await write(dir, 'profile/experience/acme-senior-platform-engineer.md', 'mine\n')

    const result = await applyProposal(vault, proposalFiles(parseUserMd(LEGACY_USER_MD)))

    expect(result.written).toContain('profile/skills.yaml')
    expect(result.skipped.map((s) => s.relPath)).toEqual([
      'profile/education.yaml',
      'profile/experience/acme-senior-platform-engineer.md',
    ])
    // The user's own content survived verbatim.
    expect(await fs.readFile(path.join(dir, 'profile', 'education.yaml'), 'utf8')).toContain(
      'Somewhere',
    )
    expect(
      await fs.readFile(
        path.join(dir, 'profile', 'experience', 'acme-senior-platform-engineer.md'),
        'utf8',
      ),
    ).toBe('mine\n')
  })

  it('buildExperienceFile omits `end` for a current role and requires a company', () => {
    const md = buildExperienceFile({
      company: 'Acme',
      title: 'Senior Platform Engineer',
      start: '2021-03',
      tech: ['Kubernetes'],
      body: 'Ran the migration.',
    })
    expect(md).toMatch(/^---\ncompany: Acme\n/)
    expect(md).not.toContain('end:')
    expect(md.trimEnd().endsWith('Ran the migration.')).toBe(true)

    expect(() =>
      buildExperienceFile({ company: ' ', title: 'x', start: '2020', tech: [], body: '' }),
    ).toThrow(/needs a company/)
  })
})

describe('profile sources never include the diary or private notes', () => {
  let dir: string

  beforeEach(async () => {
    dir = await makeVaultRepo()
    process.env.ACHIEVE_VAULT_DIR = dir
  })

  afterEach(async () => {
    delete process.env.ACHIEVE_VAULT_DIR
    await fs.rm(dir, { recursive: true, force: true })
  })

  it('gathers goals, projects, non-private notes and the profile stores only', async () => {
    await write(dir, 'goals.yaml', 'goals:\n  - id: y1\n    horizon: yearly\n    title: Ship v1\n')
    await write(dir, 'projects/achieve.md', '---\ntitle: achieve\n---\nA personal OS.\n')
    await write(dir, 'notes/public.md', '---\ntitle: Public note\ntype: learning\n---\nFine to read.\n')
    await write(
      dir,
      'notes/secret.md',
      '---\ntitle: Secret note\ntype: private\n---\nMUST_NOT_LEAK secret detail.\n',
    )
    await write(dir, 'diary/2026-06-25.md', 'DIARY_SECRET very private feelings.\n')
    await write(
      dir,
      'profile/skills.yaml',
      'skills:\n  - skill: Kubernetes\n    level: working\n    evidenceCount: 6\n',
    )
    await appendEvidence({ skill: 'Kubernetes', what: 'Deployed it', source: 'goals:1' })

    const sources = await getProfileSources()

    expect(sources.goals.map((g) => g.title)).toEqual(['Ship v1'])
    expect(sources.projects.map((p) => p.title)).toEqual(['achieve'])
    // The database and the evidence trail are part of what /profile may read.
    expect(sources.skills.map((s) => s.skill)).toEqual(['Kubernetes'])
    expect(sources.evidence.map((e) => e.what)).toEqual(['Deployed it'])

    // The public note is in; the private one is categorically excluded.
    const noteTitles = sources.notes.map((n) => n.title)
    expect(noteTitles).toContain('Public note')
    expect(noteTitles).not.toContain('Secret note')

    // Nothing diary- or private-derived anywhere in the gathered material.
    const serialized = JSON.stringify(sources)
    expect(serialized).not.toMatch(/DIARY_SECRET/)
    expect(serialized).not.toMatch(/MUST_NOT_LEAK/)
    expect(serialized).not.toMatch(/diary/)
  })
})

describe('/profile skill definition declares the privacy wall and its ownership', () => {
  it('ships a SKILL.md scaffolded into the vault', async () => {
    expect(await fs.stat(SKILL).then((s) => s.isFile())).toBe(true)
  })

  it('is approve-gated and forbids diary + private notes', async () => {
    const skill = await fs.readFile(SKILL, 'utf8')
    // Approve gate: must propose and wait for approval before writing.
    expect(skill).toMatch(/approv/i)
    expect(skill).toMatch(/never write without approval/i)
    // Privacy wall: explicit prohibitions on diary and private notes.
    expect(skill).toMatch(/diary\/?` is categorically off-limits/i)
    expect(skill).toMatch(/`type: private` notes are human-only/i)
  })

  it('claims the profile stores but never the dashboard-owned evidence log', async () => {
    const skill = await fs.readFile(SKILL, 'utf8')
    expect(skill).toMatch(/never write `profile\/evidence\.yaml`/i)
    for (const owned of [
      'profile/experience',
      'profile/skills.yaml',
      'profile/education.yaml',
      'profile/preferences.yaml',
      'user.md',
    ]) {
      expect(skill, owned).toContain(owned)
    }
  })

  it('proposes skill promotions from evidence, one rung at a time', async () => {
    const skill = await fs.readFile(SKILL, 'utf8')
    expect(skill).toMatch(/basic → working → strong → expert/)
    expect(skill).toMatch(/one rung at a\s+time/i)
    expect(skill).toMatch(/evidence/i)
  })

  it('keeps user.md a summary, and migrates only after showing a preview', async () => {
    const skill = await fs.readFile(SKILL, 'utf8')
    expect(skill).toMatch(/must stay a summary/i)
    expect(skill).toMatch(/scripts\/migrate-profile\.ts/)
    expect(skill).toMatch(/writes nothing/i)
    expect(skill).toMatch(/`user\.md` is \*\*not\*\* touched by the migration/i)
  })
})
