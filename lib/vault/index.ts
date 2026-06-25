/**
 * Vault I/O foundation.
 *
 * Every read and write to the vault routes through this module so that two
 * invariants hold everywhere, for every caller (dashboard server actions and
 * Claude Code skills alike):
 *
 *   1. Atomic writes — a file is written to a temp sibling, fsync'd, then
 *      renamed over the target. A reader never observes a half-written file,
 *      and an interrupted write never leaves a partial file in place.
 *   2. One labeled git commit per mutation — the vault is its own git
 *      repository (the project repo gitignores `vault/`), and every successful
 *      write or remove produces exactly one commit. That history is the audit
 *      trail and the revert backstop. No file locking in v1.
 */

import { execFileSync } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse, stringify } from 'yaml'

/** Default vault location: `<repo root>/vault`. */
export function defaultVaultRoot(): string {
  const here = path.dirname(fileURLToPath(import.meta.url))
  return path.resolve(here, '..', '..', 'vault')
}

let tmpCounter = 0

export interface MutationOptions {
  /**
   * The git commit message — the audit label for this mutation. Convention:
   * `"<writer>: <action>"`, e.g. `"dashboard: add task"` or
   * `"/goals: write goal definitions"`.
   */
  message: string
}

export interface Vault {
  /** Absolute path of the vault root. */
  readonly root: string
  /** Resolve a vault-relative path to an absolute one (guards traversal). */
  resolve(relPath: string): string
  exists(relPath: string): Promise<boolean>
  read(relPath: string): Promise<string>
  readYaml<T = unknown>(relPath: string): Promise<T>
  /** Atomically write text, then commit exactly one labeled mutation. */
  write(relPath: string, content: string, opts: MutationOptions): Promise<void>
  /** Serialize to YAML, atomically write, then commit one labeled mutation. */
  writeYaml(relPath: string, data: unknown, opts: MutationOptions): Promise<void>
  /** Remove a file, then commit one labeled mutation. */
  remove(relPath: string, opts: MutationOptions): Promise<void>
}

/** Open a vault rooted at `root` (defaults to `<repo>/vault`). */
export function openVault(root: string = defaultVaultRoot()): Vault {
  const abs = path.resolve(root)

  function resolve(relPath: string): string {
    const target = path.resolve(abs, relPath)
    const rel = path.relative(abs, target)
    if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) {
      throw new Error(`Path escapes the vault: ${relPath}`)
    }
    return target
  }

  async function exists(relPath: string): Promise<boolean> {
    try {
      await fs.access(resolve(relPath))
      return true
    } catch {
      return false
    }
  }

  async function read(relPath: string): Promise<string> {
    return fs.readFile(resolve(relPath), 'utf8')
  }

  async function readYaml<T = unknown>(relPath: string): Promise<T> {
    return parse(await read(relPath)) as T
  }

  async function write(relPath: string, content: string, opts: MutationOptions): Promise<void> {
    const target = resolve(relPath)
    await atomicWrite(target, content)
    commitPath(abs, relPath, opts.message)
  }

  async function writeYaml(relPath: string, data: unknown, opts: MutationOptions): Promise<void> {
    // Serialize first so a serialization error aborts before touching disk.
    const text = stringify(data)
    await write(relPath, text, opts)
  }

  async function remove(relPath: string, opts: MutationOptions): Promise<void> {
    const target = resolve(relPath)
    await fs.rm(target, { force: false })
    commitPath(abs, relPath, opts.message)
  }

  return { root: abs, resolve, exists, read, readYaml, write, writeYaml, remove }
}

/**
 * Write `content` to `absPath` atomically: temp sibling → fsync → rename.
 * On any failure before the rename, the temp file is cleaned up and the
 * existing target is left untouched.
 */
async function atomicWrite(absPath: string, content: string): Promise<void> {
  const dir = path.dirname(absPath)
  await fs.mkdir(dir, { recursive: true })
  const tmp = path.join(dir, `.${path.basename(absPath)}.${process.pid}.${tmpCounter++}.tmp`)

  try {
    const fh = await fs.open(tmp, 'w')
    try {
      await fh.writeFile(content)
      await fh.sync() // flush data to disk before the rename
    } finally {
      await fh.close()
    }
    await fs.rename(tmp, absPath) // atomic replace on the same filesystem
  } catch (err) {
    await fs.rm(tmp, { force: true })
    throw err
  }

  // Best-effort: fsync the directory so the rename itself is durable.
  // Not supported on every platform (e.g. directory fsync fails on Windows).
  try {
    const dh = await fs.open(dir, 'r')
    try {
      await dh.sync()
    } finally {
      await dh.close()
    }
  } catch {
    /* directory fsync unsupported — acceptable */
  }
}

/**
 * Stage and commit exactly the given path. If the path has no pending change
 * (e.g. an identical rewrite), nothing is committed — that is not a mutation.
 */
function commitPath(root: string, relPath: string, message: string): void {
  git(root, ['add', '-A', '--', relPath])
  const status = git(root, ['status', '--porcelain', '--', relPath]).trim()
  if (status === '') return // no actual change
  git(root, ['commit', '--quiet', '-m', message, '--', relPath])
}

function git(cwd: string, args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' })
}
