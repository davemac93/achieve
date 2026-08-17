/**
 * The picker's decisions, with no I/O in them.
 *
 * Everything here takes the **module registry of the repo that was just
 * cloned** as an argument — never a copy of it. That is the whole anti-drift
 * bargain of this CLI: the questions it asks, the defaults it pre-ticks and the
 * dependencies it closes over are the ones that version of achieve actually
 * ships, not a list maintained in parallel over here.
 *
 * Split out from `index.mjs` so the resolution rules can be tested directly
 * (`tests/create-achieve.test.ts`) without cloning anything.
 */

import { parseArgs } from 'node:util'

/**
 * The registry's own types, borrowed for editor and `tsc` help. These are
 * compile-time-only references resolved when the repo typechecks its tests;
 * the published package ships neither `lib/` nor any runtime import of it.
 *
 * @typedef {import('../../lib/modules/registry.ts').ModuleId} ModuleId
 * @typedef {import('../../lib/modules/registry.ts').ModuleDefinition} ModuleDefinition
 * @typedef {typeof import('../../lib/modules/registry.ts')} Registry
 */

/** Where the project is cloned from unless `--from` says otherwise. */
export const DEFAULT_REPO = 'https://github.com/davemac93/achieve.git'

/** Directory created when the command is given no positional argument. */
export const DEFAULT_DIR = 'achieve'

/**
 * A refusal the user can act on. `main` prints the message alone — no stack —
 * because every one of these is a mistake in the command, not a crash.
 */
export class CliError extends Error {}

/**
 * Parse `process.argv.slice(2)`.
 *
 * @param {string[]} argv
 * @returns {{ dir: string, modules: string[] | null, all: boolean, yes: boolean,
 *   from: string, install: boolean, help: boolean, version: boolean }}
 */
export function parseCliArgs(argv) {
  let parsed
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        modules: { type: 'string' },
        all: { type: 'boolean', default: false },
        yes: { type: 'boolean', short: 'y', default: false },
        from: { type: 'string', default: DEFAULT_REPO },
        // Hyphenated rather than a negated `--install`: node's parseArgs has no
        // notion of negation, so the flag is simply its own name.
        'no-install': { type: 'boolean', default: false },
        help: { type: 'boolean', short: 'h', default: false },
        version: { type: 'boolean', short: 'v', default: false },
      },
    })
  } catch (err) {
    throw new CliError(/** @type {Error} */ (err).message)
  }

  const { values, positionals } = parsed
  if (positionals.length > 1) {
    throw new CliError(
      `Expected one directory, got ${positionals.length}: ${positionals.join(' ')}`,
    )
  }
  if (values.all && values.modules !== undefined) {
    throw new CliError('Pass either --all or --modules, not both.')
  }

  return {
    dir: positionals[0] ?? DEFAULT_DIR,
    modules: values.modules === undefined ? null : splitIds(values.modules),
    all: values.all,
    yes: values.yes,
    from: values.from ?? DEFAULT_REPO,
    install: !values['no-install'],
    help: values.help,
    version: values.version,
  }
}

/** `a, b,,c` → `['a', 'b', 'c']`. */
export function splitIds(raw) {
  return raw
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean)
}

/**
 * Whether the run asks questions at all. Any flag that names the module set is
 * an answer already, and CI passes one.
 *
 * @param {{ modules: string[] | null, all: boolean, yes: boolean }} opts
 */
export function isInteractive(opts) {
  return opts.modules === null && !opts.all && !opts.yes
}

/**
 * The module set a flag-driven run asks for, before dependencies are closed
 * over. `null` means "no flag said" — the interactive picker decides.
 *
 * `--modules` is taken **literally** (dependencies aside): it is the scripted
 * path, the same contract as `ACHIEVE_MODULES=… npm run setup`, and a list that
 * quietly grew would be no use in CI. The `core` preset only pre-fills the
 * interactive picker and `--yes`.
 *
 * @param {Registry} registry
 * @param {{ modules: string[] | null, all: boolean, yes: boolean }} opts
 * @returns {string[] | null}
 */
export function requestedFromFlags(registry, opts) {
  if (opts.all) return registry.MODULES.map((m) => m.id)
  if (opts.modules !== null) return opts.modules
  if (opts.yes) return registry.defaultModuleIds()
  return null
}

/**
 * Close `dependsOn` over a selection.
 *
 * Two outcomes, and which one applies turns on whether the user *said no* to
 * the dependency or merely never mentioned it:
 *
 * - not mentioned → the dependency is **added**, and the caller says so. This
 *   is what `--modules jobs` does, matching `npm run setup`.
 * - explicitly declined → the module that needs it is **dropped**, with the
 *   reason. Installing Jobs after the user turned Profile down would hand them
 *   a CV skill with no facts it is allowed to use; quietly overriding the
 *   answer they just gave is worse than not installing the module.
 *
 * @param {Registry} registry
 * @param {readonly string[]} requested
 * @param {{ declined?: readonly string[] }} [options]
 * @returns {{ enabled: ModuleId[], added: ModuleId[],
 *   dropped: { id: ModuleId, missing: ModuleId[] }[] }}
 */
export function resolveSelection(registry, requested, options = {}) {
  const unknown = requested.filter((id) => !registry.isModuleId(id))
  if (unknown.length > 0) {
    throw new CliError(
      `Unknown module id(s): ${unknown.join(', ')}\n` +
        `Known modules: ${registry.MODULES.map((m) => m.id).join(', ')}`,
    )
  }

  const declined = new Set(options.declined ?? [])
  /** @type {ModuleId[]} */
  const kept = []
  /** @type {{ id: ModuleId, missing: ModuleId[] }[]} */
  const dropped = []
  for (const id of /** @type {ModuleId[]} */ (requested)) {
    const missing = dependenciesOf(registry, id).filter((dep) => declined.has(dep))
    if (missing.length > 0) dropped.push({ id, missing })
    else kept.push(id)
  }

  const enabled = registry.resolveEnabledModules(kept)
  const keptSet = new Set(kept)
  return { enabled, added: enabled.filter((id) => !keptSet.has(id)), dropped }
}

/**
 * Everything a module needs, transitively — the registry's own closure, minus
 * the module itself, so there is no second implementation of it here.
 *
 * @param {Registry} registry
 * @param {ModuleId} id
 * @returns {ModuleId[]}
 */
export function dependenciesOf(registry, id) {
  return registry.resolveEnabledModules([id]).filter((dep) => dep !== id)
}

/**
 * Apply one line of picker input to the current selection.
 *
 * Accepts module ids and the row numbers shown next to them, plus `all` and
 * `none`; an empty line means "done". Unrecognized entries come back rather
 * than being ignored, so a typo re-asks instead of silently installing the
 * wrong thing.
 *
 * @param {Registry} registry
 * @param {readonly string[]} selected currently ticked pickable ids
 * @param {string} input
 * @returns {{ selected: ModuleId[], unknown: string[], done: boolean }}
 */
export function applyToggles(registry, selected, input) {
  const pickable = registry.pickableModules()
  const entries = splitIds(input.replace(/\s+/g, ','))
  if (entries.length === 0) return { selected: order(pickable, selected), unknown: [], done: true }

  const word = entries[0].toLowerCase()
  if (entries.length === 1 && (word === 'all' || word === 'none')) {
    return {
      selected: word === 'all' ? pickable.map((m) => m.id) : [],
      unknown: [],
      done: false,
    }
  }

  const next = new Set(selected)
  /** @type {string[]} */
  const unknown = []
  for (const entry of entries) {
    const byNumber = /^\d+$/.test(entry) ? pickable[Number(entry) - 1] : undefined
    const mod = byNumber ?? pickable.find((m) => m.id === entry.toLowerCase())
    if (!mod) {
      unknown.push(entry)
      continue
    }
    if (next.has(mod.id)) next.delete(mod.id)
    else next.add(mod.id)
  }
  return { selected: order(pickable, [...next]), unknown, done: false }
}

/** Keep a selection in registry order, whatever order it was typed in. */
function order(pickable, ids) {
  const set = new Set(ids)
  return pickable.filter((m) => set.has(m.id)).map((m) => m.id)
}

/**
 * The picker itself, as lines of text. Generated from the registry every time
 * it is drawn, numbering only what can actually be toggled.
 *
 * @param {Registry} registry
 * @param {readonly string[]} selected
 * @returns {string[]}
 */
export function renderPicker(registry, selected) {
  const core = registry.MODULES.filter((m) => m.preset === 'core')
  const pickable = registry.pickableModules()
  const ticked = new Set(selected)
  const pad = Math.max(...registry.MODULES.map((m) => m.id.length))
  const gutter = String(pickable.length).length

  const lines = ['Which modules should this vault run?', '']
  lines.push('  Always installed:')
  for (const mod of core) {
    lines.push(`    ${''.padStart(gutter)}    ${mod.id.padEnd(pad)}  ${mod.description}`)
  }
  lines.push('')
  pickable.forEach((mod, i) => {
    const mark = ticked.has(mod.id) ? 'x' : ' '
    lines.push(
      `  ${String(i + 1).padStart(gutter)} [${mark}] ${mod.id.padEnd(pad)}  ${mod.description}`,
    )
  })
  return lines
}

/** The one-line prompt under the list. */
export const PICKER_PROMPT =
  'Enter to accept · numbers or ids to toggle (e.g. "3,jobs") · "all" · "none"\n> '
