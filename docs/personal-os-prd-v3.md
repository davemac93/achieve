# PRD — Personal OS (v3)

**Status:** Roadmap-level — depends on v1 and v2 shipping first
**Date:** 2026-06-25
**Source:** Roadmap in `/tmp/personal-os-prd.md` (v1 PRD) and `/tmp/personal-os-handoff.md`. Builds on v1+v2; does not restate their architecture.

> Fidelity note: v3 is the most speculative tier. Several items are explicitly demand-gated (notably Supabase). Treat the decisions here as the locked *direction*, with technology and interaction choices deferred to dedicated design passes at build time.

---

## Problem Statement

By the end of v2 the vault is a working knowledge system — goals, reviews, tasks, diary, notes, projects, learning — all local, all file-based, with the AI knowing who I am. Three limits remain. First, retrieval is still just Claude Code navigating files; as the vault grows into thousands of notes, structured/tag-based lookup starts missing things that semantic search would catch. Second, I want help pressure-testing new ideas and product directions before I invest in them, not just recording them. Third, the system is single-machine; if it gets real traction, people will want it on more than one device. v3 addresses growth, idea validation, and (only if warranted) reach.

## Solution

Four additions on top of v1+v2, each preserving the local-first, files-as-truth, privacy-respecting foundation:
1. An Idea/future-product validator skill that stress-tests an idea against my projects and profile and writes a verdict.
2. An optional local, file-based vector index so semantic retrieval is available once the vault outgrows tag/grep lookup — without breaking "git clone and go."
3. Obsidian integration polish, so the optional human viewer is a first-class experience.
4. Supabase as a sync/serving backend — strictly demand-gated, introduced only if real multi-device demand materializes, and only in its honest role as the sync layer (never the source of truth).

## User Stories

1. As a user, I want a validator skill that stress-tests an idea, so that I can find weaknesses before investing.
2. As a user, I want the validator to read my projects and profile, so that its critique is grounded in my actual context.
3. As a user, I want the validator to write a verdict/analysis note, so that I can revisit its reasoning later.
4. As a user, I want the validator to respect the diary and private-note boundaries, so that privacy holds.
5. As a user with a large vault, I want optional semantic search over my notes, so that I can recall things tag/keyword search misses.
6. As a user, I want the vector index to be local and file-based, so that I keep "git clone and go" with no server or pasted keys.
7. As a user, I want semantic search exposed to Claude Code as a tool, so that agents retrieve relevant context automatically.
8. As a user, I want the vector index to honor privacy boundaries, so that diary and private notes are never embedded or retrieved.
9. As a user, I want a polished Obsidian experience over my vault, so that the optional human viewer is pleasant to use.
10. As a user with multiple devices, I want optional sync, so that I can access my vault from more than one machine.
11. As a user, I want sync to be opt-in, so that single-machine users pay no complexity cost.
12. As a user, I want files to remain the source of truth even with sync, so that I keep ownership and local-first guarantees.

## Implementation Decisions

Reuse all v1+v2 infrastructure unchanged. Every v3 component must preserve: files-as-truth, atomic-write + git-commit, `diary/` off-limits to all AI, `private` notes agent-excluded, and the "git clone and go / no required database or keys" promise for the core product.

**Idea/future-product validator skill.** A Claude Code SKILL.md, on-demand. Reads `projects/` + `user.md`; stress-tests an idea (a grill-me-style interrogation is a natural fit); writes a verdict note (type `validation`). Never reads `diary/` or `private` notes. Interaction shape is OPEN — recommend a focused design pass; reuse the v2 `/note` write path for its output.

**Optional local vector index.** File-based, local, no server (candidate technologies: sqlite-vec or LanceDB — OPEN, decide at build time). Pipeline: chunk non-private prose → embed → store in the local index → expose a `search_vault(query)` tool to Claude Code via an MCP tool or skill. Strictly OPTIONAL: the core product still works with plain file navigation; the index is an add-on a user opts into when their vault is large. Must exclude `diary/` and `private` notes from embedding. Embedding model choice (local vs hosted) is OPEN, but the default must not reintroduce a required API key for the core experience.

**Obsidian polish.** Obsidian remains an external optional viewer pointed at the vault. "Polish" = conventions/templates/recommended plugins and documentation that make browsing the vault (backlinks, frontmatter, note types) a good experience. No change to source-of-truth or to the dashboard.

**Supabase (demand-gated).** Introduced ONLY if real multi-device demand exists. Role: sync/serving backend, NOT the brain — files remain source of truth; Supabase mirrors them for multi-device access. This reverses the v1 "drop Supabase" decision only under proven demand, and must stay opt-in so single-machine users are unaffected. Two-way sync and conflict resolution are the hard part and need their own design pass. The user has a Supabase account available if/when this is built.

## Testing Decisions

Same philosophy: assert external behavior against controlled inputs; never implementation details.
- **Validator privacy + file-effect.** Asserts a verdict note is written correctly AND that `diary/` and `private` notes are never read (extends the v1/v2 privacy tests).
- **Vector index correctness + privacy.** Given a known corpus, assert relevant chunks are retrieved for a query; assert `diary/` and `private` content is never embedded or returned. Assert the core product still functions with the index absent (optionality).
- **Sync (if built).** Assert files remain source of truth, that sync is opt-in (absent by default), and exercise conflict-resolution behavior under concurrent edits. This is the riskiest suite and warrants the most coverage.
- **Obsidian polish** is largely documentation/config — no automated behavior tests beyond validating any shipped templates parse correctly.

## Out of Scope (v3)

- Making any v3 component mandatory — the vector index, Obsidian, and Supabase sync are all optional/demand-gated.
- Multi-user / hosted SaaS / accounts beyond single-user multi-device sync.
- Reintroducing a database as the source of truth (Supabase stays a sync layer only).
- Any change that breaks "git clone and go" for the core local product.

## Open Decisions (resolve before building the affected slice)

- **Vector index technology** (sqlite-vec vs LanceDB vs other) and **embedding model** (local vs hosted) — must keep the core key-free.
- **Validator interaction model** — focused design pass; grill-me style is the leading candidate.
- **Whether multi-device demand is real enough to build Supabase sync at all** — this is a go/no-go gate, not an assumed build.
- **Two-way sync conflict-resolution strategy**, if Supabase proceeds.
