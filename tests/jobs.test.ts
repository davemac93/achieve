import { execFileSync } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/cache', () => ({ revalidatePath: () => {} }))

import { setApplicationStatusAction } from '../app/actions.ts'
import {
  getApplication,
  getApplications,
  renderApplicationsFile,
  setApplicationStatus,
} from '../lib/dashboard/jobs.ts'
import {
  APPLICATION_STATUSES,
  applicationSlug,
  normalizeApplication,
  parseFit,
} from '../lib/dashboard/jobs-content.ts'
import { renderCvBody, renderCvDocument, stripFrontmatter } from '../lib/dashboard/cv-render.ts'
import {
  browserCandidates,
  findBrowser,
  noBrowserMessage,
  printArgs,
  resolveCvTarget,
} from '../lib/dashboard/cv-pdf.ts'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))
const CV_PDF_SCRIPT = path.join(repoRoot, 'scripts', 'cv-pdf.ts')
const TEMPLATE_DIR = path.join(repoRoot, 'template', 'jobs')

function git(cwd: string, args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' })
}

async function makeVaultRepo(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'achieve-jobs-'))
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

function lastCommitSubject(dir: string): string {
  return git(dir, ['log', '-1', '--format=%s']).trim()
}

const JD = `---
company: Acme
role: Platform Engineer
source: https://example.com/jobs/1
saved: 2026-08-01
---

We need someone who can run Kubernetes in production and write Terraform.
`

/** The shape the /cv skill is instructed to write — and what /goals reads. */
const FIT = `---
company: Acme
role: Platform Engineer
assessed: 2026-08-02
---

# Fit — Acme, Platform Engineer

## Requirements met

- **Kubernetes in production** — \`profile/experience/acme.md\`: ran the cluster
  migration; \`profile/evidence.yaml\` records it on 2026-05-02.
- **Python** — \`profile/skills.yaml\`: strong, last used 2026-06.

## Requirements missing

- **Terraform** — nothing in \`profile/skills.yaml\` and no evidence record.
- **Team leadership** — mentoring one junior is not "led a team of 5".

## Verdict

Worth applying; two gaps, both closable.
`

describe('the jobs store reads a folder per application', () => {
  let dir: string

  beforeEach(async () => {
    dir = await makeVaultRepo()
    process.env.ACHIEVE_VAULT_DIR = dir
  })

  afterEach(async () => {
    delete process.env.ACHIEVE_VAULT_DIR
    await fs.rm(dir, { recursive: true, force: true })
  })

  it('returns nothing when the module has never been used', async () => {
    expect(await getApplications()).toEqual([])
    expect(await getApplication('acme-platform-engineer')).toBeNull()
  })

  it('reads company, role and documents from the folder itself', async () => {
    await write(dir, 'jobs/acme-platform-engineer/jd.md', JD)
    await write(dir, 'jobs/acme-platform-engineer/fit.md', FIT)
    await write(dir, 'jobs/acme-platform-engineer/cv.md', '# Ada Lovelace\n')

    const [application] = await getApplications()
    expect(application).toMatchObject({
      slug: 'acme-platform-engineer',
      company: 'Acme',
      role: 'Platform Engineer',
      source: 'https://example.com/jobs/1',
      hasJd: true,
      hasFit: true,
      hasCv: true,
      hasPdf: false,
      // The two missing requirements, which are the ones /goals consumes.
      missingCount: 2,
    })
  })

  it('shows a folder with no pipeline row as saved, rather than hiding it', async () => {
    await write(dir, 'jobs/acme-platform-engineer/jd.md', JD)
    const [application] = await getApplications()
    expect(application!.status).toBe('saved')
    expect(application!.since).toBeUndefined()
  })

  it('ignores a row whose folder is gone, and files that are not folders', async () => {
    await write(dir, 'jobs/acme-platform-engineer/jd.md', JD)
    await write(dir, 'jobs/applications.yaml', renderApplicationsFile([
      { slug: 'acme-platform-engineer', status: 'applied', dates: { saved: '2026-08-01' } },
      { slug: 'ghost-role', status: 'offer', dates: {} },
    ]))
    await write(dir, 'jobs/cv-template.md', '# {{full name}}\n')

    const applications = await getApplications()
    expect(applications.map((a) => a.slug)).toEqual(['acme-platform-engineer'])
    expect(applications[0]!.status).toBe('applied')
  })

  it('reads one application with its documents and its parsed fit', async () => {
    await write(dir, 'jobs/acme-platform-engineer/jd.md', JD)
    await write(dir, 'jobs/acme-platform-engineer/fit.md', FIT)
    await write(dir, 'jobs/acme-platform-engineer/cv.md', '# Ada Lovelace\n')

    const detail = await getApplication('acme-platform-engineer')
    expect(detail!.fit.met.map((r) => r.requirement)).toEqual([
      'Kubernetes in production',
      'Python',
    ])
    expect(detail!.fit.missing.map((r) => r.requirement)).toEqual([
      'Terraform',
      'Team leadership',
    ])
    expect(detail!.cv).toContain('Ada Lovelace')
  })

  it('refuses a slug that could escape the jobs directory', async () => {
    expect(await getApplication('../../etc')).toBeNull()
    await expect(setApplicationStatus('../evil', 'applied')).rejects.toThrow(
      /Invalid application/,
    )
  })
})

describe('the pipeline is the dashboard’s file, and only that', () => {
  let dir: string

  beforeEach(async () => {
    dir = await makeVaultRepo()
    process.env.ACHIEVE_VAULT_DIR = dir
    await write(dir, 'jobs/acme-platform-engineer/jd.md', JD)
    git(dir, ['add', '-A'])
    git(dir, ['commit', '-q', '-m', 'seed'])
  })

  afterEach(async () => {
    delete process.env.ACHIEVE_VAULT_DIR
    await fs.rm(dir, { recursive: true, force: true })
  })

  it('stamps the date it reached a stage, as one labeled commit', async () => {
    const entry = await setApplicationStatus('acme-platform-engineer', 'applied', '2026-08-05')

    expect(entry.status).toBe('applied')
    expect(entry.dates).toEqual({ saved: '2026-08-05', applied: '2026-08-05' })
    expect(lastCommitSubject(dir)).toBe(
      'dashboard: application acme-platform-engineer → applied',
    )

    const [application] = await getApplications()
    expect(application!.status).toBe('applied')
    expect(application!.since).toBe('2026-08-05')
  })

  it('keeps earlier stage dates — the trail is the point', async () => {
    await setApplicationStatus('acme-platform-engineer', 'saved', '2026-08-01')
    await setApplicationStatus('acme-platform-engineer', 'applied', '2026-08-05')
    const entry = await setApplicationStatus('acme-platform-engineer', 'interview', '2026-08-20')

    expect(entry.dates).toEqual({
      saved: '2026-08-01',
      applied: '2026-08-05',
      interview: '2026-08-20',
    })
  })

  it('never rewrites a stage date when the same stage is set again', async () => {
    await setApplicationStatus('acme-platform-engineer', 'applied', '2026-08-05')
    const again = await setApplicationStatus('acme-platform-engineer', 'applied', '2026-09-09')
    expect(again.dates.applied).toBe('2026-08-05')
  })

  it('writes no other file — the folder’s documents stay the skill’s', async () => {
    await setApplicationStatus('acme-platform-engineer', 'applied', '2026-08-05')
    const touched = git(dir, ['show', '--name-only', '--format=', 'HEAD']).trim()
    expect(touched).toBe('jobs/applications.yaml')
  })

  it('refuses an application that has no folder on disk', async () => {
    await expect(setApplicationStatus('nowhere-inc-role', 'applied')).rejects.toThrow(
      /No application at jobs\/nowhere-inc-role/,
    )
  })

  it('ignores an unknown status through the server action, writing nothing', async () => {
    const before = lastCommitSubject(dir)
    await setApplicationStatusAction('acme-platform-engineer', 'ghosted')
    expect(lastCommitSubject(dir)).toBe(before)

    await setApplicationStatusAction('acme-platform-engineer', 'offer')
    expect((await getApplications())[0]!.status).toBe('offer')
  })
})

describe('the applications file and its parsing', () => {
  it('round-trips the rows it writes, header comments and all', () => {
    const rendered = renderApplicationsFile([
      { slug: 'acme-platform-engineer', status: 'interview', dates: { saved: '2026-08-01' } },
    ])
    expect(rendered).toContain('primary writer: dashboard')
    expect(rendered).toContain('slug: acme-platform-engineer')
  })

  it('keeps a row with an unrecognized status, as saved', () => {
    expect(normalizeApplication({ slug: 'x', status: 'ghosted' })!.status).toBe('saved')
    expect(normalizeApplication({ status: 'applied' })).toBeNull()
  })

  it('offers the pipeline the plan specifies', () => {
    expect([...APPLICATION_STATUSES]).toEqual([
      'saved',
      'applied',
      'interview',
      'offer',
      'rejected',
    ])
  })

  it('builds a folder name from company and role', () => {
    expect(applicationSlug('Acme Corp.', 'Senior Platform Engineer')).toBe(
      'acme-corp-senior-platform-engineer',
    )
    expect(applicationSlug('Żabka', 'Analityk')).toBe('zabka-analityk')
  })
})

describe('fit.md is the hinge between jobs and goals', () => {
  it('parses the shape the /cv skill is told to write', () => {
    const fit = parseFit(FIT)
    expect(fit.met).toHaveLength(2)
    expect(fit.missing[0]).toEqual({
      requirement: 'Terraform',
      detail: 'nothing in `profile/skills.yaml` and no evidence record.',
    })
  })

  it('reads the template the skill file itself documents', async () => {
    // The example inside SKILL.md is the contract; if it drifts from the parser
    // the /goals discovery phase silently stops seeing gaps.
    const skill = await fs.readFile(
      path.join(repoRoot, 'template', '.claude', 'skills', 'cv', 'SKILL.md'),
      'utf8',
    )
    const example = skill.split('```markdown').find((block) => block.includes('## Requirements missing'))
    const fit = parseFit(example!.split('```')[0]!)
    expect(fit.met.length).toBeGreaterThan(0)
    expect(fit.missing.length).toBeGreaterThan(0)
    for (const item of [...fit.met, ...fit.missing]) {
      expect(item.requirement).not.toContain('**')
      expect(item.detail).not.toBe('')
    }
  })

  it('ignores prose and sub-bullets outside the two lists', () => {
    const fit = parseFit(`## Verdict\n\n- not a requirement\n\n## Requirements missing\n\n- **Go** — none\n  - detail line\n`)
    expect(fit.missing.map((r) => r.requirement)).toEqual(['Go'])
    expect(fit.met).toEqual([])
  })
})

describe('the CV renderer', () => {
  it('renders the markdown subset a CV needs', () => {
    const html = renderCvBody(`---\ntitle: x\n---\n\n# Ada Lovelace\n\n## Experience\n\n- **Analyst** at the Analytical Engine\n\nA paragraph.\n`)
    expect(html).toContain('<h1>Ada Lovelace</h1>')
    expect(html).toContain('<h2>Experience</h2>')
    expect(html).toContain('<li><strong>Analyst</strong> at the Analytical Engine</li>')
    expect(html).toContain('<p>A paragraph.</p>')
    expect(html).not.toContain('title: x')
  })

  it('escapes vault content instead of letting it inject HTML', () => {
    const html = renderCvBody('Built <script>alert(1)</script> & shipped it')
    expect(html).toContain('&lt;script&gt;')
    expect(html).toContain('&amp;')
    expect(html).not.toContain('<script>')
  })

  it('keeps only http and mailto links', () => {
    expect(renderCvBody('[site](https://example.com)')).toContain('href="https://example.com"')
    expect(renderCvBody('[x](javascript:alert(1))')).not.toContain('href')
  })

  it('produces a self-contained document with the print stylesheet inlined', () => {
    const doc = renderCvDocument('# Ada Lovelace\n', 'Ada Lovelace — CV')
    expect(doc.startsWith('<!doctype html>')).toBe(true)
    expect(doc).toContain('<title>Ada Lovelace — CV</title>')
    expect(doc).toContain('@page { size: A4; margin: 0; }')
    expect(doc).not.toMatch(/<(script|link)\b/)
  })

  it('strips frontmatter but leaves a body that has none', () => {
    expect(stripFrontmatter('# Hi\n')).toBe('# Hi\n')
  })
})

describe('cv:pdf finds a browser, or explains itself', () => {
  it('accepts the folder, the file, or just the slug', () => {
    for (const arg of [
      'jobs/acme-platform-engineer',
      'jobs/acme-platform-engineer/',
      'jobs/acme-platform-engineer/cv.md',
      'acme-platform-engineer',
      './jobs/acme-platform-engineer',
    ]) {
      expect(resolveCvTarget(arg)).toEqual({
        cv: 'jobs/acme-platform-engineer/cv.md',
        pdf: 'jobs/acme-platform-engineer/cv.pdf',
        slug: 'acme-platform-engineer',
      })
    }
  })

  it('refuses a path that climbs out of jobs/', () => {
    expect(() => resolveCvTarget('../../etc/passwd')).toThrow(/Not an application folder/)
    expect(() => resolveCvTarget('  ')).toThrow(/Which CV/)
  })

  it('takes an explicitly named browser as the whole list, not the head of it', () => {
    // A wrong ACHIEVE_CHROME must fail loudly rather than quietly print with a
    // different browser than the one the user asked for.
    expect(browserCandidates('darwin', { ACHIEVE_CHROME: '/opt/my-chrome' })).toEqual([
      '/opt/my-chrome',
    ])
    expect(browserCandidates('darwin', {})).toContain(
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    )
  })

  it('knows where Chrome, Edge, Brave and Chromium live on each platform', () => {
    const all = ['darwin', 'linux', 'win32'] as const
    for (const platform of all) {
      const candidates = browserCandidates(platform, {
        PROGRAMFILES: 'C:\\Program Files',
      })
      expect(candidates.length, platform).toBeGreaterThan(0)
      const joined = candidates.join(' ').toLowerCase()
      for (const browser of ['chrome', 'edge', 'brave', 'chromium']) {
        expect(joined, `${platform}: ${browser}`).toContain(browser)
      }
    }
  })

  it('takes the first candidate that exists', () => {
    const installed = new Set(['/usr/bin/chromium'])
    expect(findBrowser(['/usr/bin/google-chrome', '/usr/bin/chromium'], (c) => installed.has(c))).toBe(
      '/usr/bin/chromium',
    )
    expect(findBrowser(['/usr/bin/google-chrome'], () => false)).toBeNull()
  })

  it('prints headlessly, with no browser chrome on the page', () => {
    const args = printArgs('/tmp/cv.html', '/vault/jobs/acme/cv.pdf')
    expect(args).toContain('--headless')
    expect(args).toContain('--no-pdf-header-footer')
    expect(args).toContain('--print-to-pdf=/vault/jobs/acme/cv.pdf')
    expect(args.at(-1)).toBe('file:///tmp/cv.html')
  })

  it('falls back to the dashboard print view, naming the exact route', () => {
    const message = noBrowserMessage('acme-platform-engineer', 'jobs/acme-platform-engineer/cv.md')
    expect(message).toMatch(/No Chrome, Edge, Brave or Chromium found/)
    expect(message).toContain('/jobs/acme-platform-engineer/cv')
    expect(message).toContain('ACHIEVE_CHROME=')
    // The markdown is untouched, and the user is told so.
    expect(message).toContain('jobs/acme-platform-engineer/cv.md is unchanged')
  })
})

describe('the cv:pdf script end to end', () => {
  let dir: string

  beforeEach(async () => {
    dir = await makeVaultRepo()
    await write(dir, 'jobs/acme-platform-engineer/cv.md', '# Ada Lovelace\n\n## Core skills\n\n- Analysis\n')
  })

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true })
  })

  function run(args: string[], env: Record<string, string> = {}): { code: number; out: string } {
    try {
      const out = execFileSync('node', [CV_PDF_SCRIPT, ...args], {
        encoding: 'utf8',
        env: { ...process.env, ACHIEVE_VAULT_DIR: dir, ...env },
      })
      return { code: 0, out }
    } catch (err) {
      const e = err as { status?: number; stdout?: string; stderr?: string }
      return { code: e.status ?? 1, out: `${e.stdout ?? ''}${e.stderr ?? ''}` }
    }
  }

  async function exists(rel: string): Promise<boolean> {
    return fs.stat(path.join(dir, rel)).then(
      () => true,
      () => false,
    )
  }

  /**
   * A stand-in for Chrome: same command line, no 300 MB download. `body` decides
   * whether it writes the PDF it was asked for, so both the success path and a
   * browser that fails halfway are exercised deterministically — on a machine
   * with a real browser installed and on one without.
   */
  async function stubBrowser(name: string, body: string): Promise<string> {
    const stub = path.join(dir, name)
    await fs.writeFile(stub, `#!/bin/sh\n${body}\n`, { mode: 0o755 })
    return stub
  }

  it('explains the fallback and writes nothing when no browser exists', async () => {
    const result = run(['jobs/acme-platform-engineer'], {
      // Named explicitly, so detection cannot quietly find the real Chrome that
      // exists on this machine — this is the no-browser branch, deterministically.
      ACHIEVE_CHROME: path.join(dir, 'no-such-browser'),
    })

    expect(result.code).toBe(1)
    expect(result.out).toMatch(/No Chrome, Edge, Brave or Chromium found/)
    expect(result.out).toContain('/jobs/acme-platform-engineer/cv')
    expect(await exists('jobs/acme-platform-engineer/cv.pdf')).toBe(false)
    // The markdown is never touched — it is the version that stays in history.
    expect(await fs.readFile(path.join(dir, 'jobs/acme-platform-engineer/cv.md'), 'utf8')).toContain(
      '# Ada Lovelace',
    )
  })

  it('prints the approved markdown into the application folder', async () => {
    const argsLog = path.join(dir, 'argv.txt')
    const browser = await stubBrowser(
      'fake-chrome',
      `printf '%s\\n' "$@" > ${JSON.stringify(argsLog)}\n` +
        `for arg in "$@"; do case "$arg" in --print-to-pdf=*) printf '%%PDF-1.4 fake' > "\${arg#--print-to-pdf=}";; esac; done`,
    )

    const result = run(['jobs/acme-platform-engineer'], { ACHIEVE_CHROME: browser })

    expect(result.code).toBe(0)
    expect(result.out).toMatch(/Wrote jobs\/acme-platform-engineer\/cv\.pdf/)
    expect(result.out).toContain('gitignored')
    expect(await exists('jobs/acme-platform-engineer/cv.pdf')).toBe(true)

    const argv = await fs.readFile(argsLog, 'utf8')
    expect(argv).toContain('--headless')
    expect(argv).toContain('--no-pdf-header-footer')
    expect(argv).toMatch(/file:\/\/\S+cv\.html/)
  })

  it('says so when the browser exits cleanly but produces nothing', async () => {
    const browser = await stubBrowser('quiet-chrome', 'exit 0')
    const result = run(['jobs/acme-platform-engineer'], { ACHIEVE_CHROME: browser })

    expect(result.code).toBe(1)
    expect(result.out).toMatch(/wrote no PDF/)
    expect(result.out).toMatch(/print view|Cmd-P/)
  })

  it('reports a browser that fails, and still leaves the markdown alone', async () => {
    const browser = await stubBrowser('broken-chrome', 'echo boom >&2\nexit 3')
    const result = run(['jobs/acme-platform-engineer'], { ACHIEVE_CHROME: browser })

    expect(result.code).toBe(1)
    expect(result.out).toMatch(/could not print the CV/)
    expect(await exists('jobs/acme-platform-engineer/cv.pdf')).toBe(false)
  })

  it('refuses a folder with no approved cv.md, pointing at /cv', () => {
    const result = run(['jobs/nowhere-inc-role'])
    expect(result.code).toBe(1)
    expect(result.out).toMatch(/No CV at/)
    expect(result.out).toContain('/cv')
  })

  it('prints usage when called with no argument', () => {
    const result = run([])
    expect(result.code).toBe(1)
    expect(result.out).toContain('npm run cv:pdf')
  })
})

describe('the jobs template ships the store the module declares', () => {
  it('seeds an empty pipeline and a user-owned CV template', async () => {
    const applications = await fs.readFile(path.join(TEMPLATE_DIR, 'applications.yaml'), 'utf8')
    expect(applications).toContain('applications: []')
    expect(applications).toContain('primary writer: dashboard')

    const template = await fs.readFile(path.join(TEMPLATE_DIR, 'cv-template.md'), 'utf8')
    expect(template).toContain('primary writer: YOU')
    // The default structure decision 14 settled on, in order.
    const headings = [...template.matchAll(/^## (.+)$/gm)].map((m) => m[1])
    expect(headings).toEqual([
      'Personal summary',
      'Education',
      'Professional experience',
      'Technical projects',
      'Core skills',
    ])
  })

  it('gitignores the derived PDF and nothing else in the folder', async () => {
    const gitignore = await fs.readFile(
      path.join(repoRoot, 'template', '.gitignore'),
      'utf8',
    )
    expect(gitignore).toContain('/jobs/*/cv.pdf')
    expect(gitignore).not.toMatch(/^\/jobs\/\*\/cv\.md$/m)
  })
})
