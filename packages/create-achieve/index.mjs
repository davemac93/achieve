#!/usr/bin/env node
/**
 * `npx create-achieve <dir>` — the install path for achieve.
 *
 * It is deliberately **not** a code generator. It clones the repo, asks which
 * modules the user wants, records the answer in `vault/config.yaml` and hands
 * the scaffolding to `scripts/setup.mjs` — the same script `npm run setup`
 * runs, so there is one scaffolder and not two. What the user ends up with is a
 * normal checkout that upgrades with `git pull`, and module choices that stay
 * editable afterwards. A generated codebase would drift from the repo the
 * moment either changed, and the repo *is* the product.
 *
 * The picker is drawn from the cloned repo's own
 * `lib/modules/registry.ts` — read at runtime, after the clone — so it can only
 * ever offer the modules that version actually ships, descriptions, defaults,
 * dependencies and all. Node strips the types on import, which is how
 * `scripts/setup.mjs` already reads the same file.
 *
 * Dependencies: none, on purpose. `create-achieve` must stay something you can
 * run over a hotel wifi (the same reason `npm run cv:pdf` drives an installed
 * browser instead of shipping Puppeteer's ~300 MB Chromium), so the prompt is
 * node's own `readline` and the argument parsing is `node:util`.
 */

import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import readline from 'node:readline'
import { fileURLToPath, pathToFileURL } from 'node:url'

import {
  CliError,
  PICKER_PROMPT,
  applyToggles,
  isInteractive,
  parseCliArgs,
  renderPicker,
  requestedFromFlags,
  resolveSelection,
} from './picker.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))

const USAGE = `
  npx create-achieve [dir] [options]

  Installs achieve — a local-first personal OS — into <dir> (default: achieve)
  and asks which modules the vault should run.

  Options
    --modules <a,b,c>  enable exactly these modules (plus what they depend on)
    --all              enable every module
    -y, --yes          accept the recommended modules without asking
    --from <url|path>  clone from somewhere else (a fork, or a local checkout)
    --no-install       skip \`npm install\` (you will need to run it yourself)
    -h, --help         print this
    -v, --version      print the CLI version

  Examples
    npx create-achieve my-os
    npx create-achieve my-os --modules notes,goals,diary
    npx create-achieve my-os --all --no-install
`

function version() {
  const pkg = JSON.parse(fs.readFileSync(path.join(here, 'package.json'), 'utf8'))
  return pkg.version
}

/**
 * The one hard requirement. Node reads the registry — a `.ts` file — directly,
 * so a runtime that cannot strip types would fail deep inside the install with
 * a syntax error; better to say so before anything is written to disk.
 */
function requireTypeStripping() {
  if (!process.features.typescript) {
    throw new CliError(
      `achieve needs a Node that can run TypeScript directly (22.18+ or 24+).\n` +
        `You have ${process.version}. Upgrade node, then try again.`,
    )
  }
}

function requireGit() {
  try {
    execFileSync('git', ['--version'], { stdio: 'ignore' })
  } catch {
    throw new CliError('git is required to install achieve, and it is not on your PATH.')
  }
}

/** Resolve and vet the target directory: never write into an occupied one. */
function targetDir(dir) {
  const abs = path.resolve(process.cwd(), dir)
  if (fs.existsSync(abs) && fs.readdirSync(abs).length > 0) {
    throw new CliError(`${abs} already exists and is not empty. Pick another directory.`)
  }
  return abs
}

function clone(from, dir) {
  const source = fs.existsSync(path.resolve(from)) ? path.resolve(from) : from
  console.log(`\nCloning achieve into ${dir} …`)
  try {
    execFileSync('git', ['clone', '--quiet', source, dir], { stdio: 'inherit' })
  } catch {
    throw new CliError(`Could not clone ${source}. Check the URL and your connection.`)
  }
}

/** The cloned repo's registry — the only source the picker reads. */
async function loadRegistry(dir) {
  const file = path.join(dir, 'lib', 'modules', 'registry.ts')
  if (!fs.existsSync(file)) {
    throw new CliError(
      `The clone has no lib/modules/registry.ts — this does not look like an achieve checkout.`,
    )
  }
  return import(pathToFileURL(file).href)
}

/**
 * A question that survives the end of its input.
 *
 * Lines are queued as they arrive rather than read through `rl.question`: piped
 * answers (`printf 'jobs\\n\\n' | npx create-achieve`) land as one chunk, and
 * `question` would keep only the first and drop the rest. When the input runs
 * out, `ask` returns null and every caller falls back to its default instead of
 * waiting on a prompt nobody is there to answer.
 */
function createAsker() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  /** @type {string[]} */
  const queued = []
  /** @type {((line: string | null) => void)[]} */
  const waiting = []
  let closed = false

  rl.on('line', (line) => {
    const next = waiting.shift()
    if (next) next(line)
    else queued.push(line)
  })
  rl.on('close', () => {
    closed = true
    while (waiting.length > 0) waiting.shift()(null)
  })

  return {
    ask(question) {
      process.stdout.write(question)
      if (queued.length > 0) return Promise.resolve(queued.shift())
      if (closed) return Promise.resolve(null)
      return new Promise((resolve) => waiting.push(resolve))
    },
    close() {
      rl.close()
    },
  }
}

/**
 * The interactive picker: draw the registry, take toggles, repeat until the
 * user accepts (or the input runs out).
 */
async function pickModules(registry, asker) {
  let selected = registry
    .defaultModuleIds()
    .filter((id) => registry.moduleById(id).preset !== 'core')

  for (;;) {
    console.log('')
    for (const line of renderPicker(registry, selected)) console.log(line)
    console.log('')

    const answer = await asker.ask(PICKER_PROMPT)
    if (answer === null) {
      console.log('(no answer — taking the recommended set)')
      return selected
    }
    const result = applyToggles(registry, selected, answer)
    selected = result.selected
    if (result.unknown.length > 0) {
      console.log(`\n  ✗ No such module: ${result.unknown.join(', ')}`)
      continue
    }
    if (result.done) return selected
  }
}

/**
 * Close `dependsOn` over what the user picked, asking about each dependency
 * they left out rather than deciding for them. Answering no drops the module
 * that needed it — see `resolveSelection` for why that beats overriding them.
 */
async function resolveInteractively(registry, picked, asker) {
  const pickable = registry.pickableModules().map((m) => m.id)
  const selected = new Set(picked)

  for (const mod of registry.pickableModules()) {
    if (!selected.has(mod.id)) continue
    for (const dep of registry
      .resolveEnabledModules([mod.id])
      .filter((id) => id !== mod.id && !selected.has(id))) {
      const depMod = registry.moduleById(dep)
      console.log(`\n  ${mod.label} needs ${depMod.label}: ${depMod.description}`)
      const answer = await asker.ask(`  Enable ${depMod.label} too? [Y/n] `)
      if (answer !== null && /^n/i.test(answer.trim())) {
        console.log(`  → Skipping ${mod.label}, then. It cannot run without ${depMod.label}.`)
        selected.delete(mod.id)
        break
      }
      console.log(`  → Enabling ${depMod.label} as well.`)
      selected.add(dep)
    }
  }

  const declined = pickable.filter((id) => !selected.has(id))
  return resolveSelection(registry, [...registry.coreModuleIds(), ...selected], { declined })
}

function install(dir) {
  console.log('\nInstalling dependencies …')
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
  try {
    execFileSync(npm, ['install'], { cwd: dir, stdio: 'inherit' })
    return true
  } catch {
    console.log('\n  ✗ npm install failed. The project is fine — run it yourself below.')
    return false
  }
}

/** Hand the scaffolding to the repo's own setup script, module list and all. */
function runSetup(dir, enabled) {
  console.log('')
  execFileSync('node', [path.join('scripts', 'setup.mjs')], {
    cwd: dir,
    stdio: 'inherit',
    env: { ...process.env, ACHIEVE_MODULES: enabled.join(',') },
  })
}

function printNextSteps(dir, enabled, installed) {
  const rel = path.relative(process.cwd(), dir) || '.'
  console.log(`\n✓ achieve is ready in ${rel}/`)
  console.log(`  Modules: ${enabled.join(', ')}`)
  console.log('\nNext:')
  console.log(`  cd ${rel}`)
  if (!installed) console.log('  npm install')
  console.log('  npm run dev        # dashboard at http://localhost:3000')
  console.log('\nThen open the Guide tab — it walks you through filling the vault.')
  console.log('Your data lives in vault/ (its own git repo, ignored by this one).')
  console.log('Change modules any time by editing vault/config.yaml;')
  console.log('upgrade with `git pull` — the vault is never touched.')
}

async function main() {
  const opts = parseCliArgs(process.argv.slice(2))
  if (opts.help) {
    console.log(USAGE)
    return
  }
  if (opts.version) {
    console.log(version())
    return
  }

  requireTypeStripping()
  requireGit()
  const dir = targetDir(opts.dir)
  clone(opts.from, dir)
  const registry = await loadRegistry(dir)

  let resolved
  if (isInteractive(opts)) {
    const asker = createAsker()
    try {
      resolved = await resolveInteractively(registry, await pickModules(registry, asker), asker)
    } finally {
      asker.close()
    }
  } else {
    resolved = resolveSelection(registry, requestedFromFlags(registry, opts))
  }

  if (resolved.added.length > 0) {
    console.log(`\n  (also enabling ${resolved.added.join(', ')} — required by your picks)`)
  }
  for (const { id, missing } of resolved.dropped) {
    console.log(`\n  (skipping ${id} — it needs ${missing.join(', ')}, which you turned down)`)
  }
  if (resolved.enabled.length === 0) {
    throw new CliError('That leaves no modules at all. Pick at least one.')
  }

  const installed = opts.install ? install(dir) : false
  runSetup(dir, resolved.enabled)
  printNextSteps(dir, resolved.enabled, installed)
}

main().catch((err) => {
  if (err instanceof CliError) {
    console.error(`\n✗ ${err.message}`)
    console.error(`\nRun \`npx create-achieve --help\` for the options.`)
    process.exit(1)
  }
  throw err
})
