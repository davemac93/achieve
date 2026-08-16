#!/usr/bin/env node
/**
 * First-run setup. Scaffolds the user's private vault from the committed
 * template, then initializes the vault as its own git repository so that every
 * later mutation (via the vault I/O module) is recorded as an audit-trail
 * commit. The project repo gitignores `vault/`, so no personal data is ever
 * published.
 *
 * What lands in the vault is decided by the module registry
 * (`lib/modules/registry.ts`): base files always, plus the seed files and
 * skills of the enabled modules. `ACHIEVE_MODULES` (comma-separated ids)
 * narrows the set — unset means everything. The resolved list is written to
 * `config.yaml` so the dashboard shows exactly what was installed.
 *
 * Safe to reason about: it refuses to overwrite an existing vault.
 */

import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  BASE_SEED_FILES,
  CONFIG_FILE,
  MODULES,
  enabledModules,
  isModuleId,
  resolveEnabledModules,
} from '../lib/modules/registry.ts'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const templateDir = path.join(repoRoot, 'template')
// Default to <repo>/vault; ACHIEVE_VAULT_DIR overrides it (used by tests).
const vaultDir = process.env.ACHIEVE_VAULT_DIR
  ? path.resolve(process.env.ACHIEVE_VAULT_DIR)
  : path.join(repoRoot, 'vault')

function git(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' })
}

/**
 * Which modules to install. Unlike the dashboard's reader — which shrugs off
 * unknown ids so a stale config never breaks a running vault — setup fails on
 * one: at install time a typo is a mistake worth stopping for.
 */
function requestedModules() {
  const raw = process.env.ACHIEVE_MODULES
  if (raw === undefined) return null

  const ids = raw.split(',').map((id) => id.trim()).filter(Boolean)
  const unknown = ids.filter((id) => !isModuleId(id))
  if (unknown.length > 0) {
    console.error(
      `✗ Unknown module id(s) in ACHIEVE_MODULES: ${unknown.join(', ')}\n` +
        `  Known modules: ${MODULES.map((m) => m.id).join(', ')}`,
    )
    process.exit(1)
  }
  return ids
}

/** Copy one template entry (file or directory) into the vault. */
function seed(rel) {
  const from = path.join(templateDir, rel)
  if (!fs.existsSync(from)) {
    console.error(`✗ Template is missing ${rel}, which the registry declares.`)
    process.exit(1)
  }
  const to = path.join(vaultDir, rel)
  fs.mkdirSync(path.dirname(to), { recursive: true })
  fs.cpSync(from, to, { recursive: true })
}

/** The enabled ids as `config.yaml`, the vault's record of what it runs. */
function configYaml(ids) {
  return (
    '# Modules this vault runs. The dashboard shows only these, and `npm run\n' +
    '# setup` scaffolded only their files. Delete this file to enable every\n' +
    '# module. Ids are declared in lib/modules/registry.ts.\n' +
    'modules:\n' +
    ids.map((id) => `  - ${id}\n`).join('')
  )
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

  const requested = requestedModules()
  const enabled = resolveEnabledModules(requested)
  if (requested !== null) {
    // dependsOn is closed over, so a module never lands without what it reads.
    const added = enabled.filter((id) => !requested.includes(id))
    if (added.length > 0) {
      console.log(`  (also enabling ${added.join(', ')} — required by your picks)`)
    }
  }

  // Copy the blank structure into the gitignored vault: base files first, then
  // whatever the enabled modules declare.
  fs.mkdirSync(vaultDir, { recursive: true })
  for (const rel of BASE_SEED_FILES) seed(rel)
  for (const mod of enabledModules(enabled)) {
    for (const rel of mod.seedFiles) seed(rel)
    for (const skill of mod.skills) seed(path.join('.claude', 'skills', skill))
  }
  fs.writeFileSync(path.join(vaultDir, CONFIG_FILE), configYaml(enabled))

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
  console.log(`  - modules: ${enabled.join(', ')} (see config.yaml)`)
  console.log('  - blank structure copied from template/')
  console.log('  - initialized as a git repo (audit trail for every change)')
  console.log('  - vault/ is gitignored by the project repo, so your data stays private')
  console.log('\nNext: edit vault/user.md to tell Claude Code who you are.')
}

main()
