#!/usr/bin/env node
/**
 * First-run setup. Scaffolds the user's private vault from the committed
 * template, then initializes the vault as its own git repository so that every
 * later mutation (via the vault I/O module) is recorded as an audit-trail
 * commit. The project repo gitignores `vault/`, so no personal data is ever
 * published.
 *
 * Safe to reason about: it refuses to overwrite an existing vault.
 */

import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const templateDir = path.join(repoRoot, 'template')
// Default to <repo>/vault; ACHIEVE_VAULT_DIR overrides it (used by tests).
const vaultDir = process.env.ACHIEVE_VAULT_DIR
  ? path.resolve(process.env.ACHIEVE_VAULT_DIR)
  : path.join(repoRoot, 'vault')

function git(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' })
}

function hasGitIdentity(cwd) {
  try {
    return git(['config', 'user.email'], cwd).trim() !== ''
  } catch {
    return false
  }
}

function main() {
  if (!fs.existsSync(templateDir)) {
    console.error(`✗ Template not found at ${templateDir}. Is the repo intact?`)
    process.exit(1)
  }

  if (fs.existsSync(vaultDir) && fs.readdirSync(vaultDir).length > 0) {
    console.error(
      `✗ A vault already exists at ${vaultDir}.\n` +
        `  Setup will not overwrite it. Remove it first if you really want a fresh start.`,
    )
    process.exit(1)
  }

  // Copy the blank structure into the gitignored vault.
  fs.cpSync(templateDir, vaultDir, { recursive: true })

  // Make the vault its own git repo for the per-mutation audit trail.
  if (!fs.existsSync(path.join(vaultDir, '.git'))) {
    git(['init', '-q'], vaultDir)
  }
  if (!hasGitIdentity(vaultDir)) {
    // Local-only identity so commits work even on a machine with no global git
    // config. The user can override with their own git config in the vault.
    git(['config', 'user.name', 'achieve'], vaultDir)
    git(['config', 'user.email', 'achieve@localhost'], vaultDir)
  }
  git(['add', '-A'], vaultDir)
  // Only commit if there is something to commit (idempotent re-init).
  if (git(['status', '--porcelain'], vaultDir).trim() !== '') {
    git(['commit', '--quiet', '-m', 'setup: scaffold blank vault from template'], vaultDir)
  }

  console.log('✓ Vault scaffolded at vault/')
  console.log('  - blank structure copied from template/')
  console.log('  - initialized as a git repo (audit trail for every change)')
  console.log('  - vault/ is gitignored by the project repo, so your data stays private')
  console.log('\nNext: edit vault/user.md to tell Claude Code who you are.')
}

main()
