#!/usr/bin/env node
/**
 * Print an approved `cv.md` to `cv.pdf` through a browser the user already has.
 *
 *   npm run cv:pdf jobs/acme-platform-engineer
 *   npm run cv:pdf jobs/acme-platform-engineer/cv.md
 *   ACHIEVE_CHROME=/path/to/chrome npm run cv:pdf acme-platform-engineer
 *
 * The order matters (decision 16): the markdown comes first and the user
 * approves it; only then is a PDF made. So this script never edits the CV — it
 * renders the markdown to HTML (the same renderer and stylesheet the dashboard's
 * print view uses) and drives Chrome / Edge / Brave / Chromium headlessly.
 *
 * There is deliberately **no npm dependency** for this: Puppeteer's ~300 MB
 * bundled Chromium would be paid for by every `npx create-achieve`, to produce
 * an artifact that is derived, gitignored and regenerable in one command. When
 * no browser is found, the script says so plainly and points at the dashboard's
 * print view, which yields the same document.
 *
 * The PDF is written into the application folder but never committed — the
 * vault's `.gitignore` excludes `cv.pdf`, so it is written with plain `fs`
 * rather than through the vault layer, which exists to record mutations of
 * vault *content*.
 *
 * Honors `ACHIEVE_VAULT_DIR`; defaults to `<repo>/vault`.
 */

import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { defaultVaultRoot } from '../lib/vault/index.ts'
import { renderCvDocument } from '../lib/dashboard/cv-render.ts'
import {
  browserCandidates,
  findBrowser,
  noBrowserMessage,
  printArgs,
  resolveCvTarget,
} from '../lib/dashboard/cv-pdf.ts'

const USAGE = `Usage: npm run cv:pdf <jobs/company-role>

  Renders that application's cv.md to cv.pdf using an installed browser.
  Nothing else is written, and the markdown is never modified.`

/** A title for the PDF's document metadata: the CV's own H1, or the folder. */
function documentTitle(markdown: string, slug: string): string {
  const heading = /^#\s+(.*\S)\s*$/m.exec(markdown)?.[1]
  return heading ?? slug
}

function main(): void {
  const arg = process.argv[2]
  if (!arg || arg === '--help' || arg === '-h') {
    console.log(USAGE)
    process.exit(arg ? 0 : 1)
  }

  const vaultRoot = defaultVaultRoot()
  const target = resolveCvTarget(arg)
  const cvPath = path.join(vaultRoot, target.cv)
  const pdfPath = path.join(vaultRoot, target.pdf)

  if (!fs.existsSync(cvPath)) {
    console.error(
      `✗ No CV at ${cvPath}.\n` +
        `  Run /cv in Claude Code for this application first — the markdown is\n` +
        `  what you approve, and the PDF only follows it.`,
    )
    process.exit(1)
  }

  const markdown = fs.readFileSync(cvPath, 'utf8')
  const browser = findBrowser(browserCandidates(process.platform), (candidate) =>
    fs.existsSync(candidate),
  )
  if (!browser) {
    console.error(noBrowserMessage(target.slug, target.cv))
    process.exit(1)
  }

  // A temp HTML file, not a data: URL — Chrome's --print-to-pdf wants a page it
  // can load, and the file is deleted whatever happens below.
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'achieve-cv-'))
  const htmlPath = path.join(tmpDir, 'cv.html')
  fs.writeFileSync(htmlPath, renderCvDocument(markdown, documentTitle(markdown, target.slug)))

  try {
    execFileSync(browser, printArgs(htmlPath, pdfPath), { stdio: 'pipe' })
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    console.error(
      `✗ ${path.basename(browser)} could not print the CV.\n  ${detail}\n\n` +
        noBrowserMessage(target.slug, target.cv),
    )
    process.exit(1)
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  }

  if (!fs.existsSync(pdfPath)) {
    console.error(
      `✗ ${path.basename(browser)} exited cleanly but wrote no PDF.\n\n` +
        noBrowserMessage(target.slug, target.cv),
    )
    process.exit(1)
  }

  const kb = Math.max(1, Math.round(fs.statSync(pdfPath).size / 1024))
  console.log(`✓ Wrote ${target.pdf} (${kb} KB) with ${path.basename(browser)}.`)
  console.log('  It is gitignored — cv.md is the version that stays in your history.')
}

main()
