# create-achieve

Install [achieve](https://github.com/davemac93/achieve) — a local-first,
open-source **personal operating system** — and pick the modules you want.

```bash
npx create-achieve my-os
```

The CLI clones the repo, asks which modules the vault should run, records the
answer in `vault/config.yaml`, scaffolds a blank vault for exactly those
modules, and prints how to start the dashboard.

It is **not** a code generator. What you get is a normal checkout that upgrades
with `git pull`, and module choices that stay editable afterwards.

## Options

| Flag | What it does |
| --- | --- |
| `--modules <a,b,c>` | enable exactly these modules (plus what they depend on) |
| `--all` | enable every module |
| `-y`, `--yes` | accept the recommended set without asking |
| `--from <url\|path>` | clone from a fork or a local checkout instead |
| `--no-install` | skip `npm install` |
| `-h`, `--help` / `-v`, `--version` | the usual |

```bash
npx create-achieve my-os --modules notes,goals,diary   # scripted / CI
npx create-achieve my-os --all
```

Modules that another module depends on come along automatically, with a notice.

## What it pulls

Nothing. This package has **no dependencies** — the prompt is node's own
`readline` — and the project it installs has no native or headless-browser
dependencies either. Requires Node 22.18+ (or 24+) and `git`.

## Docs

Everything else — what each module stores, the privacy boundary, the skills —
is in the [project README](https://github.com/davemac93/achieve#readme).

MIT licensed.
